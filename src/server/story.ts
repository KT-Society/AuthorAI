/**
 * Server-only story engine.
 *
 * Three stages of the book pipeline:
 *   1. generateStoryboard  – idea -> structured storyboard
 *   2. draftChapter        – plan -> ~500 word rough draft
 *   3. expandChapter       – rough -> 3000-5000 word full chapter with craft rules
 *
 * The storyboard is generated in two phases (outline with exactly N chapter
 * titles, then chapter details in batches) so large chapter counts don't get
 * truncated and the output language stays consistent.
 *
 * This module must NEVER be imported by client code.
 */

import { ApiError } from "@promptgen/server/api";

import {
  EXPAND_DEFAULT_WORDS,
  EXPAND_MAX_WORDS,
  EXPAND_MIN_WORDS,
  MAX_CHAPTERS,
  MIN_CHAPTERS,
  countWords,
} from "../data/story";
import type {
  ChapterPlan,
  SceneConstraint,
  Storyboard,
  StoryCharacter,
  StoryWorld,
  WorldItem,
} from "../data/story";
import { EMPTY_WORLD } from "../data/story";
import {
  chatCompletion,
  chatCompletionDetailed,
  chatCompletionStream,
  cleanJsonBlock,
} from "./llm";
import { extractProse, looksTruncated } from "../lib/prose";
import { filterNoOpNotes } from "../lib/passNotes";
import { normalizeWorldTitle } from "../lib/worldMatch";
import { normalizeCharacterName } from "../lib/characterMatch";
import { normalizeName } from "../lib/nameMatch";
import { consumeJsonlText, createJsonlConsumer, jsonlFormatBlock } from "./jsonl";

export interface StoryboardInput {
  idea: string;
  model: string;
  language: string;
  chapters: number;
  /** Reihen-Kontext (Vorbände + Kanon) — der neue Band setzt die Reihe fort. */
  seriesContext?: string;
}

const BATCH_SIZE = 8;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function clampChapters(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 12;
  return Math.max(MIN_CHAPTERS, Math.min(MAX_CHAPTERS, Math.round(parsed)));
}

/**
 * Räumt Modellantworten auf, die JSON in Prosa einbetten: erst Fences entfernen, dann den
 * äußersten `{…}`-Block herausschneiden („Hier ist das JSON: {…} Hinweis: …").
 */
function jsonCandidate(content: string): string {
  const cleaned = cleanJsonBlock(content).trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) return cleaned.slice(start, end + 1);
  return cleaned;
}

function parseJson(content: string, label: string): Record<string, unknown> {
  try {
    return JSON.parse(jsonCandidate(content)) as Record<string, unknown>;
  } catch {
    console.error(`[story] invalid JSON (${label}):`, content.slice(0, 400));
    throw new ApiError(
      `Das ${label}-JSON war ungültig. Bitte erneut versuchen oder ein anderes Modell wählen.`,
      502,
    );
  }
}

/** Strong, repeated language instruction used in every prompt. */
export function languageLock(language: string): string {
  return `OUTPUT LANGUAGE: ${language}.
Every string value — titles, summaries, beats, foreshadowing, descriptions, roles — MUST be written in ${language}.
Do NOT switch to English at any point, especially not for later chapters.`;
}

interface OutlineMeta {
  title: string;
  subtitle: string;
  genre: string;
  logline: string;
  synopsis: string;
  themes: string[];
  tone: string;
  pov: string;
  characters: StoryCharacter[];
  world: StoryWorld;
}

function normalizeWorldItems(value: unknown): WorldItem[] {
  return (Array.isArray(value) ? value : [])
    .map((entry) => {
      const item = asRecord(entry);
      return { name: str(item.name), description: str(item.description) };
    })
    .filter((item) => item.name.length > 0);
}

function normalizeWorld(value: unknown): StoryWorld {
  if (!value || typeof value !== "object") return { ...EMPTY_WORLD };
  const obj = asRecord(value);
  return {
    locations: normalizeWorldItems(obj.locations),
    factions: normalizeWorldItems(obj.factions),
    magic: normalizeWorldItems(obj.magic),
    artifacts: normalizeWorldItems(obj.artifacts),
    lore: normalizeWorldItems(obj.lore),
  };
}

function storyArchitectSystem(language: string, chapters: number): string {
  return `You are a bestselling story architect and developmental editor.
Turn the user's raw book idea into a structured storyboard outline.

${languageLock(language)}

STRUCTURE & CLOSURE (mandatory):
- Divide the ${chapters} chapters into a COMPLETE three-act arc: Act I ≈ first 25%, Act II ≈ middle 50% (with a clear midpoint turn), Act III ≈ final 25%.
- The central conflict MUST reach its climax and be RESOLVED within the final chapter (#${chapters}). Do NOT end on an unresolved cliffhanger unless the user explicitly asked for a series.
- The final 1-2 chapter titles must reflect the resolution/climax.
- Escalate the stakes each act; no filler chapters; every chapter advances plot AND character.

Respond ONLY with a single valid JSON object (double quotes, no comments, no markdown):
{
  "title": string,
  "subtitle": string,
  "genre": string,
  "logline": string,
  "synopsis": string,
  "themes": string[],
  "tone": string,
  "pov": string,
  "characters": [{ "name": string, "role": string, "description": string }],
  "world": {
    "locations": [{ "name": string, "description": string }],
    "factions": [{ "name": string, "description": string }],
    "magic": [{ "name": string, "description": string }],
    "artifacts": [{ "name": string, "description": string }],
    "lore": [{ "name": string, "description": string }]
  },
  "chapterTitles": string[]
}
Rules:
- "chapterTitles" MUST contain EXACTLY ${chapters} entries, in narrative order. Never fewer.
- Each title: 2-6 words, evocative, no leading numbers ("1.").
- "world": 3-8 entries per category (fewer only if truly none); short names, 1-2 sentence descriptions.
- Titles MUST be in ${language}.`;
}

function chapterDetailSystem(language: string): string {
  return `You are a story architect detailing specific chapters of an already fixed outline.

${languageLock(language)}

Respond ONLY with a single valid JSON object:
{ "chapters": [{ "index": number, "summary": string, "pov": string, "setting": string, "beats": string[], "foreshadowing": string[] }] }
Rules:
- Return one entry for EVERY requested index, in order. Never fewer.
- "index" is the 1-based chapter number as given.
- summary: 2-4 sentences (what happens and what changes).
- beats: 3-6 concrete beats.
- foreshadowing: 1-3 planted details (may be empty for the final chapters).
- The LAST chapter must deliver the climax and resolve the central conflict — never an open ending.
- All text MUST be in ${language}.`;
}

function detailUser(
  meta: OutlineMeta,
  titles: string[],
  start: number,
  end: number,
  seriesContext?: string,
): string {
  const characters = meta.characters
    .map((character) => `- ${character.name} (${character.role}): ${character.description}`)
    .join("\n");

  const fullList = titles.map((title, index) => `${index + 1}. ${title}`).join("\n");
  const batchList = titles
    .slice(start, end)
    .map((title, index) => `${start + index + 1}. ${title}`)
    .join("\n");

  return `STORY CONTEXT
TITLE: ${meta.title}
GENRE: ${meta.genre}
TONE: ${meta.tone}
POV: ${meta.pov}
LOGLINE: ${meta.logline}
SYNOPSIS: ${meta.synopsis}
THEMES: ${meta.themes.join(", ")}
CHARACTERS:
${characters || "- (none specified)"}

FULL CHAPTER LIST (for continuity, do not rename):
${fullList}

DETAIL EXACTLY THESE CHAPTERS (indices ${start + 1}..${end}):
${batchList}

REMINDER: the whole story must be fully resolved by chapter ${titles.length}. If this batch contains the finale, its summary must describe the climax and resolution.${
    seriesContext?.trim() ? `\n\n${seriesContext.trim()}` : ""
  }

Return the JSON with one entry per requested index.`;
}

function normalizeMeta(outline: Record<string, unknown>): OutlineMeta {
  const charactersRaw = Array.isArray(outline.characters) ? outline.characters : [];
  const characters = charactersRaw
    .map((entry) => {
      const character = asRecord(entry);
      return {
        name: str(character.name),
        role: str(character.role),
        description: str(character.description),
      };
    })
    .filter((character) => character.name.length > 0);

  return {
    title: str(outline.title, "Ohne Titel"),
    subtitle: str(outline.subtitle),
    genre: str(outline.genre),
    logline: str(outline.logline),
    synopsis: str(outline.synopsis),
    themes: strArray(outline.themes),
    tone: str(outline.tone),
    pov: str(outline.pov),
    characters,
    world: normalizeWorld(outline.world),
  };
}

function normalizeChapter(entry: unknown, index: number, fallbackTitle: string): ChapterPlan {
  const chapter = asRecord(entry);
  return {
    index,
    title: str(chapter.title, fallbackTitle),
    summary: str(chapter.summary),
    pov: str(chapter.pov),
    setting: str(chapter.setting),
    beats: strArray(chapter.beats),
    foreshadowing: strArray(chapter.foreshadowing),
  };
}

/**
 * Callbacks eines gestreamten Storyboard-Entwurfs.
 *
 * Der Entwurf ist **keine** Prosa (die Antworten sind JSON) — sinnvoll ist deshalb kein
 * Text-Delta, sondern der Fortschritt: Phase, fertige Kapitel-Titel und Detail-Batches.
 */
export interface StoryboardStreamHandlers {
  /** Eine Phase beginnt: `outline` (Metadaten + Kapiteltitel) oder `chapters` (Details). */
  onPhase?: (phase: "outline" | "chapters") => void;
  /** Die Kapiteltitel stehen fest (nach der Outline) — ab hier live sichtbar. */
  onTitles?: (titles: string[]) => void;
  /** Ein Detail-Batch ist fertig (Kapitel-Details). */
  onBatch?: (done: number, total: number) => void;
}

export async function generateStoryboard(
  input: StoryboardInput,
  handlers?: StoryboardStreamHandlers,
): Promise<Storyboard> {
  const chapters = clampChapters(input.chapters);
  const language = input.language;

  // Phase 1: outline — metadata + exactly N chapter titles.
  handlers?.onPhase?.("outline");
  const outlineRaw = await chatCompletion({
    model: input.model,
    system: storyArchitectSystem(language, chapters),
    user: `BOOK IDEA:\n${input.idea}${
      input.seriesContext?.trim() ? `\n\n${input.seriesContext.trim()}` : ""
    }\n\nCreate the storyboard outline with EXACTLY ${chapters} chapter titles now as JSON.`,
    json: true,
    maxTokens: 3000,
    temperature: 0.85,
  });
  const outline = parseJson(outlineRaw, "Storyboard-Outline");
  const meta = normalizeMeta(outline);

  // Guarantee exactly N titles in the requested language.
  const rawTitles = strArray(outline.chapterTitles);
  const titles: string[] = [];
  for (let index = 0; index < chapters; index += 1) {
    titles.push(rawTitles[index]?.trim() || `Kapitel ${index + 1}`);
  }
  handlers?.onTitles?.(titles);

  // Phase 2: detail chapters in batches (keeps every response small).
  handlers?.onPhase?.("chapters");
  const totalBatches = Math.max(1, Math.ceil(chapters / BATCH_SIZE));
  const plans: ChapterPlan[] = [];
  let batchesDone = 0;
  for (let start = 0; start < chapters; start += BATCH_SIZE) {
    const end = Math.min(chapters, start + BATCH_SIZE);
    const batchRaw = await chatCompletion({
      model: input.model,
      system: chapterDetailSystem(language),
      user: detailUser(meta, titles, start, end, input.seriesContext),
      json: true,
      maxTokens: 3500,
      temperature: 0.85,
    });
    const parsed = parseJson(batchRaw, `Kapitel ${start + 1}-${end}`);
    const list = Array.isArray(parsed.chapters) ? parsed.chapters : [];

    for (let index = start; index < end; index += 1) {
      const byIndex = list.find((entry) => {
        const value = asRecord(entry).index;
        const numeric = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
        return numeric === index + 1;
      });
      const entry = byIndex ?? list[index - start];
      plans.push(normalizeChapter(entry, index, titles[index] ?? `Kapitel ${index + 1}`));
    }
    batchesDone += 1;
    handlers?.onBatch?.(batchesDone, totalBatches);
  }

  return { ...meta, chapters: plans };
}

export interface ChapterInput {
  storyboard: Storyboard;
  chapterIndex: number;
  model: string;
  language: string;
  scenes?: SceneConstraint[];
  /** Verbindlicher Kanon-Block (Fakten + Beziehungen) aus dem Projekt. */
  canon?: string;
}

