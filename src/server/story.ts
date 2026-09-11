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
import { chatCompletion, chatCompletionDetailed, cleanJsonBlock } from "./llm";
import { extractProse, looksTruncated } from "../lib/prose";
import { normalizeWorldTitle } from "../lib/worldMatch";

export interface StoryboardInput {
  idea: string;
  model: string;
  language: string;
  chapters: number;
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

function parseJson(content: string, label: string): Record<string, unknown> {
  try {
    return JSON.parse(cleanJsonBlock(content)) as Record<string, unknown>;
  } catch {
    console.error(`[story] invalid JSON (${label}):`, content.slice(0, 400));
    throw new ApiError(
      `Das ${label}-JSON war ungültig. Bitte erneut versuchen oder ein anderes Modell wählen.`,
      502,
    );
  }
}

/** Strong, repeated language instruction used in every prompt. */
function languageLock(language: string): string {
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

function detailUser(meta: OutlineMeta, titles: string[], start: number, end: number): string {
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

REMINDER: the whole story must be fully resolved by chapter ${titles.length}. If this batch contains the finale, its summary must describe the climax and resolution.

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

export async function generateStoryboard(input: StoryboardInput): Promise<Storyboard> {
  const chapters = clampChapters(input.chapters);
  const language = input.language;

  // Phase 1: outline — metadata + exactly N chapter titles.
  const outlineRaw = await chatCompletion({
    model: input.model,
    system: storyArchitectSystem(language, chapters),
    user: `BOOK IDEA:\n${input.idea}\n\nCreate the storyboard outline with EXACTLY ${chapters} chapter titles now as JSON.`,
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

  // Phase 2: detail chapters in batches (keeps every response small).
  const plans: ChapterPlan[] = [];
  for (let start = 0; start < chapters; start += BATCH_SIZE) {
    const end = Math.min(chapters, start + BATCH_SIZE);
    const batchRaw = await chatCompletion({
      model: input.model,
      system: chapterDetailSystem(language),
      user: detailUser(meta, titles, start, end),
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
  }

  return { ...meta, chapters: plans };
}

export interface ChapterInput {
  storyboard: Storyboard;
  chapterIndex: number;
  model: string;
  language: string;
  scenes?: SceneConstraint[];
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
): string {
  const characters = storyboard.characters
    .map((character) => `- ${character.name} (${character.role}): ${character.description}`)
    .join("\n");

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
${chapter.foreshadowing.map((item) => `- ${item}`).join("\n") || "- (none)"}`;
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

export async function draftChapter(input: ChapterInput): Promise<string> {
  const chapter = input.storyboard.chapters[input.chapterIndex];
  if (!chapter) {
    throw new ApiError("Kapitel nicht gefunden.", 400);
  }

  const user = `${storyboardContext(input.storyboard, chapter, input.scenes)}

OUTPUT LANGUAGE: ${input.language}
Write the ~500 word rough draft of this chapter now.`;

  const content = await chatCompletion({
    model: input.model,
    system: roughDraftSystem(input.language),
    user,
    maxTokens: 2000,
    temperature: 0.9,
  });

  return completeProse({
    model: input.model,
    system: roughDraftSystem(input.language),
    language: input.language,
    text: stripLeadingHeadings(extractProse(content)),
    label: "rough draft",
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
async function completeProse(params: {
  model: string;
  system: string;
  language: string;
  text: string;
  label: string;
}): Promise<string> {
  let text = params.text;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!looksTruncated(text)) break;

    const tail = text.slice(-2000);
    const { content, finishReason } = await chatCompletionDetailed({
      model: params.model,
      system: params.system,
      user: `${languageLock(params.language)}
CONTINUATION REQUEST: the ${params.label} below breaks off mid-sentence.
Continue the prose seamlessly from where it stops — same voice, same tense, same scene.
Do NOT repeat anything, do NOT restart, do NOT add headings, titles, notes or markers, do NOT summarise.
Write at least 150 more words and finish on a complete sentence or a deliberate hook.

END OF THE ${params.label.toUpperCase()} SO FAR (for continuity):
...${tail}

Continue now, entirely in ${params.language}.`,
      maxTokens: 2500,
      temperature: 0.85,
    });

    const appended = extractProse(stripLeadingHeadings(content.trim()));
    if (!appended) break;
    text = `${text}\n\n${appended}`;

    // Auch die Fortsetzung kann ins Limit laufen — dann erneut versuchen.
    if (finishReason !== "length" && !looksTruncated(text)) break;
  }

  return text;
}

export interface ExpandInput extends ChapterInput {
  draft: string;
  targetWords: number;
}

export async function expandChapter(input: ExpandInput): Promise<string> {
  const chapter = input.storyboard.chapters[input.chapterIndex];
  if (!chapter) {
    throw new ApiError("Kapitel nicht gefunden.", 400);
  }

  const target = Math.max(
    EXPAND_MIN_WORDS,
    Math.min(EXPAND_MAX_WORDS, Number.isFinite(input.targetWords) ? input.targetWords : EXPAND_DEFAULT_WORDS),
  );

  const system = expansionSystem(input.language, target);
  const user = `${storyboardContext(input.storyboard, chapter, input.scenes)}

OUTPUT LANGUAGE: ${input.language}
TARGET LENGTH: at least ${target} words.

ROUGH DRAFT TO EXPAND:
${input.draft.trim() || "(none provided — write the full chapter from the plan)"}

Write the complete ${target}-word chapter now, entirely in ${input.language}.`;

  let text = stripLeadingHeadings(
    (
      await chatCompletion({
        model: input.model,
        system,
        user,
        maxTokens: 8000,
        temperature: 0.85,
      })
    ).trim(),
  );

  // Continuation loop: models (especially "lite" ones) often stop short of the target.
  let words = countWords(text);
  let attempts = 0;
  while (words < target * 0.9 && attempts < 3) {
    attempts += 1;
    const remaining = Math.max(300, target - words);
    const tail = text.slice(-2000);
    const { content, finishReason } = await chatCompletionDetailed({
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
    });

    const appended = extractProse(stripLeadingHeadings(content.trim()));
    if (!appended) break;
    text = `${text}\n\n${appended}`;
    words = countWords(text);

    // Genug Wörter, aber mitten im Satz abgebrochen: unten wird vervollständigt.
    if (finishReason !== "length" && words >= target * 0.9) break;
  }

  return completeProse({
    model: input.model,
    system,
    language: input.language,
    text,
    label: "chapter",
  });
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
}

function passContext(
  storyboard: Storyboard,
  chapterIndex: number,
  scenes?: SceneConstraint[],
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
NEXT CHAPTER: ${next ? `${next.title} — ${next.summary}` : "(final chapter — the story must be resolved here)"}`;
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
- one short bullet per fixed issue
</NOTES>
You MUST return the COMPLETE chapter text inside <TEXT> — apply every fix and return the full prose, never a summary and never the unchanged original.
Everything in ${language}.`;
}

function styleSystem(language: string): string {
  return `You are a meticulous line editor.
${languageLock(language)}

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
- one short bullet per notable improvement
</NOTES>
You MUST return the COMPLETE chapter text inside <TEXT> — apply every improvement and return the full prose, never a summary and never the unchanged original.
Everything in ${language}.`;
}

async function runPass(kind: "consistency" | "style", input: PassInput): Promise<PassResult> {
  const chapter = input.storyboard.chapters[input.chapterIndex];
  if (!chapter) {
    throw new ApiError("Kapitel nicht gefunden.", 400);
  }

  const content = await chatCompletion({
    model: input.model,
    system: kind === "consistency" ? consistencySystem(input.language) : styleSystem(input.language),
    user: `${passContext(input.storyboard, input.chapterIndex, input.scenes)}

CHAPTER TEXT:
${input.text}

${
      kind === "consistency"
        ? "Apply the continuity and logic fixes now, then list them in <NOTES>."
        : "Polish the prose now, then list what you improved in <NOTES>."
    }`,
    maxTokens: 9000,
    temperature: kind === "consistency" ? 0.35 : 0.6,
  });

  const parsed = parsePassOutput(content);
  const previousText = input.text.trim();
  let nextText = parsed.text.trim();

  if (nextText.length === 0) {
    throw new ApiError(
      "Das Modell hat keinen überarbeiteten Text geliefert. Bitte ein anderes/größeres Modell wählen.",
      502,
    );
  }

  // Am Token-Limit abgebrochene Überarbeitung zu Ende schreiben.
  if (looksTruncated(nextText)) {
    nextText = await completeProse({
      model: input.model,
      system:
        kind === "consistency" ? consistencySystem(input.language) : styleSystem(input.language),
      language: input.language,
      text: nextText,
      label: "chapter",
    });
  }

  if (previousText.length > 200 && nextText.length < previousText.length * 0.4) {
    throw new ApiError(
      "Die Antwort war unvollständig (der Text wurde stark gekürzt). Bitte erneut versuchen oder ein anderes Modell wählen.",
      502,
    );
  }

  const changed = nextText !== previousText;
  const notes = changed
    ? [...parsed.notes]
    : [
        ...parsed.notes,
        "⚠️ Keine Textänderung erkannt — das Modell hat den Text unverändert zurückgegeben. Ggf. ein stärkeres Modell wählen.",
      ];
  if (looksTruncated(nextText)) {
    notes.push(
      "⚠️ Das Kapitel endet weiterhin mitten im Satz. Bitte erneut prüfen oder ein Modell mit größerem Ausgabelimit wählen.",
    );
  }

  return { text: nextText, notes, changed };
}

export function checkConsistency(input: PassInput): Promise<PassResult> {
  return runPass("consistency", input);
}

export function refineStyle(input: PassInput): Promise<PassResult> {
  return runPass("style", input);
}

/* ───────────────────────── timeline validation ───────────────────────── */

export interface TimelineInput {
  storyboard: Storyboard;
  scenesByChapter: SceneConstraint[][];
  model: string;
  language: string;
}

export interface TimelineResult {
  summary: string;
  findings: string[];
}

function timelineSystem(language: string): string {
  return `You are a continuity editor specialised in chronology.
${languageLock(language)}

TASK: check the chapter/scene timeline for contradictions and impossibilities:
- times that jump backwards within a chapter's scene order
- travel, preparation or recovery times that cannot fit the stated span
- day/night, season or weather contradicting the order
- ages, dates or durations that do not add up
- scenes whose stated time is missing or clashes with the chapter summary

Respond ONLY with a single valid JSON object:
{ "summary": string, "findings": string[] }
Rules:
- findings: one short, concrete bullet per problem, referencing chapter and scene numbers.
- If the chronology is consistent, findings MUST be an empty array and the summary should say so.
- All text in ${language}.`;
}

export async function checkTimeline(input: TimelineInput): Promise<TimelineResult> {
  const listing = input.storyboard.chapters
    .map((chapter, index) => {
      const scenes = input.scenesByChapter[index] ?? [];
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

  const content = await chatCompletion({
    model: input.model,
    system: timelineSystem(input.language),
    user: `TIMELINE:\n${listing}\n\nCheck the chronology now and return the JSON, entirely in ${input.language}.`,
    json: true,
    maxTokens: 2500,
    temperature: 0.3,
  });

  const parsed = parseJson(content, "Timeline");
  return {
    summary: str(parsed.summary),
    findings: strArray(parsed.findings),
  };
}

/* ───────────────────────────── world extraction ───────────────────────────── */

export interface WorldExtractInput {
  storyboard: Storyboard;
  model: string;
  language: string;
  /** Bereits getrackte Einträge — werden nicht erneut vorgeschlagen. */
  knownEntries?: { title: string; category: string }[];
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

function worldSystem(language: string): string {
  return `You are a worldbuilding editor.
${languageLock(language)}

TASK: from the storyboard below, extract the worldbuilding it actually contains.
Cover locations, factions, magic/technology systems, important artifacts/objects, and lore/history.

Respond ONLY with a single valid JSON object:
{
  "locations": [{ "name": string, "description": string }],
  "factions": [{ "name": string, "description": string }],
  "magic": [{ "name": string, "description": string }],
  "artifacts": [{ "name": string, "description": string }],
  "lore": [{ "name": string, "description": string }]
}
Rules:
- Use the EXACT names the storyboard already uses. Never rename or embellish them.
- Only include concepts the storyboard actually supports. 2-4 per category is normal —
  do NOT invent filler to reach a minimum, and skip a category honestly if it is empty.
- NEVER list the same concept twice — not within a category, not across categories
  (a faction is not also "lore", a place is not also an "artifact").
- NEVER return a concept that is already tracked (see ALREADY TRACKED below) —
  not the same name, and not a rephrasing of it.
- name: short (2-5 words); description: 1-2 sentences.
- Everything in ${language}.`;
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

export async function extractWorld(input: WorldExtractInput): Promise<StoryWorld> {
  const known = worldKnownList(input);
  const knownBlock = known
    .map((entry) => `- [${entry.category}] ${entry.title}`)
    .join("\n");

  const content = await chatCompletion({
    model: input.model,
    system: worldSystem(input.language),
    user: `${storyboardOutline(input.storyboard)}

ALREADY TRACKED (do not return these — not as duplicates, not rephrased):
${knownBlock || "- (none)"}

Extract only the worldbuilding that is missing so far, as JSON, entirely in ${input.language}.`,
    json: true,
    maxTokens: 3500,
    temperature: 0.5,
  });

  return dedupeWorldResponse(normalizeWorld(parseJson(content, "Weltenbau")), known);
}

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
export function manuscriptDigest(
  chapters: { title: string; text: string }[],
): string {
  const nonEmpty = chapters.filter((chapter) => chapter.text.trim().length > 0);
  if (nonEmpty.length === 0) return "";

  const perChapter = Math.max(
    EXTRACT_MIN_CHAPTER_CHARS,
    Math.min(EXTRACT_MAX_CHAPTER_CHARS, Math.floor(EXTRACT_TOTAL_CHARS / nonEmpty.length)),
  );

  return nonEmpty
    .map((chapter, index) => {
      const text = chapter.text.trim();
      const slice = text.slice(0, perChapter);
      const clipped = slice.length < text.length;
      const title = chapter.title.trim() || `Kapitel ${index + 1}`;
      return `### ${title}\n${slice}${clipped ? "\n[…]" : ""}`;
    })
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

function characterExtractSystem(language: string): string {
  return `You are a continuity editor building a story bible from a finished manuscript.
${languageLock(language)}

TASK: find every NAMED figure that actually appears in the manuscript excerpts below.
A "figure" is any named character, creature, deity, AI or personified being — major or minor —
that the text refers to by name (speaking, acting, being described, or being remembered).

Respond ONLY with a single valid JSON object:
{ "characters": [{ "name": string, "role": string, "description": string }] }

Rules:
- ONLY figures supported by the text. Never invent names, roles or facts.
- name: exactly as written in the manuscript.
- role: short and concrete — the figure's function in THIS story
  (e.g. "Protagonist", "Antagonist", "Verbündeter", "Auftraggeber", "Nebenfigur").
- description: 1-2 sentences strictly grounded in the excerpts (function, relation to others, traits).
- Skip the narrator, unnamed groups ("die Wachen" without a name) and mere mentions of places.
- Skip every name listed under ALREADY TRACKED.
- Order by importance, most important first.
- Every string value MUST be in ${language}.`;
}

function characterExtractUser(
  input: CharacterExtractInput,
  digest: string,
): string {
  const known = input.knownCharacters
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => `- ${name}`)
    .join("\n");

  return `BOOK TITLE: ${input.bookTitle || "(untitled)"}
GENRE: ${input.genre || "(unknown)"}

ALREADY TRACKED (do not list these):
${known || "- (none)"}

MANUSCRIPT EXCERPTS:
${digest}

Extract the named figures now as JSON, with roles and descriptions in ${input.language}.`;
}

/** Leitet benannte Figuren aus dem Manuskript ab (findet auch Storyboard-unbekannte Figuren). */
export async function extractCharacters(
  input: CharacterExtractInput,
): Promise<StoryCharacter[]> {
  const digest = manuscriptDigest(input.chapters);
  if (!digest.trim()) {
    throw new ApiError(
      "Kein Manuskript-Text vorhanden, aus dem Figuren abgeleitet werden könnten.",
      400,
    );
  }

  const { content, finishReason } = await chatCompletionDetailed({
    model: input.model,
    system: characterExtractSystem(input.language),
    user: characterExtractUser(input, digest),
    json: true,
    maxTokens: 4000,
    temperature: 0.4,
  });

  if (finishReason === "length") {
    throw new ApiError(
      "Die Figuren-Extraktion wurde vom Token-Limit abgeschnitten. Bitte ein Modell mit größerem Kontext wählen oder erneut versuchen.",
      502,
    );
  }

  return normalizeExtractedCharacters(
    parseJson(content, "Figuren-Extraktion"),
    input.knownCharacters,
  );
}