/** Rendert die verbindlichen Szenen (oder fällt auf die Plan-Beats zurück). */
function sceneBlock(scenes: SceneConstraint[] | undefined, fallbackBeats: string[]): string {
  if (!scenes || scenes.length === 0) {
    return fallbackBeats.length > 0
      ? fallbackBeats.map((beat) => `- ${beat}`).join("\n")
      : "- (none)";
  }

  return scenes
    .map((scene, index) => {
      const meta = [
        scene.pov ? `POV: ${scene.pov}` : "",
        scene.setting ? `Setting: ${scene.setting}` : "",
        scene.time ? `Time: ${scene.time}` : "",
        scene.words ? `Target: ~${scene.words} words` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      const characters =
        scene.characters.length > 0 ? `\n   Characters present: ${scene.characters.join(", ")}` : "";
      return `${index + 1}. ${scene.text}${meta ? `\n   ${meta}` : ""}${characters}`;
    })
    .join("\n");
}

function storyboardContext(
  storyboard: Storyboard,
  chapter: ChapterPlan,
  scenes?: SceneConstraint[],
  canon?: string,
): string {
  const characters = storyboard.characters
    .map((character) => `- ${character.name} (${character.role}): ${character.description}`)
    .join("\n");

  const canonPart = canon?.trim() ? `\n\n${canon.trim()}` : "";

  return `TITLE: ${storyboard.title}
GENRE: ${storyboard.genre}
TONE: ${storyboard.tone}
POV: ${storyboard.pov}
LOGLINE: ${storyboard.logline}
SYNOPSIS: ${storyboard.synopsis}
THEMES: ${storyboard.themes.join(", ")}

CHARACTERS:
${characters || "- (none specified)"}

CHAPTER ${chapter.index + 1}: ${chapter.title}
SETTING: ${chapter.setting}
POV: ${chapter.pov}
SUMMARY: ${chapter.summary}
SCENES (binding — follow in this order):
${sceneBlock(scenes, chapter.beats)}
FORESHADOWING:
${chapter.foreshadowing.map((item) => `- ${item}`).join("\n") || "- (none)"}${canonPart}`;
}

function roughDraftSystem(language: string): string {
  return `You are a novelist writing a fast, rough first draft of a single chapter.
${languageLock(language)}
Write ONLY the chapter prose — no headings, no titles, no commentary, no bullet points.
Target roughly 500 words. Prioritise forward motion over polish: get the scene, the conflict and the turn on the page.
The SCENES block in the context is BINDING: keep the scenes in the given order, honour each scene's POV, setting and time, and let every listed character appear in that scene.
End on a hook that makes the next chapter inevitable.
Write ALL prose in ${language}.`;
}

export async function draftChapter(
  input: ChapterInput,
  onDelta?: (text: string) => void,
): Promise<string> {
  const chapter = input.storyboard.chapters[input.chapterIndex];
  if (!chapter) {
    throw new ApiError("Kapitel nicht gefunden.", 400);
  }

  const user = `${storyboardContext(input.storyboard, chapter, input.scenes, input.canon)}

OUTPUT LANGUAGE: ${input.language}
Write the ~500 word rough draft of this chapter now.`;

  const draftParams = {
    model: input.model,
    system: roughDraftSystem(input.language),
    user,
    maxTokens: 2000,
    temperature: 0.9,
  };
  // Mit Callback streamen (Live-Vorschau), sonst normal anfragen.
  const { content: draftContent, finishReason: draftFinish } = onDelta
    ? await chatCompletionStream(draftParams, onDelta)
    : await chatCompletionDetailed(draftParams);
  const draftSystem = roughDraftSystem(input.language);

  return completeProse({
    model: input.model,
    system: draftSystem,
    language: input.language,
    text: stripLeadingHeadings(extractProse(draftContent)),
    label: "rough draft",
    truncated: draftFinish === "length",
    onDelta,
  });
}

function expansionSystem(language: string, target: number): string {
  return `You are an award-winning novelist doing a full expansion pass on a chapter.
${languageLock(language)}
Rewrite and expand the rough draft into a complete, publication-quality chapter of AT LEAST ${target} words.

CRAFT RULES (all mandatory):
- LENGTH: write at least ${target} words. Do not stop early and do not summarise — expand with scene, dialogue and interiority.
- PACING: build scenes with goal -> conflict -> turn; vary sentence length; slow down at emotional peaks, speed up in action.
- SHOW, DON'T TELL: render emotion through action, dialogue, sensory detail and subtext. Never state a feeling the reader can infer.
- FORESHADOWING: thread in the planted details naturally; no telegraphing.
- VOICE: keep every character's voice distinct and consistent with their description.
- SENSORY GROUNDING: concrete sights, sounds, smells, textures of the setting.
- SUBTEXT: dialogue carries what characters avoid saying.
- No purple prose, no clichés, no filler, no repetition of the same beat.
- SCENES: the binding SCENES block defines the chapter's structure — keep the scenes in order, honour each scene's POV/setting/time, and make every listed character appear in that scene.
- Keep all plot beats and the ending direction intact, but you may add interiority, dialogue and connective tissue.
- End the chapter on a hook or an emotional turn.

FORMAT: output ONLY the chapter prose in ${language}. Absolutely NO markdown, NO bold, NO headings, NO chapter titles, NO commentary.
If you approach your output limit, finish the current sentence and stop — you will be asked to continue.`;
}

/** Removes leading markdown headings / bold title lines a model may prepend. */
function stripLeadingHeadings(text: string): string {
  const lines = text.split(/\r?\n/);
  let index = 0;
  while (index < lines.length) {
    const line = (lines[index] ?? "").trim();
    if (line === "") {
      index += 1;
      continue;
    }
    const isHeading =
      /^#{1,6}\s/.test(line) || /^\*\*[^*]+\*\*:?$/.test(line) || /^Kapitel\s+\d+/i.test(line);
    if (isHeading) {
      index += 1;
      continue;
    }
    break;
  }
  return lines.slice(index).join("\n").trim();
}

/**
 * Modelle brechen trotz Auftrag mitten im Satz ab (Token-Limit oder "lite"-Modell).
 * Diese Funktion setzt die Prosa fort, bis sie auf einem Satzende steht.
 */
/** Obergrenze einer einzelnen Fortsetzung — eine Ergänzung, keine neue Szene. */
const CONTINUATION_MAX_WORDS = 600;
/** Maximal zwei Fortsetzungs-Schritte (jeder davon nur bei hartem Token-Limit). */
const CONTINUATION_MAX_DEPTH = 2;

/**
 * Schreibt eine **wirklich** am Token-Limit abgebrochene Prosa zu Ende.
 *
 * Wichtig: nur bei hartem Signal (`finish_reason: "length"`) — ein normal beendeter Text
 * wird nie verlängert. Sonst hängt die Pipeline unbemerkt Prosa an (Kapitel wachsen
 * von 4.000 auf 12.000 Wörter). Die Länge der Ergänzung ist zusätzlich gedeckelt.
 */
async function completeProse(
  params: {
    model: string;
    system: string;
    language: string;
    text: string;
    label: string;
    /** Vom Modell gemeldet: die Antwort lief ins Ausgabelimit. */
    truncated: boolean;
    /** Live-Vorschau: Textstücke der Fortsetzung (gleiche Prosa, lückenlos). */
    onDelta?: (text: string) => void;
  },
  depth = 0,
): Promise<string> {
  if (!params.truncated || depth >= CONTINUATION_MAX_DEPTH) return params.text;

  const tail = params.text.slice(-2000);
  const continuationParams = {
    model: params.model,
    system: params.system,
    user: `${languageLock(params.language)}
CONTINUATION REQUEST: the ${params.label} below was cut off by the output limit.
Finish ONLY the current sentence and the current paragraph — same voice, same tense, same scene.
Do NOT repeat anything, do NOT restart, do NOT add headings, titles, notes or markers, do NOT summarise.
Do NOT open a new scene and do NOT introduce new plot. One short bridge at most.

END OF THE ${params.label.toUpperCase()} SO FAR (for continuity):
...${tail}

Finish the paragraph now, entirely in ${params.language}.`,
    maxTokens: 900,
    temperature: 0.7,
  };
  // Mit Callback streamen (die Vorschau läuft lückenlos weiter), sonst normal anfragen.
  const { content, finishReason } = params.onDelta
    ? await chatCompletionStream(continuationParams, params.onDelta)
    : await chatCompletionDetailed(continuationParams);

  const appended = extractProse(stripLeadingHeadings(content.trim()));
  if (!appended) return params.text;
  // Sicherung: eine Fortsetzung darf den Text nicht aufblähen.
  if (countWords(appended) > CONTINUATION_MAX_WORDS) return params.text;

  const text = `${params.text}\n\n${appended}`;

  // Auch die Fortsetzung kann erneut ins Limit laufen — dann genau ein weiterer Versuch.
  if (finishReason === "length") {
    return completeProse({ ...params, text, truncated: true }, depth + 1);
  }
  return text;
}

export interface ExpandInput extends ChapterInput {
  draft: string;
  targetWords: number;
}

export async function expandChapter(
  input: ExpandInput,
  onDelta?: (text: string) => void,
): Promise<string> {
  const chapter = input.storyboard.chapters[input.chapterIndex];
  if (!chapter) {
    throw new ApiError("Kapitel nicht gefunden.", 400);
  }

  const target = Math.max(
    EXPAND_MIN_WORDS,
    Math.min(EXPAND_MAX_WORDS, Number.isFinite(input.targetWords) ? input.targetWords : EXPAND_DEFAULT_WORDS),
  );

  const system = expansionSystem(input.language, target);
  const user = `${storyboardContext(input.storyboard, chapter, input.scenes, input.canon)}

OUTPUT LANGUAGE: ${input.language}
TARGET LENGTH: at least ${target} words.

ROUGH DRAFT TO EXPAND:
${input.draft.trim() || "(none provided — write the full chapter from the plan)"}

Write the complete ${target}-word chapter now, entirely in ${input.language}.`;

  const expandParams = {
    model: input.model,
    system,
    user,
    maxTokens: 8000,
    temperature: 0.85,
  };
  // Erster (großer) Aufruf: mit Callback streamen (Live-Vorschau), sonst normal.
  const firstContent = onDelta
    ? (await chatCompletionStream(expandParams, onDelta)).content
    : await chatCompletion(expandParams);

  let text = stripLeadingHeadings(firstContent.trim());

  // Continuation loop: models (especially "lite" ones) often stop short of the target.
  let words = countWords(text);
  let attempts = 0;
  let lastFinish: string | undefined;
  while (words < target * 0.9 && attempts < 3) {
    attempts += 1;
    const remaining = Math.max(300, target - words);
    const tail = text.slice(-2000);
    const continuationParams = {
      model: input.model,
      system,
      user: `${languageLock(input.language)}
CONTINUATION REQUEST: the chapter below currently has ${words} words and must reach at least ${target}.
Continue the prose seamlessly from where it stops. Do NOT repeat anything, do NOT restate the title, do NOT add headings.
Write at least ${remaining} more words and end on a hook.

END OF THE CHAPTER SO FAR (for continuity):
...${tail}

Continue now, entirely in ${input.language}.`,
      maxTokens: 8000,
      temperature: 0.85,
    };
    // Mit Callback streamen — sonst endet die Live-Vorschau mitten im Kapitel.
    const { content, finishReason } = onDelta
      ? await chatCompletionStream(continuationParams, onDelta)
      : await chatCompletionDetailed(continuationParams);

    const appended = extractProse(stripLeadingHeadings(content.trim()));
    if (!appended) break;
    text = `${text}\n\n${appended}`;
    words = countWords(text);
    lastFinish = finishReason;

    // Genug Wörter, aber mitten im Satz abgebrochen: unten wird vervollständigt.
    if (finishReason !== "length" && words >= target * 0.9) break;
  }

  return completeProse({
    model: input.model,
    system,
    language: input.language,
    text,
    label: "chapter",
    // Nur bei hartem Token-Limit verlängern (siehe completeProse).
    truncated: lastFinish === "length",
    onDelta,
  });
}

/* ─────────────────────── pass chunking (Kohärenz/Stil) ─────────────────────── */

/** Zielgröße pro Chunk. Hält jede Modellantwort klein → kein Token-Abbruch. */
const PASS_CHUNK_WORDS = 1000;
/** Harte Obergrenze pro Chunk beim Aufteilen überlanger Absätze. */
const PASS_CHUNK_MAX_WORDS = 1400;
/** Ausgabelimit pro Chunk — bewusst unter typischen Modell-Limits (2048–4096). */
const PASS_CHUNK_MAX_TOKENS = 4000;
/**
 * Überarbeitung darf **nicht** wachsen. Kohärenz/Stil sind Politur: mehr als ~⅓ länger
 * heißt, das Modell ergänzt statt zu überarbeiten (Kapitel wuchsen so von 4.000 auf 12.000).
 */
const PASS_CHUNK_MAX_GROWTH = 1.35;

/** Zerlegt einen Absatz an Satzgrenzen, wenn er allein schon zu lang ist. */
function splitLongParagraph(paragraph: string, maxWords: number): string[] {
  const sentences = paragraph.split(/(?<=[.!?…»"])\s+/);
  const pieces: string[] = [];
  let current: string[] = [];
  let words = 0;

  for (const sentence of sentences) {
    const count = countWords(sentence);
    if (words + count > maxWords && current.length > 0) {
      pieces.push(current.join(" "));
      current = [];
      words = 0;
    }
    current.push(sentence);
    words += count;
  }
  if (current.length > 0) pieces.push(current.join(" "));
  return pieces;
}

/**
 * Zerlegt ein Kapitel an Absatzgrenzen in Chunks (~PASS_CHUNK_WORDS Wörter).
 *
 * Kohärenz und Stil müssen die **vollständige** Prosa zurückgeben — bei langen
 * Kapiteln sprengt das das Ausgabelimit des Modells und die Antwort bricht ab.
 * Chunking löst das an der Wurzel: jede Antwort bleibt klein.
 */
export function splitIntoChunks(text: string, targetWords = PASS_CHUNK_WORDS): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return [text.trim()];

  const chunks: string[] = [];
  let current: string[] = [];
  let words = 0;

  const flush = () => {
    if (current.length > 0) {
      chunks.push(current.join("\n\n"));
      current = [];
      words = 0;
    }
  };

  for (const paragraph of paragraphs) {
    const count = countWords(paragraph);
    if (count > PASS_CHUNK_MAX_WORDS) {
      flush();
      for (const piece of splitLongParagraph(paragraph, PASS_CHUNK_MAX_WORDS)) chunks.push(piece);
      continue;
    }
    if (words + count > targetWords && current.length > 0) flush();
    current.push(paragraph);
    words += count;
  }
  flush();

  return chunks.length > 0 ? chunks : [text.trim()];
}

/** Letzte Wörter eines Textes (für den Kontext-Anker). */
function tailOfText(text: string, words: number): string {
  return text.split(/\s+/).filter(Boolean).slice(-words).join(" ");
}

/** Erste Wörter eines Textes (für den Kontext-Anker). */
function headOfText(text: string, words: number): string {
  return text.split(/\s+/).filter(Boolean).slice(0, words).join(" ");
}

/* ───────────────────────────── pass steps ───────────────────────────── */

export interface PassResult {
  text: string;
  notes: string[];
  /** True when the model actually changed the prose. */
  changed: boolean;
}

export interface PassInput {
  storyboard: Storyboard;
  chapterIndex: number;
  model: string;
  language: string;
  text: string;
  scenes?: SceneConstraint[];
  /** Verbindlicher Kanon-Block (Fakten + Beziehungen) aus dem Projekt. */
  canon?: string;
  /** Zielstimme für den Stil-Pass (Preset-Hinweis + eigener Zusatz). */
  styleProfile?: string;
}

function passContext(
  storyboard: Storyboard,
  chapterIndex: number,
  scenes?: SceneConstraint[],
  canon?: string,
): string {
  const chapter = storyboard.chapters[chapterIndex];
  const previous = storyboard.chapters[chapterIndex - 1];
  const next = storyboard.chapters[chapterIndex + 1];
  const characters = storyboard.characters
    .map((character) => `- ${character.name} (${character.role}): ${character.description}`)
    .join("\n");

  return `STORY: ${storyboard.title}
GENRE: ${storyboard.genre}
POV: ${storyboard.pov}
LOGLINE: ${storyboard.logline}
SYNOPSIS: ${storyboard.synopsis}
THEMES: ${storyboard.themes.join(", ")}

CHARACTERS:
${characters || "- (none specified)"}

PREVIOUS CHAPTER: ${previous ? `${previous.title} — ${previous.summary}` : "(first chapter)"}
CURRENT CHAPTER ${chapterIndex + 1}: ${chapter?.title ?? ""}
PLAN: ${chapter?.summary ?? ""}
SCENES (binding — follow in this order):
${sceneBlock(scenes, chapter?.beats ?? [])}
FORESHADOWING: ${(chapter?.foreshadowing ?? []).join(" · ") || "- (none)"}
NEXT CHAPTER: ${next ? `${next.title} — ${next.summary}` : "(final chapter — the story must be resolved here)"}${canon?.trim() ? `\n\n${canon.trim()}` : ""}`;
}

function parsePassOutput(content: string): PassResult {
  const lower = content.toLowerCase();
  const notesOpen = lower.indexOf("<notes>");
  const notesClose = lower.indexOf("</notes>");
  const notesRaw =
    notesOpen !== -1 ? content.slice(notesOpen + 7, notesClose !== -1 ? notesClose : undefined) : "";

  // <TEXT>-Block hat Vorrang: ein Notes-Marker mitten in der Antwort darf niemals
  // echten Prosatext löschen (genau das hat Kapitel abgeschnitten).
  const text = extractProse(content);

  const notes = notesRaw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-•*\d.)\]]+\s*/, "").trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !/^keine\.?$/i.test(line) &&
        !/^none\.?$/i.test(line) &&
        !/^keine Auffälligkeiten\.?$/i.test(line),
    );

  return { text: stripLeadingHeadings(text), notes };
}

function consistencySystem(language: string): string {
  return `You are a ruthless continuity and logic editor.
${languageLock(language)}

TASK: audit the given chapter against the storyboard context AND the neighbouring chapters, then FIX every problem while rewriting:
- contradictions with the synopsis, character descriptions, or the previous/next chapter
- timeline, location and cause/effect errors
- characters acting against their established voice or motivation
- foreshadowing that is ignored, misused or contradicted
- deviations from the binding SCENES block (order, POV/setting/time, characters present)
- sudden jumps, unclear staging, dropped threads
Keep the plot direction, the length and the voice. Do not shorten the chapter.

OUTPUT FORMAT (exactly, no other text):
<TEXT>
...the corrected chapter prose...
</TEXT>
<NOTES>
- one short bullet per issue you ACTUALLY fixed, phrased as problem → fix
  (e.g. "Zeitsprung rückwärts in Szene 3 → Reihenfolge korrigiert")
- only quote text if the wording really changed; NEVER quote two identical strings
- if you fixed nothing, write exactly: Keine Auffälligkeiten.
</NOTES>
You MUST return the COMPLETE chapter text inside <TEXT> — apply every fix and return the full prose, never a summary and never the unchanged original.
Everything in ${language}.`;
}

function styleSystem(language: string, styleProfile?: string): string {
  const voice = styleProfile?.trim()
    ? `
VOICE / STYLE PROFILE (binding — this is the target voice):
${styleProfile.trim()}
Apply this voice while editing. It outranks your own preferences, but NEVER at the cost of
plot, facts or meaning.`
    : "";

  return `You are a meticulous line editor.
${languageLock(language)}
${voice}
TASK: improve sentence construction and language usage WITHOUT changing plot, facts or meaning:
- vary sentence length and rhythm; break up run-ons and monotonous passages
- remove repetitions, filler words, weak verbs and clichés
- fix grammar, punctuation and tense consistency
- sharpen imagery and dialogue tags
Keep the length, the content and the character voices.

OUTPUT FORMAT (exactly, no other text):
<TEXT>
...the polished chapter prose...
</TEXT>
<NOTES>
- one short bullet per improvement you ACTUALLY made, phrased as what changed and why
  (e.g. "Schachtelsatz in Absatz 2 geteilt — Rhythmus")
- only quote text if the wording really changed; NEVER quote two identical strings
- if nothing needed changing, write exactly: Keine Auffälligkeiten.
</NOTES>
You MUST return the COMPLETE chapter text inside <TEXT> — apply every improvement and return the full prose, never a summary and never the unchanged original.
Everything in ${language}.`;
}

/** Callbacks für eine gestreamte Überarbeitung (Live-Vorschau je Teil). */
export interface PassStreamHandlers {
  /** Ein neuer Teil beginnt. */
  onPartStart?: (part: number, parts: number) => void;
  /** Textstück des laufenden Teils. */
  onPartDelta?: (text: string) => void;
  /** Fertig bearbeiteter Teil (nach allen Sicherungen). */
  onPartDone?: (part: number, text: string) => void;
}

async function runPass(
  kind: "consistency" | "style",
  input: PassInput,
  handlers?: PassStreamHandlers,
): Promise<PassResult> {
  const chapter = input.storyboard.chapters[input.chapterIndex];
  if (!chapter) {
    throw new ApiError("Kapitel nicht gefunden.", 400);
  }

  const system =
    kind === "consistency"
      ? consistencySystem(input.language)
      : styleSystem(input.language, input.styleProfile);
  const context = passContext(input.storyboard, input.chapterIndex, input.scenes, input.canon);
  const instruction =
    kind === "consistency"
      ? "Apply the continuity and logic fixes now, then list them in <NOTES>."
      : "Polish the prose now, then list what you improved in <NOTES>.";

  const previousText = input.text.trim();
  const chunks = splitIntoChunks(input.text);

  const parts: string[] = [];
  const notes: string[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const isOnly = chunks.length === 1;
    const before = index > 0 ? tailOfText(chunks[index - 1], 60) : "";
    const after = index < chunks.length - 1 ? headOfText(chunks[index + 1], 60) : "";
    const chunkWords = countWords(chunk);

    // Bei mehreren Teilen: nur diesen Teil umschreiben, Nachbarn nur als Kontext.
    const partIntro = isOnly
      ? `CHAPTER TEXT:\n${chunk}`
      : `This is PART ${index + 1} of ${chunks.length} of the chapter.
Rewrite ONLY this part (~${chunkWords} words) — never the neighbouring parts, never a summary.${
          before
            ? `\n\nPRECEDING TEXT (context only — do not rewrite, do not repeat):\n…${before}`
            : ""
        }${
          after
            ? `\n\nFOLLOWING TEXT (context only — do not rewrite, do not repeat):\n${after}…`
            : ""
        }\n\nPART ${index + 1} TEXT:\n${chunk}`;

    let parsed: PassResult | null = null;
    let truncatedByLimit = false;
    let retryHint = "";
    handlers?.onPartStart?.(index + 1, chunks.length);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const passParams = {
        model: input.model,
        system,
        user: `${context}\n\n${partIntro}\n\n${instruction}${retryHint}`,
        // Ausgabelimit am Chunk ausrichten: kein Platz für 3× so viel Text.
        maxTokens: Math.min(
          PASS_CHUNK_MAX_TOKENS,
          Math.max(800, Math.round(chunkWords * 2.4)),
        ),
        temperature: kind === "consistency" ? 0.35 : 0.6,
      };

      // Mit Callback streamen (Live-Vorschau), sonst normal anfragen.
      const { content, finishReason } = handlers?.onPartDelta
        ? await chatCompletionStream(passParams, (delta) => handlers.onPartDelta?.(delta))
        : await chatCompletionDetailed(passParams);

      const candidate = parsePassOutput(content);
      const text = candidate.text.trim();

      if (!text) {
        retryHint = `\n\nIMPORTANT: the previous attempt returned no text. Return ONLY part ${index + 1} of ${chunks.length} — about ${chunkWords} words.`;
        continue;
      }

      // Zu lang: Modell hat ergänzt oder das ganze Kapitel zurückgegeben → einmal nachfassen.
      if (text.length > chunk.length * PASS_CHUNK_MAX_GROWTH) {
        retryHint = `\n\nIMPORTANT: the previous attempt was about ${Math.round(text.length / Math.max(1, chunk.length) * 10) / 10}× LONGER than part ${index + 1}. That is wrong.${
          isOnly
            ? " Return the same text, polished — do not expand, do not add scenes or sentences."
            : ` Return ONLY part ${index + 1} (~${chunkWords} words) — never the other parts.`
        } Keep the length.`;
        continue;
      }

      parsed = { ...candidate, text };
      truncatedByLimit = finishReason === "length";
      break;
    }

    if (!parsed) {
      // Kein brauchbarer Teil: Original behalten, statt das Kapitel aufzublähen.
      parts.push(chunk);
      notes.push(
        `⚠️ Teil ${index + 1}/${chunks.length} unverändert übernommen — das Modell hat deutlich zu lang geantwortet (${kind === "consistency" ? "Kohärenz" : "Stil"} dort nicht angewendet).`,
      );
      continue;
    }

    let nextText = parsed.text;

    // Nur bei hartem Token-Limit fortsetzen (siehe completeProse) — nie „auf Verdacht".
    if (truncatedByLimit) {
      nextText = await completeProse({
        model: input.model,
        system,
        language: input.language,
        text: nextText,
        label: isOnly ? "chapter" : `chapter part ${index + 1}`,
        truncated: true,
        // Die Fortsetzung gehört zum selben Teil — sie wächst in der Vorschau weiter.
        onDelta: handlers?.onPartDelta,
      });
      if (nextText.length > chunk.length * PASS_CHUNK_MAX_GROWTH) {
        // Auch die Fortsetzung hat aufgebläht → Original behalten.
        parts.push(chunk);
        continue;
      }
    }

    if (chunk.length > 200 && nextText.length < chunk.length * 0.4) {
      throw new ApiError(
        isOnly
          ? "Die Antwort war unvollständig (der Text wurde stark gekürzt). Bitte erneut versuchen oder ein anderes Modell wählen."
          : `Teil ${index + 1} von ${chunks.length} wurde stark gekürzt. Bitte erneut versuchen oder ein anderes Modell wählen.`,
        502,
      );
    }

    parts.push(nextText);
    handlers?.onPartDone?.(index + 1, nextText);
    for (const note of parsed.notes) {
      if (!notes.some((existing) => existing.toLowerCase() === note.toLowerCase())) {
        notes.push(note);
      }
    }
  }

  const nextText = parts.join("\n\n").trim();

  if (previousText.length > 200 && nextText.length < previousText.length * 0.4) {
    throw new ApiError(
      "Die Antwort war unvollständig (der Text wurde stark gekürzt). Bitte erneut versuchen oder ein anderes Modell wählen.",
      502,
    );
  }

  // Überarbeitung ist Politur: deutlich länger heißt „ergänzt statt überarbeitet".
  const previousWords = countWords(previousText);
  const nextWords = countWords(nextText);
  if (previousWords > 50 && nextWords > previousWords * 1.4) {
    notes.push(
      `⚠️ Der Text ist von ${previousWords.toLocaleString("de-DE")} auf ${nextWords.toLocaleString("de-DE")} Wörter gewachsen (+${Math.round((nextWords / previousWords - 1) * 100)} %). Bitte prüfen, ob das Modell ergänzt statt überarbeitet hat.`,
    );
  }

  const changed = nextText !== previousText;
  // Notizen ohne echte Änderung („A" wurde zu „A") verstopfen nur den Bericht.
  const cleaned = filterNoOpNotes(notes);
  const finalNotes = changed
    ? cleaned.notes
    : [
        ...cleaned.notes,
        "⚠️ Keine Textänderung erkannt — das Modell hat den Text unverändert zurückgegeben. Ggf. ein stärkeres Modell wählen.",
      ];
  if (looksTruncated(nextText)) {
    finalNotes.push(
      "⚠️ Das Kapitel endet weiterhin mitten im Satz. Bitte erneut prüfen oder ein Modell mit größerem Ausgabelimit wählen.",
    );
  }

  return { text: nextText, notes: finalNotes, changed };
}

export function checkConsistency(input: PassInput): Promise<PassResult> {
  return runPass("consistency", input);
}

export function refineStyle(input: PassInput): Promise<PassResult> {
  return runPass("style", input);
}

/** Gestreamte Varianten: identische Logik, aber mit Live-Vorschau je Teil. */
export function checkConsistencyStream(
  input: PassInput,
  handlers: PassStreamHandlers,
): Promise<PassResult> {
  return runPass("consistency", input, handlers);
}

export function refineStyleStream(
  input: PassInput,
  handlers: PassStreamHandlers,
): Promise<PassResult> {
  return runPass("style", input, handlers);
}

/* ───────────────────────── timeline validation ───────────────────────── */

export interface TimelineInput {
  storyboard: Storyboard;
  scenesByChapter: SceneConstraint[][];
  model: string;
  language: string;
  /** Verbindlicher Kanon-Block (Fakten + Beziehungen) aus dem Projekt. */
  canon?: string;
}

/**
 * Ein Chronologie-Befund.
 *
 * **Strukturiert** (statt nur Freitext), weil zwei Dinge daran hängen: die Markierung der
 * betroffenen Kapitel in der Ansicht und die Zuordnung der Korrektur. Vorher wurde die
 * Kapitelnummer clientseitig aus dem Text geraten (`includes("Kapitel N")`) — das ging bei
 * englischen Befunden oder abweichender Schreibweise schief.
 */
export interface TimelineFinding {
  /** 1-basierte Kapitelnummer aus der Auflistung; **0** = nicht zuordenbar. */
  chapter: number;
  /** 1-basierte Szenennummer im Kapitel (fehlt = kapitelweit). */
  scene?: number;
  /** Was sich widerspricht. */
  issue: string;
  /** Konkrete Auflösung — Grundlage der Korrektur. */
  fix: string;
}

export interface TimelineResult {
  summary: string;
  findings: TimelineFinding[];
}

/** „Kapitel 3", „Chapter 3", „Kap. 3" → 3; 0, wenn keine Nummer genannt ist. */
function chapterNumberFromText(text: string): number {
  const match = text.match(/\b(?:kapitel|chapter|kap\.?|ch\.?)\s*(\d{1,3})\b/i);
  const value = match?.[1] ? Number.parseInt(match[1], 10) : Number.NaN;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Positive Ganzzahl oder `undefined` (akzeptiert auch Strings wie "3"). */
function positiveInt(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}

/**
 * Bringt Befunde auf eine Form — Modelle liefern die Objekte wie gefordert, aber auch weiterhin
 * reine Strings (oder gemischt). Die Kapitelnummer wird zur Not aus dem Text gelesen.
 */
function normalizeTimelineFindings(value: unknown): TimelineFinding[] {
  if (!Array.isArray(value)) return [];
  const findings: TimelineFinding[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      const issue = entry.trim();
      if (!issue) continue;
      findings.push({ chapter: chapterNumberFromText(issue), issue, fix: "" });
      continue;
    }
    const item = asRecord(entry);
    const issue = str(item.issue) || str(item.text) || str(item.message);
    if (!issue) continue;
    findings.push({
      chapter: positiveInt(item.chapter) ?? chapterNumberFromText(issue),
      scene: positiveInt(item.scene),
      issue,
      fix: str(item.fix) || str(item.suggestion),
    });
  }
  return findings;
}

/** Die Auflistung, die Prüfung **und** Korrektur sehen — beide müssen dieselben Daten lesen. */
function timelineListing(storyboard: Storyboard, scenesByChapter: SceneConstraint[][]): string {
  return storyboard.chapters
    .map((chapter, index) => {
      const scenes = scenesByChapter[index] ?? [];
      const sceneLines = scenes
        .map((scene, sceneIndex) => {
          const parts = [
            scene.time ? `[${scene.time}]` : "[no time]",
            scene.setting ? `(${scene.setting})` : "",
            scene.text,
          ]
            .filter(Boolean)
            .join(" ");
          return `   ${sceneIndex + 1}. ${parts}`;
        })
        .join("\n");
      return `${index + 1}. ${chapter.title}\n   Setting: ${chapter.setting}\n   Summary: ${chapter.summary}\n${sceneLines || "   (no scenes)"}`;
    })
    .join("\n\n");
}

/** Prüfauftrag + Feldregeln — von JSON- und JSONL-Variante **geteilt** (kein Auseinanderdriften). */
function timelineCheckBrief(language: string): string {
  return `You are a continuity editor specialised in chronology.
${languageLock(language)}

TASK: check the chapter/scene timeline for contradictions and impossibilities:
- times that jump backwards within a chapter's scene order
- travel, preparation or recovery times that cannot fit the stated span
- day/night, season or weather contradicting the order
- ages, dates or durations that do not add up
- scenes whose stated time is missing or clashes with the chapter summary

FIELDS:
- chapter: the 1-based chapter number from the listing. Use 0 ONLY if the problem cannot be tied to one chapter.
- scene: the 1-based scene number inside that chapter, or null when the problem spans scenes.
- issue: one short, concrete sentence naming what contradicts what (mention the numbers).
- fix: the concrete repair in the timeline data (which time/setting/order must change) — not prose advice.
- summary: one sentence about the overall chronology; if it is consistent, say so explicitly.
`;
}

function timelineSystem(language: string): string {
  return `${timelineCheckBrief(language)}
Respond ONLY with a single valid JSON object:
{
  "summary": string,
  "findings": [
    { "chapter": number, "scene": number | null, "issue": string, "fix": string }
  ]
}
Rules:
- If the chronology is consistent, findings MUST be an empty array and the summary should say so.
- All text in ${language}.`;
}

function timelineStreamSystem(language: string): string {
  return `${timelineCheckBrief(language)}
${jsonlFormatBlock(
    language,
    `{"t":"finding","chapter":2,"scene":1,"issue":"…","fix":"…"}
{"t":"summary","summary":"…"}`,
  )}
Rules:
- One line per problem: {"t":"finding","chapter":…,"scene":…,"issue":…,"fix":…}.
- Emit the summary as the LAST line: {"t":"summary","summary":"…"}.
- If the chronology is consistent, emit ONLY that summary line.
- All text in ${language}.`;
}

/** Ergebnis-Normalisierung, die **beide** Wege (JSON und JSONL) verwenden. */
function timelineResult(parsed: Record<string, unknown>): TimelineResult {
  return {
    summary: str(parsed.summary),
    findings: normalizeTimelineFindings(parsed.findings),
  };
}

export async function checkTimeline(input: TimelineInput): Promise<TimelineResult> {
  const listing = timelineListing(input.storyboard, input.scenesByChapter);

  const { content, finishReason } = await chatCompletionDetailed({
    model: input.model,
    system: timelineSystem(input.language),
    user: `TIMELINE:\n${listing}${input.canon?.trim() ? `\n\n${input.canon.trim()}` : ""}\n\nCheck the chronology now and return the JSON, entirely in ${input.language}.`,
    json: true,
    maxTokens: 4000,
    temperature: 0.3,
    cache: true,
  });

  // Token-Limit: klar benennen statt als „ungültiges JSON" zu enden.
  if (finishReason === "length") {
    throw new ApiError(
      "Die Timeline-Prüfung wurde vom Token-Limit abgeschnitten. Bitte erneut versuchen oder ein Modell mit größerem Ausgabelimit wählen.",
      502,
    );
  }

  const parsed = parseJson(content, "Timeline");
  return timelineResult(parsed);
}

export interface TimelineStreamHandlers {
  /** Ein fertiger Befund, sobald das Modell ihn geschrieben hat (live, noch nicht endgültig). */
  onFinding?: (finding: TimelineFinding) => void;
}

/**
 * Gestreamte Timeline-Prüfung: Das Modell liefert **eine JSON-Zeile pro Befund**, dadurch
 * erscheinen die Hinweise live im Dialog, statt erst nach dem (bei langen Büchern spürbaren)
 * Gesamtlauf. Am Ende kommt die normalisierte Fassung — dieselbe wie im Nicht-Streaming-Weg.
 *
 * Liefert das Modell trotzdem ein einzelnes JSON-Dokument, fällt der Server darauf zurück.
 */
export async function checkTimelineStream(
  input: TimelineInput,
  handlers: TimelineStreamHandlers = {},
): Promise<TimelineResult> {
  const listing = timelineListing(input.storyboard, input.scenesByChapter);
  const rawFindings: unknown[] = [];
  let summary = "";

  /** `live` unterscheidet die Live-Meldung von der Nachverarbeitung des fertigen Textes. */
  const collect = (parsed: Record<string, unknown>, live: boolean) => {
    if (typeof parsed.issue === "string" && parsed.issue.trim()) {
      rawFindings.push(parsed);
      if (live) {
        const finding = normalizeTimelineFindings([parsed])[0];
        if (finding) handlers.onFinding?.(finding);
      }
      return;
    }
    if (typeof parsed.summary === "string" && parsed.summary.trim()) {
      summary = parsed.summary.trim();
    }
  };

  const consumer = createJsonlConsumer((parsed) => collect(parsed, true));

  const { content, finishReason } = await chatCompletionStream(
    {
      model: input.model,
      system: timelineStreamSystem(input.language),
      user: `TIMELINE:\n${listing}${input.canon?.trim() ? `\n\n${input.canon.trim()}` : ""}\n\nCheck the chronology now as JSONL (one object per line), entirely in ${input.language}.`,
      maxTokens: 4000,
      temperature: 0.3,
    },
    consumer.push,
  );
  consumer.flush();

  if (finishReason === "length") {
    throw new ApiError(
      "Die Timeline-Prüfung wurde vom Token-Limit abgeschnitten. Bitte erneut versuchen oder ein Modell mit größerem Ausgabelimit wählen.",
      502,
    );
  }

  // Kam nichts live an (Provider ohne echte Textstücke)? Dann den fertigen Text nachverarbeiten.
  if (rawFindings.length === 0 && summary.length === 0) {
    consumeJsonlText(content, (parsed) => collect(parsed, false));
  }

  if (rawFindings.length === 0) return timelineResult(parseJson(content, "Timeline"));
  return { summary, findings: normalizeTimelineFindings(rawFindings) };
}

/* ─────────────────────── timeline quick fix (Chronologie) ─────────────────────── */

export interface TimelineRepairInput {
  storyboard: Storyboard;
  scenesByChapter: SceneConstraint[][];
  findings: TimelineFinding[];
  model: string;
  language: string;
  canon?: string;
}

/** Vorgeschlagene Korrektur **einer Szene** — nur gesetzte Felder ändern etwas. */
export interface TimelineSceneFix {
  /** 1-basierte Szenennummer der bestehenden Szene. */
  scene: number;
  /** Neuer Zeitstempel. */
  time?: string;
  /** Neuer Schauplatz. */
  setting?: string;
  /** Neuer Szenen-Text — nur wenn der Text selbst der Widerspruch ist. */
  text?: string;
}

export interface TimelineRepairFix {
  /** 1-basierte Kapitelnummer. */
  chapter: number;
  note: string;
  scenes: TimelineSceneFix[];
}

export interface TimelineRepairResult {
  fixes: TimelineRepairFix[];
  notes: string[];
}

/** Korrekturauftrag + Regeln — von JSON- und JSONL-Variante **geteilt**. */
function timelineRepairBrief(language: string): string {
  return `You are a continuity editor repairing chronology in a story plan.
${languageLock(language)}

TASK: repair ONLY the listed timeline problems — by changing as little as possible.

WHAT YOU MAY CHANGE (per scene):
- the time label (preferred: most contradictions are label/order problems)
- the setting label
- the scene text, but ONLY when the text itself contradicts the timeline (e.g. it says a
  character arrives by ship while the plan has an arrival by carriage)

RULES:
- Never touch chapters or scenes that are not named in the problems.
- Keep every character, place name and plot beat; do NOT invent new plot.
- Do NOT reorder, add or delete scenes, and do NOT change the story's outcome.
- Keep the wording of a repaired scene as close to the original as possible.
- Lists in the scene text stay lists; keep the same language and style.
`;
}

/** Die zu reparierenden Probleme als Text — Prüfung und Korrektur nutzen dieselbe Aufbereitung. */
function timelineProblemList(findings: TimelineFinding[]): string {
  return findings
    .map((finding, index) => {
      const where = [
        finding.chapter > 0 ? `Kapitel ${finding.chapter}` : "Kapitel unbekannt",
        finding.scene ? `Szene ${finding.scene}` : "",
      ]
        .filter(Boolean)
        .join(", ");
      return `${index + 1}. [${where}] PROBLEM: ${finding.issue}${finding.fix ? `\n   FIX: ${finding.fix}` : ""}`;
    })
    .join("\n");
}

function timelineRepairSystem(language: string): string {
  return `${timelineRepairBrief(language)}
Respond ONLY with a single valid JSON object:
{
  "chapters": [
    { "chapter": number, "note": string,
      "scenes": [ { "scene": number, "time": string, "setting": string, "text": string } ] }
  ],
  "notes": string[]
}
Rules:
- chapter / scene are the 1-based numbers from the listing below.
- List a scene ONLY if you change it, and omit every field that stays the same.
- note: one short sentence per chapter saying what you changed.
- notes: optional remarks about problems you could not repair.
- All text in ${language}.`;
}

function timelineRepairStreamSystem(language: string): string {
  return `${timelineRepairBrief(language)}
${jsonlFormatBlock(
    language,
    `{"chapter":1,"note":"…","scenes":[{"scene":2,"time":"Tag 3"}]}
{"t":"note","text":"…"}`,
  )}
Rules:
- One line per repaired chapter: {"chapter":…,"note":…,"scenes":[{"scene":…,"time":…,"setting":…,"text":…}]}.
- chapter / scene are the 1-based numbers from the listing below.
- List a scene ONLY if you change it, and omit every field that stays the same.
- Unrepairable problems go out as a final {"t":"note","text":"…"} line (optional).
- All text in ${language}.`;
}

/**
 * Validiert die Modellantwort gegen die echten Kapitel/Szenen und behält nur **echte**
 * Änderungen. Beide Wege (JSON und JSONL) laufen hier durch — so sind sie garantiert gleich streng.
 */
function timelineRepairResult(
  parsed: Record<string, unknown>,
  input: TimelineRepairInput,
): TimelineRepairResult {
  const rawChapters = Array.isArray(parsed.chapters) ? parsed.chapters : [];
  const fixes: TimelineRepairFix[] = [];

  for (const entry of rawChapters) {
    const item = asRecord(entry);
    const chapter = positiveInt(item.chapter);
    if (!chapter || chapter > input.storyboard.chapters.length) continue;
    const scenes = input.scenesByChapter[chapter - 1] ?? [];
    const rawScenes = Array.isArray(item.scenes) ? item.scenes : [];
    const sceneFixes: TimelineSceneFix[] = [];

    for (const sceneEntry of rawScenes) {
      const sceneItem = asRecord(sceneEntry);
      const sceneNumber = positiveInt(sceneItem.scene);
      if (!sceneNumber || sceneNumber > scenes.length) continue;
      const current = scenes[sceneNumber - 1];
      const fixed: TimelineSceneFix = { scene: sceneNumber };

      const time = str(sceneItem.time);
      const setting = str(sceneItem.setting);
      const text = str(sceneItem.text);
      // Nur echte Änderungen übernehmen — das Modell listet gern auch Unverändertes.
      if (time && time !== current?.time) fixed.time = time;
      if (setting && setting !== current?.setting) fixed.setting = setting;
      if (text && text !== current?.text) fixed.text = text;

      if (fixed.time || fixed.setting || fixed.text) sceneFixes.push(fixed);
    }

    if (sceneFixes.length > 0) {
      fixes.push({ chapter, note: str(item.note), scenes: sceneFixes });
    }
  }

  return { fixes, notes: strArray(parsed.notes) };
}

/**
 * Quick Fix für die Timeline: korrigiert die **Struktur** (Szenen-Zeit/Schauplatz/Text), die die
 * Chronologie-Prüfung liest — nicht die Prosa.
 *
 * Bewusst **ein** JSON-Aufruf: die Korrektur ist klein (ein paar Labels/Zeilen), und die Prüfung
 * liest die Struktur, nicht den Fließtext.
 */
export async function repairTimeline(input: TimelineRepairInput): Promise<TimelineRepairResult> {
  if (input.findings.length === 0) return { fixes: [], notes: [] };

  const listing = timelineListing(input.storyboard, input.scenesByChapter);
  const problemList = timelineProblemList(input.findings);

  const { content, finishReason } = await chatCompletionDetailed({
    model: input.model,
    system: timelineRepairSystem(input.language),
    user: `TIMELINE:\n${listing}${input.canon?.trim() ? `\n\n${input.canon.trim()}` : ""}\n\nPROBLEMS TO REPAIR:\n${problemList}\n\nReturn the repair JSON now, entirely in ${input.language}.`,
    json: true,
    maxTokens: 3000,
    temperature: 0.2,
  });

  if (finishReason === "length") {
    throw new ApiError(
      "Die Timeline-Korrektur wurde vom Token-Limit abgeschnitten. Bitte erneut versuchen oder ein Modell mit größerem Ausgabelimit wählen.",
      502,
    );
  }

  return timelineRepairResult(parseJson(content, "Timeline-Korrektur"), input);
}

export interface TimelineRepairStreamHandlers {
  /** Ein vorgeschlagenes Kapitel, sobald es fertig ist (live, noch **unvalidiert**). */
  onChapter?: (raw: Record<string, unknown>) => void;
}

/**
 * Gestreamte Timeline-Korrektur: **eine JSON-Zeile pro Kapitel**. Die Vorschau kann damit schon
 * öffnen und füllen, während das Modell arbeitet.
 *
 * Die Live-Objekte sind Rohdaten des Modells — verbindlich ist das Ergebnis dieser Funktion,
 * das dieselbe Prüfung gegen die echten Kapitel/Szenen durchläuft wie der Nicht-Streaming-Weg.
 */
export async function repairTimelineStream(
  input: TimelineRepairInput,
  handlers: TimelineRepairStreamHandlers = {},
): Promise<TimelineRepairResult> {
  if (input.findings.length === 0) return { fixes: [], notes: [] };

  const listing = timelineListing(input.storyboard, input.scenesByChapter);
  const problemList = timelineProblemList(input.findings);
  const rawChapters: unknown[] = [];
  const notes: string[] = [];

  const collect = (parsed: Record<string, unknown>, live: boolean) => {
    if (positiveInt(parsed.chapter)) {
      rawChapters.push(parsed);
      if (live) handlers.onChapter?.(parsed);
      return;
    }
    if (typeof parsed.text === "string" && parsed.text.trim()) notes.push(parsed.text.trim());
  };

  const consumer = createJsonlConsumer((parsed) => collect(parsed, true));

  const { content, finishReason } = await chatCompletionStream(
    {
      model: input.model,
      system: timelineRepairStreamSystem(input.language),
      user: `TIMELINE:\n${listing}${input.canon?.trim() ? `\n\n${input.canon.trim()}` : ""}\n\nPROBLEMS TO REPAIR:\n${problemList}\n\nReturn the repair now as JSONL (one object per line), entirely in ${input.language}.`,
      maxTokens: 3000,
      temperature: 0.2,
    },
    consumer.push,
  );
  consumer.flush();

  if (finishReason === "length") {
    throw new ApiError(
      "Die Timeline-Korrektur wurde vom Token-Limit abgeschnitten. Bitte erneut versuchen oder ein Modell mit größerem Ausgabelimit wählen.",
      502,
    );
  }

  // Kam nichts live an (Provider ohne echte Textstücke)? Dann den fertigen Text nachverarbeiten.
  if (rawChapters.length === 0 && notes.length === 0) {
    consumeJsonlText(content, (parsed) => collect(parsed, false));
  }

  if (rawChapters.length === 0) {
    return timelineRepairResult(parseJson(content, "Timeline-Korrektur"), input);
  }
  return timelineRepairResult({ chapters: rawChapters, notes }, input);
}

/* ───────────────────────────── world extraction ───────────────────────────── */

/* ───────────────── Storyboard & Szenen aus Manuskript ableiten ───────────────── */

export interface StoryboardDeriveInput {
  /** Titel des Buchs (Rückfall, wenn das Manuskript keinen hergibt). */
  title: string;
  genre?: string;
  chapters: { title: string; text: string }[];
  model: string;
  language: string;
  /** Verbindlicher Reihen-Kontext (bei Mehrbändern). */
  seriesContext?: string;
}

/** Kapitelplan-Angaben, die aus dem Text stammen (leer = nicht belegbar). */
export interface DerivedChapterPlan {
  index: number;
  summary: string;
  pov: string;
  setting: string;
  foreshadowing: string[];
}

export interface StoryboardDeriveResult {
  meta: {
    title: string;
    subtitle: string;
    genre: string;
    logline: string;
    synopsis: string;
    themes: string[];
    tone: string;
    pov: string;
  };
  characters: StoryCharacter[];
  chapters: DerivedChapterPlan[];
}

function storyboardDeriveMetaSystem(language: string): string {
  return `You are a story editor. A FINISHED manuscript is given; you reconstruct its story bible.
${languageLock(language)}

TASK (part 1 of 2): derive the book's METADATA and its CAST from the manuscript excerpts.

Rules:
- ONLY what the text supports. NEVER invent names, places, themes or plot.
- Leave a field as an empty string ("") when the excerpts give no basis — an honest empty field
  beats a guess. An empty list is a valid answer.
- logline: one sentence. synopsis: 3-5 sentences. themes: 2-4 short keywords. tone: a few words.
- pov: the prevailing narrative voice (e.g. "dritte Person, Aria", "Ich-Erzählung").
- characters: every named figure that carries the story (protagonist, antagonist, allies,
  mentors); name exactly as written, role short and concrete, description 1-2 sentences.

${jsonlFormatBlock(
    language,
    `{"t":"meta","title":"…","subtitle":"…","genre":"…","logline":"…","synopsis":"…","themes":["…"],"tone":"…","pov":"…"}
{"t":"character","name":"…","role":"Protagonistin","description":"…"}`,
  )}
Rules:
- Emit EXACTLY ONE meta line (first), then one character line per figure.
- All text in ${language}.`;
}

function storyboardDeriveChaptersSystem(language: string): string {
  return `You are a story editor. A FINISHED manuscript is given; you reconstruct its chapter plan.
${languageLock(language)}

TASK (part 2 of 2): for EACH chapter in the given batch, write its chapter-plan entry.

Rules:
- ONLY what the text supports. NEVER invent plot. Use the names the text uses.
- summary: 1-2 concrete sentences (who does what, where it leads). No marketing tone.
- pov: the narrative voice of that chapter (e.g. "dritte Person, Aria"), "" if unclear.
- setting: the chapter's main location, "" if the text never says.
- foreshadowing: short list of things the chapter plants for later; [] if none.
- Cover EVERY chapter of the batch, in the given order, even where the excerpt is short.

${jsonlFormatBlock(
    language,
    `{"chapter":3,"summary":"…","pov":"…","setting":"…","foreshadowing":["…"]}`,
  )}
Rules:
- One line per chapter, "chapter" is the 1-based number from the listing.
- All text in ${language}.`;
}

export interface StoryboardDeriveHandlers {
  /** Vor dem ersten Aufruf: wie viele Kapitel und Batches anstehen. */
  onStart?: (info: { chapters: number; batches: number }) => void;
  /** Phase 1 (Meta + Figuren) oder Phase 2 (Kapitel-Batches) beginnt. */
  onPhase?: (phase: "meta" | "chapters") => void;
  onMeta?: (meta: StoryboardDeriveResult["meta"]) => void;
  onCharacter?: (character: StoryCharacter) => void;
  /** Ein Kapitelplan, sobald das Modell ihn geschrieben hat (live, vor der Endprüfung). */
  onChapter?: (plan: DerivedChapterPlan) => void;
  /** Fortschritt der Kapitel-Batches. */
  onBatch?: (done: number, total: number) => void;
}

/** Normalisiert die Meta-Zeile der Ableitung. */
function deriveMetaFrom(
  raw: Record<string, unknown>,
  input: StoryboardDeriveInput,
): StoryboardDeriveResult["meta"] {
  return {
    title: str(raw.title) || input.title,
    subtitle: str(raw.subtitle),
    genre: str(raw.genre) || input.genre || "",
    logline: str(raw.logline),
    synopsis: str(raw.synopsis),
    themes: strArray(raw.themes).slice(0, 6),
    tone: str(raw.tone),
    pov: str(raw.pov),
  };
}

/** Normalisiert eine Kapitel-Zeile (JSONL) bzw. ein Kapitel-Objekt (JSON-Rückfall). */
function deriveChapterFrom(raw: Record<string, unknown>, index: number): DerivedChapterPlan {
  return {
    index,
    summary: str(raw.summary),
    pov: str(raw.pov),
    setting: str(raw.setting),
    foreshadowing: strArray(raw.foreshadowing),
  };
}

/**
 * Leitet Storyboard-Angaben aus einem **fertigen Manuskript** ab (Gegenrichtung zur Generierung).
 *
 * **Gechunkt und gestreamt**, aus zwei Gründen:
 *
 * 1. Ein Aufruf mit allen Kapiteln läuft bei längeren Büchern ins Ausgabelimit (genau das passierte
 *    in der Praxis). Deshalb zwei Phasen wie bei der Storyboard-*Generierung*: Phase 1 liefert
 *    Metadaten + Figurenliste, Phase 2 die Kapitelpläne in Batches à `BATCH_SIZE`.
 * 2. Beide Phasen antworten als **JSONL** — Figuren und Kapitel treffen einzeln ein und werden
 *    sofort gemeldet, statt am Ende als ein Block.
 */
export async function deriveStoryboardStream(
  input: StoryboardDeriveInput,
  handlers: StoryboardDeriveHandlers = {},
): Promise<StoryboardDeriveResult> {
  const planned = input.chapters.map((chapter, index) => ({
    index,
    title: chapter.title.trim() || `Kapitel ${index + 1}`,
    text: chapter.text,
  }));
  if (planned.length === 0) {
    throw new ApiError(
      "Kein Manuskript-Text vorhanden, aus dem sich ein Storyboard ableiten ließe.",
      400,
    );
  }

  const budget = excerptBudget(planned.length);
  const totalBatches = Math.max(1, Math.ceil(planned.length / BATCH_SIZE));
  handlers.onStart?.({ chapters: planned.length, batches: totalBatches });

  // ── Phase 1: Meta + Figuren ────────────────────────────────────────────────
  handlers.onPhase?.("meta");
  const metaRaw: Record<string, unknown> = {};
  const characterLines: unknown[] = [];
  let metaSeen = false;

  const metaConsumer = createJsonlConsumer((parsed) => {
    if (typeof parsed.t === "string" && parsed.t === "character") {
      characterLines.push(parsed);
      const [character] = normalizeExtractedCharacters({ characters: [parsed] });
      if (character) handlers.onCharacter?.(character);
      return;
    }
    // Die Meta-Zeile trägt kein `t` — erkennbar an den Metadaten-Feldern. Sie kommt zuerst,
    // also wird sie auch zuerst gemeldet.
    if (!metaSeen && (typeof parsed.title === "string" || typeof parsed.genre === "string")) {
      Object.assign(metaRaw, parsed);
      metaSeen = true;
      handlers.onMeta?.(deriveMetaFrom(metaRaw, input));
    }
  });

  const metaCall = await chatCompletionStream(
    {
      model: input.model,
      system: storyboardDeriveMetaSystem(input.language),
      user: `BOOK TITLE (working title): ${input.title || "(untitled)"}
GENRE (optional, may be wrong): ${input.genre || "(unknown)"}${input.seriesContext?.trim() ? `\n\n${input.seriesContext.trim()}` : ""}

MANUSCRIPT EXCERPTS (one per chapter, in reading order; chapter numbers matter):
${manuscriptDigest(planned)}

Derive the metadata and the cast now as JSONL, entirely in ${input.language}.`,
      maxTokens: 2500,
      temperature: 0.3,
    },
    metaConsumer.push,
  );
  metaConsumer.flush();

  // Nichts als JSONL? Dann hat das Modell ein JSON-Dokument geliefert.
  if (!metaSeen && characterLines.length === 0) {
    const parsed = parseJson(metaCall.content, "Storyboard-Ableitung");
    const fallback = asRecord(parsed.meta);
    if (Object.keys(fallback).length > 0) {
      Object.assign(metaRaw, fallback);
      metaSeen = true;
    }
    if (Array.isArray(parsed.characters)) {
      for (const entry of parsed.characters) characterLines.push(entry);
    }
  }

  const meta = deriveMetaFrom(metaRaw, input);
  // Nur melden, wenn die Meta-Zeile nicht schon live gemeldet wurde (JSON-Rückfall).
  if (!metaSeen) handlers.onMeta?.(meta);

  // ── Phase 2: Kapitelpläne in Batches ──────────────────────────────────────
  handlers.onPhase?.("chapters");
  const plans = new Map<number, DerivedChapterPlan>();
  const titleList = planned.map((chapter) => `${chapter.index + 1}. ${chapter.title}`).join("\n");
  // Zähler explizit führen: `floor(end / BATCH_SIZE)` meldet den letzten (kürzeren) Batch sonst
  // wieder mit der Nummer des vorherigen.
  let batchesDone = 0;

  for (let start = 0; start < planned.length; start += BATCH_SIZE) {
    const batch = planned.slice(start, start + BATCH_SIZE);
    const batchConsumer = createJsonlConsumer((parsed) => {
      const number = positiveInt(parsed.chapter);
      if (!number) return;
      const plan = deriveChapterFrom(parsed, number - 1);
      plans.set(number, plan);
      handlers.onChapter?.(plan);
    });

    const batchCall = await chatCompletionStream(
      {
        model: input.model,
        system: storyboardDeriveChaptersSystem(input.language),
        user: `BOOK: ${meta.title || input.title}${meta.genre ? ` · ${meta.genre}` : ""}${
          meta.logline ? `\nLOGLINE: ${meta.logline}` : ""
        }${meta.synopsis ? `\nSYNOPSIS: ${meta.synopsis}` : ""}

ALL CHAPTERS (for the arc):
${titleList}

CHAPTERS OF THIS BATCH:
${batch.map((chapter) => chapterExcerpt(chapter.title, chapter.text, budget)).join("\n\n")}

Write the chapter-plan entries for THIS BATCH now as JSONL (one line per chapter), entirely in ${input.language}.`,
        maxTokens: 2200,
        temperature: 0.3,
      },
      batchConsumer.push,
    );
    batchConsumer.flush();

    // JSON-Rückfall je Batch: liefert das Modell ein Dokument statt Zeilen.
    const received = batch.filter((chapter) => plans.has(chapter.index + 1)).length;
    if (received === 0) {
      const parsed = parseJson(batchCall.content, "Storyboard-Ableitung");
      const list = Array.isArray(parsed.chapters) ? parsed.chapters : [];
      for (const entry of list) {
        const item = asRecord(entry);
        const number = positiveInt(item.chapter);
        if (!number) continue;
        const plan = deriveChapterFrom(item, number - 1);
        plans.set(number, plan);
        handlers.onChapter?.(plan);
      }
    }

    batchesDone += 1;
    handlers.onBatch?.(batchesDone, totalBatches);
  }

  return {
    meta,
    characters: normalizeExtractedCharacters({ characters: characterLines }).slice(0, 40),
    // Lücken bleiben leer: Was das Modell nicht geliefert hat, wird nicht ersetzt.
    chapters: planned.map(
      (chapter) => plans.get(chapter.index + 1) ?? deriveChapterFrom({}, chapter.index),
    ),
  };
}

export interface SceneDeriveInput {
  chapterTitle: string;
  /** Voller Kapiteltext. */
  text: string;
  /** Kapitel-Kurzfassung als Kontext (optional). */
  hint?: string;
  model: string;
  language: string;
}

/** Eine aus dem Text gelesene Szene. */
export interface DerivedScene {
  /** Kurze Beat-Zeile (Vorgabe für die Pipeline, nicht die Prosa selbst). */
  text: string;
  time: string;
  setting: string;
  pov: string;
  /**
   * Figuren **als Namen**, die in dieser Szene vorkommen — höchstens `MAX_SCENE_CHARACTERS`,
   * und nur, was der Text hergibt. Der Server kennt **keine** Figurenliste und kann deshalb keine
   * IDs liefern: Die Zuordnung Name → ID macht der Client (`findMatchingCharacter`).
   */
  characters: string[];
}

/** Mehr als eine Handvoll Namen pro Szene ist fast immer Modell-Rauschen. */
const MAX_SCENE_CHARACTERS = 5;

/**
 * Figuren-Namen einer abgeleiteten Szene lesen — tolerant gegenüber der Modelllaune: Es kommen
 * sowohl ein Array als auch ein Komma-String vor. Leeres und Aufzählungszeichen fallen weg,
 * Wiederholungen werden entfernt, die Liste ist begrenzt.
 */
function sceneCharacters(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw.map((item) => str(item))
    : str(raw)
        .split(",")
        .map((item) => item.trim());
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of list) {
    const clean = name.trim().replace(/^\s*[-•*]\s*/, "");
    if (!clean || clean.length > 60) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= MAX_SCENE_CHARACTERS) break;
  }
  return result;
}

/** Wortbudget eines Szenen-Teils. Größer als bei den Pässen: die Antwort ist klein. */
const SCENE_CHUNK_WORDS = 2500;

function scenesDeriveSystem(language: string): string {
  return `You are a story editor splitting a finished chapter (or a part of one) into its scenes.
${languageLock(language)}

A scene is a continuous stretch of action in one place and time. A new scene starts when the
place, the time or the focus changes (a jump, a cut, a new conversation in a new room).

Rules:
- Cover the WHOLE given text in reading order — first scene to last, nothing left out.
- 3-10 scenes for a normal chapter. A part of a chapter has fewer (2-5): do not compress, just
  report the scenes of THIS text.
- text: ONE short line per scene, present tense, max 25 words — a plan line, not prose.
  Name who acts and what changes, e.g. "Aria erreicht den Hafen und findet das Schiff verlassen."
- time: only if the text states it ("am nächsten Morgen", "drei Tage später"); otherwise "".
- setting: the place of that scene, using the text's names; "" if it never says.
- pov: the viewpoint of that scene if it changes or is clear; otherwise "".
- characters: who ACTS in this scene — names EXACTLY as written in the text, at most 5, comma
  separated ("Aria, Theron"); "" when the scene names nobody. Only names that literally appear in
  this text. NEVER invent a name, never use a description ("the stranger") instead of a name.
- NEVER invent plot, names or places. No spoilers, no interpretation, no quotes of prose.

${jsonlFormatBlock(language, `{"text":"…","time":"…","setting":"…","pov":"…","characters":["Aria","Theron"]}`)}
Rules: one line per scene, in order; all text in ${language}.`;
}

export interface SceneDeriveHandlers {
  /** Vor dem ersten Aufruf: in wie viele Teile das Kapitel zerlegt wurde. */
  onStart?: (info: { parts: number }) => void;
  /** Fortschritt der Teile (lange Kapitel). */
  onPart?: (done: number, total: number) => void;
  /** Eine Szene, sobald das Modell sie geschrieben hat (live, vor der Endprüfung). */
  onScene?: (scene: DerivedScene) => void;
}

/**
 * Leitet die Szenen **eines Kapitels** aus seiner Prosa ab.
 *
 * **Gechunkt:** Sehr lange Kapitel werden in Teile von ~`SCENE_CHUNK_WORDS` Wörtern zerlegt
 * (absatzsicher über `splitIntoChunks`), sonst läuft die Eingabe bei Ausnahme-Kapiteln aus dem
 * Kontext. **Gestreamt:** Das Modell liefert eine JSON-Zeile pro Szene, damit die Beats einzeln
 * eintreffen (und bei mehrteiligen Kapiteln der Fortschritt sichtbar ist).
 */
export async function deriveScenesStream(
  input: SceneDeriveInput,
  handlers: SceneDeriveHandlers = {},
): Promise<DerivedScene[]> {
  const text = input.text.trim();
  if (!text) {
    throw new ApiError(
      "Dieses Kapitel hat keinen Text, aus dem sich Szenen ableiten ließen.",
      400,
    );
  }

  const parts = splitIntoChunks(text, SCENE_CHUNK_WORDS);
  handlers.onStart?.({ parts: parts.length });

  const scenes: DerivedScene[] = [];
  const seen = new Set<string>();

  /** Nimmt eine Szene auf — `live` steuert nur, ob sie gemeldet wird (JSON-Rückfall: nein). */
  const collect = (raw: Record<string, unknown>, live: boolean) => {
    const line = str(raw.text);
    if (!line) return;
    // Über Teil-Grenzen kann dieselbe Szene zweimal beschrieben werden → gleiche Zeile nicht doppeln.
    const key = line.trim().toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const scene: DerivedScene = {
      text: line,
      time: str(raw.time),
      setting: str(raw.setting),
      pov: str(raw.pov),
      characters: sceneCharacters(raw.characters),
    };
    scenes.push(scene);
    if (live) handlers.onScene?.(scene);
  };

  for (const [index, part] of parts.entries()) {
    const partLabel =
      parts.length > 1
        ? ` (part ${index + 1} of ${parts.length} — continue the list, do not repeat earlier scenes)`
        : "";
    const before = scenes.length;
    const consumer = createJsonlConsumer((parsed) => collect(parsed, true));

    const call = await chatCompletionStream(
      {
        model: input.model,
        system: scenesDeriveSystem(input.language),
        user: `${input.hint?.trim() ? `CHAPTER SUMMARY (context, may be incomplete):\n${input.hint.trim()}\n\n` : ""}CHAPTER: ${input.chapterTitle || "(untitled)"}${partLabel}

TEXT:
${part}

Split this text into scenes now as JSONL (one object per line), entirely in ${input.language}.`,
        maxTokens: 2000,
        temperature: 0.2,
      },
      consumer.push,
    );
    consumer.flush();

    // Nichts als JSONL für diesen Teil? Dann hat das Modell ein JSON-Dokument geliefert.
    if (scenes.length === before) {
      const parsed = parseJson(call.content, "Szenen-Ableitung");
      const list = Array.isArray(parsed.scenes) ? parsed.scenes : [];
      for (const entry of list) collect(asRecord(entry), false);
    }

    handlers.onPart?.(index + 1, parts.length);
  }

  if (scenes.length === 0) {
    throw new ApiError("Das Modell hat keine Szenen geliefert — bitte erneut versuchen.", 502);
  }
  return scenes;
}

export interface WorldExtractInput {
  storyboard: Storyboard;
  model: string;
  language: string;
  /** Bereits getrackte Einträge — werden nicht erneut vorgeschlagen. */
  knownEntries?: { title: string; category: string }[];
  /**
   * Das Manuskript (Kapitel für Kapitel). Ist es vorhanden, liest die Extraktion **den Text** —
   * die Storyboard-Kurzfassungen verraten nur, was im Plan steht, nicht was im Buch vorkommt.
   */
  chapters?: { title: string; text: string }[];
}

function storyboardOutline(storyboard: Storyboard): string {
  const characters = storyboard.characters
    .map((character) => `- ${character.name} (${character.role}): ${character.description}`)
    .join("\n");
  const chapters = storyboard.chapters
    .map((chapter, index) => `${index + 1}. ${chapter.title} — ${chapter.summary} [${chapter.setting}]`)
    .join("\n");

  return `TITLE: ${storyboard.title}
GENRE: ${storyboard.genre}
TONE: ${storyboard.tone}
LOGLINE: ${storyboard.logline}
SYNOPSIS: ${storyboard.synopsis}
THEMES: ${storyboard.themes.join(", ")}

CHARACTERS:
${characters || "- (none)"}

CHAPTERS:
${chapters}`;
}

/**
 * Extraktionsauftrag + Regeln des Weltenbaus — gilt je **Kapitel** (Manuskript) oder, wenn kein
 * Manuskript vorliegt, für das **Storyboard**.
 */
function worldBrief(language: string, source: "chapter" | "storyboard"): string {
  const label = source === "chapter" ? "chapter text" : "storyboard";
  return `You are a worldbuilding editor.
${languageLock(language)}

TASK: from the ${label} below, extract the worldbuilding it actually contains.
Cover locations, factions, magic/technology systems, important artifacts/objects, and lore/history.

Rules:
- Use the EXACT names the ${label} already uses. Never rename or embellish them.
- Only include concepts the ${label} actually supports. 2-4 per category is normal —
  do NOT invent filler to reach a minimum, and skip a category honestly if it is empty.
- NEVER list the same concept twice — not within a category, not across categories
  (a faction is not also "lore", a place is not also an "artifact").
- NEVER return a concept that is already tracked (see ALREADY TRACKED below) —
  not the same name, and not a rephrasing of it.
- name: short (2-5 words); description: 1-2 sentences.
- Everything in ${language}.`;
}

function worldStreamSystem(language: string, source: "chapter" | "storyboard" = "storyboard"): string {
  return `${worldBrief(language, source)}

Respond ONLY with one JSON object per line (JSONL), one per concept:
{"category":"Ort","name":"…","description":"…"}
{"category":"Fraktion","name":"…","description":"…"}
{"category":"Magie","name":"…","description":"…"}
{"category":"Artefakt","name":"…","description":"…"}
{"category":"Lore","name":"…","description":"…"}

${jsonlFormatBlock(language, `{"category":"Ort","name":"…","description":"…"}`)}
Rules:
- category MUST be one of: Ort, Fraktion, Magie, Artefakt, Lore.
- Skip empty categories entirely — do not emit placeholder lines.`;
}

/** Ordnet eine JSONL-Zeile einer Welt-Kategorie zu (deutsche wie englische Schreibweise). */
function worldCategoryOf(value: unknown): keyof StoryWorld | null {
  const key = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (key === "ort" || key === "locations" || key === "location") return "locations";
  if (key === "fraktion" || key === "factions" || key === "faction") return "factions";
  if (key === "magie" || key === "magic") return "magic";
  if (key === "artefakt" || key === "artifacts" || key === "artifact") return "artifacts";
  if (key === "lore") return "lore";
  return null;
}

export interface WorldStreamHandlers {
  /** Ein fertiger Vorschlag (live, bereits gegen den Text geprüft bzw. aus dem Storyboard). */
  onEntry?: (entry: { category: keyof StoryWorld; name: string; description: string }) => void;
  /** Ein Kapitel wird gelesen (nur im Manuskript-Modus). */
  onChapter?: (info: { index: number; total: number; title: string }) => void;
  /** Ein Kapitel ist durch (nur im Manuskript-Modus). */
  onChapterDone?: (info: { index: number; total: number; title: string; found: number }) => void;
  /** Ein Kapitel wurde übersprungen — der Lauf geht weiter. */
  onWarning?: (message: string) => void;
}

export interface WorldScanResult {
  world: StoryWorld;
  /** Übersprungene Kapitel und Namen, die nicht im Text standen. */
  warnings: string[];
  /** `true` = über das Manuskript gelesen, `false` = nur das Storyboard (kein Manuskript da). */
  scannedManuscript: boolean;
}

/** Wortbudget eines Kapitel-Teils. */
const WORLD_CHUNK_WORDS = 2500;

/**
 * Gestreamte Weltenbau-Extraktion.
 *
 * **Mit Manuskript:** Kapitel für Kapitel über den **vollen Text** (lange Kapitel absatzsicher
 * geteilt), die schon gefundenen Einträge gehen als „ALREADY TRACKED" in den nächsten Aufruf, und
 * ein einzelnes kaputtes Kapitel reißt den Lauf nicht ab. Vorher las die Extraktion nur das
 * **Storyboard** — also Kapitel-Kurzfassungen; alles, was nur im Fließtext vorkam (ein Ort, der
 * einmal genannt wird), konnte so nie gefunden werden.
 *
 * **Ohne Manuskript:** wie bisher aus dem Storyboard, damit ein Buch ohne Prosa weiterhin eine
 * Welt bekommt. Der Rückgabewert sagt, welcher Weg genommen wurde (`scannedManuscript`).
 */
export async function extractWorldStream(
  input: WorldExtractInput,
  handlers: WorldStreamHandlers = {},
): Promise<WorldScanResult> {
  const known = worldKnownList(input);
  const collected: StoryWorld = { locations: [], factions: [], magic: [], artifacts: [], lore: [] };
  const warnings: string[] = [];
  /** Kategorie + normalisierter Name — verhindert Dubletten über Kapitel hinweg. */
  const seen = new Set(known.map((entry) => `${entry.category}|${normalizeWorldTitle(entry.title)}`));
  const rejected = new Set<string>();
  let unverified = 0;

  const entryCount = () => worldEntryCount(normalizeWorld(collected));

  /** Nimmt eine Modellzeile auf — Prüfung, Dublette und Zählung an **einer** Stelle. */
  const accept = (parsed: Record<string, unknown>, text: string, state: { count: number }) => {
    const category = worldCategoryOf(parsed.category);
    if (!category) return;
    const name = str(parsed.name);
    if (!name) return;
    const key = `${category}|${normalizeWorldTitle(name)}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (text && !nameAppearsInText(name, text)) {
      // Weltnamen werden im Text oft umschrieben („Blutmagie" vs. „blutige Magie"). Deshalb wird
      // **nicht** verworfen wie bei Figuren — unbelegte Vorschläge werden gezählt und gemeldet,
      // entschieden wird im Review-Dialog.
      if (!rejected.has(key)) {
        rejected.add(key);
        unverified += 1;
      }
    }
    const description = str(parsed.description);
    (collected[category] as WorldItem[]).push({ name, description });
    state.count += 1;
    handlers.onEntry?.({ category, name, description });
  };

  const chapters = (input.chapters ?? []).filter((chapter) => chapter.text.trim().length > 0);

  if (chapters.length === 0) {
    // Kein Manuskript: aus dem Storyboard ableiten (unverändert zum bisherigen Weg).
    const knownBlock = known.map((entry) => `- [${entry.category}] ${entry.title}`).join("\n");
    const consumer = createJsonlConsumer((parsed) => accept(parsed, "", { count: 0 }));
    const { content } = await chatCompletionStream(
      {
        model: input.model,
        system: worldStreamSystem(input.language, "storyboard"),
        user: `${storyboardOutline(input.storyboard)}

ALREADY TRACKED (do not return these — not as duplicates, not rephrased):
${knownBlock || "- (none)"}

Extract only the worldbuilding that is missing so far, as JSONL (one object per line), entirely in ${input.language}.`,
        maxTokens: 3500,
        temperature: 0.5,
      },
      consumer.push,
    );
    consumer.flush();

    // Kam nichts live an (Provider ohne echte Textstücke)? Dann den fertigen Text nachverarbeiten.
    let world = normalizeWorld(collected);
    if (worldEntryCount(world) === 0) {
      consumeJsonlText(content, (parsed) => accept(parsed, "", { count: 0 }));
      world = normalizeWorld(collected);
    }
    // Immer noch nichts? Dann hat das Modell ein normales JSON-Dokument geliefert.
    if (worldEntryCount(world) === 0) {
      return {
        world: dedupeWorldResponse(normalizeWorld(parseJson(content, "Weltenbau")), known),
        warnings,
        scannedManuscript: false,
      };
    }
    return { world: dedupeWorldResponse(world, known), warnings, scannedManuscript: false };
  }

  for (const [index, chapter] of chapters.entries()) {
    const title = chapter.title.trim() || `Kapitel ${index + 1}`;
    handlers.onChapter?.({ index, total: chapters.length, title });
    const parts = splitIntoChunks(chapter.text, WORLD_CHUNK_WORDS);
    /** Zähler je Kapitel — gilt über **alle** Teile (die Grenze steht so auch im Auftrag). */
    const state = { count: 0 };

    for (const [partIndex, part] of parts.entries()) {
      const acceptPart = (parsed: Record<string, unknown>) => accept(parsed, part, state);
      const consumer = createJsonlConsumer(acceptPart);
      const before = state.count;

      try {
        const { content, finishReason } = await chatCompletionStream(
          {
            model: input.model,
            system: worldStreamSystem(input.language, "chapter"),
            user: worldChapterUser(
              input,
              {
                label: title,
                part: partIndex + 1,
                parts: parts.length,
                text: part,
              },
              [...known, ...worldTitles(collected)],
            ),
            maxTokens: 2500,
            temperature: 0.4,
          },
          consumer.push,
        );
        consumer.flush();

        if (finishReason === "length") {
          warnings.push(
            `Kapitel ${index + 1}${parts.length > 1 ? ` · Teil ${partIndex + 1}` : ""}: Die Antwort lief ins Token-Limit — was bis dahin kam, ist übernommen.`,
          );
          continue;
        }
        if (state.count === before && content.trim()) {
          consumeJsonlText(content, acceptPart);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
        const label = `Kapitel ${index + 1}${parts.length > 1 ? ` · Teil ${partIndex + 1}` : ""}`;
        warnings.push(`${label} übersprungen: ${message}`);
        handlers.onWarning?.(`${label} übersprungen: ${message}`);
        continue;
      }
    }

    handlers.onChapterDone?.({ index, total: chapters.length, title, found: state.count });
  }

  if (unverified > 0) {
    warnings.push(
      unverified === 1
        ? "1 Name stand nicht im gelesenen Text — bitte im Vorschlag prüfen."
        : `${unverified} Namen standen nicht im gelesenen Text — bitte im Vorschlag prüfen.`,
    );
  }

  return { world: dedupeWorldResponse(normalizeWorld(collected), known), warnings, scannedManuscript: true };
}

/** Alle Namen der bisher gesammelten Einträge (für „ALREADY TRACKED" im nächsten Aufruf). */
function worldTitles(world: StoryWorld): { title: string; category: string }[] {
  const pairs: [keyof StoryWorld, string][] = [
    ["locations", "Ort"],
    ["factions", "Fraktion"],
    ["magic", "Magie"],
    ["artifacts", "Artefakt"],
    ["lore", "Lore"],
  ];
  const result: { title: string; category: string }[] = [];
  for (const [key, category] of pairs) {
    for (const item of world[key] ?? []) result.push({ title: item.name, category });
  }
  return result;
}

/** Auftrag für **ein** Kapitel (oder einen Teil davon) — mit allen bereits bekannten Namen. */
function worldChapterUser(
  input: WorldExtractInput,
  chapter: { label: string; part: number; parts: number; text: string },
  tracked: { title: string; category: string }[],
): string {
  const knownBlock = tracked.map((entry) => `- [${entry.category}] ${entry.title}`).join("\n");
  const partNote =
    chapter.parts > 1
      ? ` (part ${chapter.part} of ${chapter.parts} — the text below is only a part of this chapter)`
      : "";

  return `BOOK TITLE: ${input.storyboard.title || "(untitled)"}
GENRE: ${input.storyboard.genre || "(unknown)"}

ALREADY TRACKED (do not return these — not as duplicates, not rephrased):
${knownBlock || "- (none)"}

CHAPTER: ${chapter.label}${partNote}

CHAPTER TEXT:
${chapter.text}

Extract only the worldbuilding of this chapter as JSONL (one object per line), entirely in ${input.language}.`;
}

/** Anzahl der Einträge über alle Welt-Kategorien. */
function worldEntryCount(world: StoryWorld): number {
  return (
    world.locations.length +
    world.factions.length +
    world.magic.length +
    world.artifacts.length +
    world.lore.length
  );
}

/** Extraktionsauftrag + Regeln der Figuren — gilt für **ein Kapitel** je Aufruf. */
function characterExtractBrief(language: string, maxPerChapter: number): string {
  return `You are a continuity editor building a story bible from a finished manuscript.
${languageLock(language)}

TASK: find every NAMED figure that appears in **THIS chapter** (the text below is one chapter).
A "figure" is any named character, creature, deity, AI or personified being — major or minor —
that the text refers to by name (speaking, acting, being described, or being remembered).

Rules:
- ONLY figures supported by this text. Never invent names, roles or facts.
- The name MUST appear **verbatim** in the text below: the server checks every name against it
  and discards names it cannot find. A name that only exists in your head is a lost entry.
- name: exactly as written in the text.
- role: short and concrete — the figure's function in THIS story
  (e.g. "Protagonist", "Antagonist", "Verbündeter", "Auftraggeber", "Nebenfigur").
- description: 1-2 sentences strictly grounded in this chapter (function, relation to others, traits).
- At most ${maxPerChapter} NEW figures for this chapter — most important first. Figures listed
  under ALREADY TRACKED are NOT new: skip them even when they act in this chapter.
- Skip the narrator, unnamed groups ("die Wachen" without a name) and mere mentions of places.
- Every string value MUST be in ${language}.`;
}

function characterExtractStreamSystem(language: string, maxPerChapter: number): string {
  return `${characterExtractBrief(language, maxPerChapter)}

${jsonlFormatBlock(language, `{"name":"…","role":"Protagonist","description":"…"}`)}`;
}

/**
 * Belegprüfung für Figuren-Namen: Der Name muss im **gesehenen Text** vorkommen.
 *
 * Dieselbe Härte wie beim Kanon (`quoteMatchesText`): Ein Name, der nirgends im Kapitel steht,
 * wurde erfunden und gehört nicht in die Figurenliste. Verglichen wird normalisiert
 * (Kleinschreibung, ohne Akzente und Satzzeichen) und ohne Anreden — „Prinzessin Lysara" findet
 * also „Lysara". Reicht der volle Name nicht, genügt der **Kernname** (letztes Wort ≥ 3 Zeichen),
 * weil Namen im Text auch verkürzt vorkommen.
 */
function nameAppearsInText(name: string, text: string): boolean {
  const haystack = new Set(normalizeName(text, new Set()).split(" ").filter(Boolean));
  const cleaned = normalizeCharacterName(name);
  if (!cleaned) return false;
  if (haystack.has(cleaned)) return true;
  const tokens = cleaned.split(" ").filter((token) => token.length >= 3);
  const core = tokens[tokens.length - 1];
  return Boolean(core && haystack.has(core));
}

export interface CharacterStreamHandlers {
  /** Eine fertige Figur (live, bereits gegen den Text geprüft). */
  onCharacter?: (character: StoryCharacter) => void;
  /** Ein Kapitel wird gelesen. */
  onChapter?: (info: { index: number; total: number; title: string }) => void;
  /** Ein Kapitel ist durch. */
  onChapterDone?: (info: { index: number; total: number; title: string; found: number }) => void;
  /** Ein Kapitel wurde übersprungen — der Lauf geht weiter. */
  onWarning?: (message: string) => void;
}

export interface CharacterScanResult {
  characters: StoryCharacter[];
  /** Übersprungene Kapitel und verworfene (nicht im Text belegte) Namen. */
  warnings: string[];
}

/** Neue Figuren je Kapitel (so steht es auch im Auftrag). */
const MAX_CHARACTERS_PER_CHAPTER = 12;
/** Notbremse über das ganze Buch — keine stille Reißleine wie beim alten Ein-Aufruf-Design. */
const MAX_CHARACTERS_TOTAL = 400;
/** Wortbudget eines Kapitel-Teils. Größer als bei den Pässen: die Antwort ist klein. */
const CHARACTER_CHUNK_WORDS = 2500;

/**
 * Gestreamte Figuren-Extraktion — **Kapitel für Kapitel über den vollen Text**.
 *
 * Vorher las ein einziger Aufruf einen **Ausschnitt** (je Kapitel nur der Anfang, zusammen
 * budgetiert): Figuren, die erst später im Kapitel auftraten, konnte das Modell nie sehen. Jetzt
 * wird jedes Kapitel ganz gelesen (lange Kapitel absatzsicher geteilt), und die schon gefundenen
 * Namen gehen als „ALREADY TRACKED" in den nächsten Aufruf — so wächst der Fund mit dem Text,
 * ohne dass etwas doppelt wird. Jeder Name wird gegen den gesehenen Text geprüft (Erfindungen
 * fallen weg und werden gezählt), und ein einzelnes kaputtes Kapitel reißt den Lauf nicht ab.
 */
export async function extractCharactersStream(
  input: CharacterExtractInput,
  handlers: CharacterStreamHandlers = {},
): Promise<CharacterScanResult> {
  const chapters = input.chapters.filter((chapter) => chapter.text.trim().length > 0);
  if (chapters.length === 0) {
    throw new ApiError(
      "Kein Manuskript-Text vorhanden, aus dem Figuren abgeleitet werden könnten.",
      400,
    );
  }

  const found: StoryCharacter[] = [];
  const warnings: string[] = [];
  /** Bereits **angenommene** Namen (klein geschrieben) — verhindert Dubletten über Kapitel hinweg. */
  const seen = new Set(
    input.knownCharacters.map((name) => name.trim().toLowerCase()).filter(Boolean),
  );
  /** Schon einmal verworfene Namen — nur zum Zählen, **nicht** zum Blockieren. */
  const rejected = new Set<string>();
  let unverified = 0;

  for (const [index, chapter] of chapters.entries()) {
    const title = chapter.title.trim() || `Kapitel ${index + 1}`;
    handlers.onChapter?.({ index, total: chapters.length, title });
    const parts = splitIntoChunks(chapter.text, CHARACTER_CHUNK_WORDS);
    let chapterFound = 0;

    for (const [partIndex, part] of parts.entries()) {
      if (found.length >= MAX_CHARACTERS_TOTAL) break;

      /** Nimmt eine Modellzeile auf — Prüfung, Dublette und Zählung an **einer** Stelle. */
      const accept = (parsed: Record<string, unknown>) => {
        const name = str(parsed.name);
        if (!name || chapterFound >= MAX_CHARACTERS_PER_CHAPTER) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return; // bereits angenommen (auch aus einem früheren Kapitel)
        if (!nameAppearsInText(name, part)) {
          // Steht der Name nicht in **diesem** Text, ist er hier erfunden. Er wird aber **nicht**
          // global blockiert: Ein Kapitel wird in Teile zerlegt, und derselbe Name kann im
          // nächsten Teil legitim vorkommen (genau der Fall „Figur tritt erst am Ende auf").
          // Gezählt wird jede Erfindung nur einmal.
          if (!rejected.has(key)) {
            rejected.add(key);
            unverified += 1;
          }
          return;
        }
        seen.add(key);
        const character: StoryCharacter = {
          name,
          role: str(parsed.role, "Figur"),
          description: str(parsed.description),
        };
        found.push(character);
        chapterFound += 1;
        handlers.onCharacter?.(character);
      };

      const consumer = createJsonlConsumer((parsed) => accept(parsed));
      let acceptedInCall = 0;
      const before = found.length;

      try {
        const { content, finishReason } = await chatCompletionStream(
          {
            model: input.model,
            system: characterExtractStreamSystem(input.language, MAX_CHARACTERS_PER_CHAPTER),
            user: characterExtractUser(
              input,
              {
                label: title,
                part: partIndex + 1,
                parts: parts.length,
                text: part,
              },
              [...input.knownCharacters, ...found.map((entry) => entry.name)],
            ),
            maxTokens: 2000,
            temperature: 0.3,
          },
          consumer.push,
        );
        consumer.flush();

        if (finishReason === "length") {
          warnings.push(
            `Kapitel ${index + 1}${parts.length > 1 ? ` · Teil ${partIndex + 1}` : ""}: Die Antwort lief ins Token-Limit — was bis dahin kam, ist übernommen.`,
          );
          continue;
        }

        // Kam nichts live an (Provider ohne echte Textstücke)? Dann den fertigen Text nachverarbeiten.
        if (found.length === before && content.trim()) {
          consumeJsonlText(content, (parsed) => {
            accept(parsed);
            acceptedInCall += 1;
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
        const label = `Kapitel ${index + 1}${parts.length > 1 ? ` · Teil ${partIndex + 1}` : ""}`;
        warnings.push(`${label} übersprungen: ${message}`);
        handlers.onWarning?.(`${label} übersprungen: ${message}`);
        continue;
      }

      void acceptedInCall;
    }

    if (found.length >= MAX_CHARACTERS_TOTAL) {
      warnings.push(
        `Notbremse: nach ${found.length} Figuren abgebrochen — die restlichen Kapitel wurden nicht mehr gelesen.`,
      );
      handlers.onChapterDone?.({ index, total: chapters.length, title, found: chapterFound });
      break;
    }

    handlers.onChapterDone?.({ index, total: chapters.length, title, found: chapterFound });
  }

  if (unverified > 0) {
    warnings.push(
      unverified === 1
        ? "1 Name stand nicht im gelesenen Text und wurde verworfen (Erfindung des Modells)."
        : `${unverified} Namen standen nicht im gelesenen Text und wurden verworfen (Erfindungen des Modells).`,
    );
  }

  return { characters: found, warnings };
}

/** Alle bereits bekannten Einträge (Liste + Storyboard-Welt), dedupliziert. */
function worldKnownList(input: WorldExtractInput): { title: string; category: string }[] {
  const list: { title: string; category: string }[] = [...(input.knownEntries ?? [])];
  const world = input.storyboard.world;
  if (world) {
    const pairs: [keyof StoryWorld, string][] = [
      ["locations", "Ort"],
      ["factions", "Fraktion"],
      ["magic", "Magie"],
      ["artifacts", "Artefakt"],
      ["lore", "Lore"],
    ];
    for (const [key, category] of pairs) {
      for (const item of world[key] ?? []) list.push({ title: item.name, category });
    }
  }

  const seen = new Set<string>();
  return list.filter((entry) => {
    const key = normalizeWorldTitle(entry.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Wirft Dubletten aus der Modellantwort (auch kategorieübergreifend). */
function dedupeWorldResponse(
  world: StoryWorld,
  known: { title: string; category: string }[],
): StoryWorld {
  const seen = new Set(known.map((entry) => normalizeWorldTitle(entry.title)).filter(Boolean));
  const keep = (items: WorldItem[]): WorldItem[] =>
    items.filter((item) => {
      const key = normalizeWorldTitle(item.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return {
    locations: keep(world.locations),
    factions: keep(world.factions),
    magic: keep(world.magic),
    artifacts: keep(world.artifacts),
    lore: keep(world.lore),
  };
}

/**
 * Hinweis: Die **nicht**-streamende Weltenbau-Extraktion (`POST /api/world/extract`) wurde
 * entfernt — sie hatte keinen Aufrufer mehr (die Ansicht nutzt die Stream-Variante), und die
 * Regeln des Repos verbieten Sync-Routen ohne echten Aufrufer.
 */

export interface CharacterExtractInput {
  bookTitle: string;
  genre?: string;
  chapters: { title: string; text: string }[];
  /** Bereits getrackte Figuren — werden aus dem Ergebnis herausgefiltert. */
  knownCharacters: string[];
  model: string;
  language: string;
}

const EXTRACT_MAX_CHAPTER_CHARS = 6000;
const EXTRACT_MIN_CHAPTER_CHARS = 1000;
const EXTRACT_TOTAL_CHARS = 60000;

/**
 * Baut einen Manuskript-Auszug mit begrenztem Budget.
 *
 * Pro Kapitel wird der **Anfang** gelesen (dort werden Figuren eingeführt und
 * beschrieben); das Gesamtbudget wird gleichmäßig auf alle Kapitel verteilt, damit
 * auch spät auftauchende Figuren erfasst werden.
 */
/** Zeichenbudget je Kapitel für Digest- und Batch-Eingaben. */
function excerptBudget(chapterCount: number): number {
  return Math.max(
    EXTRACT_MIN_CHAPTER_CHARS,
    Math.min(
      EXTRACT_MAX_CHAPTER_CHARS,
      Math.floor(EXTRACT_TOTAL_CHARS / Math.max(1, chapterCount)),
    ),
  );
}

/** Ein Kapitel als Auszug (Anfang, mit `[…]`-Marke wenn gekürzt) — Basis für Digest und Batches. */
function chapterExcerpt(title: string, text: string, budgetChars: number): string {
  const trimmed = text.trim();
  const slice = trimmed.slice(0, budgetChars);
  const clipped = slice.length < trimmed.length;
  return `### ${title.trim() || "Kapitel"}\n${slice}${clipped ? "\n[…]" : ""}`;
}

export function manuscriptDigest(
  chapters: { title: string; text: string }[],
): string {
  const nonEmpty = chapters.filter((chapter) => chapter.text.trim().length > 0);
  if (nonEmpty.length === 0) return "";

  const budget = excerptBudget(nonEmpty.length);
  return nonEmpty
    .map((chapter, index) =>
      chapterExcerpt(chapter.title.trim() || `Kapitel ${index + 1}`, chapter.text, budget),
    )
    .join("\n\n");
}

/** Normalisiert die Modellantwort: trimmt, dedupliziert und filtert bekannte Figuren. */
export function normalizeExtractedCharacters(
  value: unknown,
  knownCharacters: string[] = [],
): StoryCharacter[] {
  const seen = new Set(
    knownCharacters.map((name) => name.trim().toLowerCase()).filter(Boolean),
  );
  const raw = asRecord(value).characters;

  const result: StoryCharacter[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const item = asRecord(entry);
    const name = str(item.name);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      name,
      role: str(item.role, "Figur"),
      description: str(item.description),
    });
  }
  return result;
}

/**
 * Auftrag für **ein** Kapitel (oder einen Teil davon). Die bereits gefundenen Namen stehen als
 * „ALREADY TRACKED" drin — so wächst der Fund mit dem Text, ohne dass Namen doppelt auftauchen.
 */
function characterExtractUser(
  input: CharacterExtractInput,
  chapter: { label: string; part: number; parts: number; text: string },
  tracked: string[],
): string {
  const known = tracked
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => `- ${name}`)
    .join("\n");
  const partNote =
    chapter.parts > 1
      ? ` (part ${chapter.part} of ${chapter.parts} — the text below is only a part of this chapter)`
      : "";

  return `BOOK TITLE: ${input.bookTitle || "(untitled)"}
GENRE: ${input.genre || "(unknown)"}

ALREADY TRACKED (do not list these):
${known || "- (none)"}

CHAPTER: ${chapter.label}${partNote}

CHAPTER TEXT:
${chapter.text}

Extract the named figures of this chapter now as JSONL (one object per line), entirely in ${input.language}.`;
}

/**
 * Hinweis: Die **nicht**-streamende Figuren-Extraktion (`POST /api/characters/extract`) wurde
 * entfernt — sie hatte keinen Aufrufer mehr (die Ansicht nutzt die Stream-Variante), und die
 * Regeln des Repos verbieten Sync-Routen ohne echten Aufrufer. „Ein Kern, zwei Transporte" gilt
 * hier nicht: Die Kapitel-Schleife ist ohne Fortschrittsmeldung nicht benutzbar.
 */
