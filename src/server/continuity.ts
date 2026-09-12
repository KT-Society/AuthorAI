/**
 * Server-only: Kontinuitäts-Extraktion (Fakten + Beziehungen) aus Storyboard und Register.
 *
 * Liefert **Namen**, keine IDs — die Zuordnung auf Charakter-/Welt-IDs macht der Client.
 * Nur Modul für den Server; niemals aus Client-Code importieren.
 */

import { ApiError } from "@promptgen/server/api";

import {
  FACT_KINDS,
  RELATION_KINDS,
} from "../data/continuity";
import type {
  ExtractedContinuity,
  ExtractedFact,
  ExtractedRelation,
  FactEntityType,
  FactKind,
  RelationKind,
} from "../data/continuity";
import type { Storyboard } from "../data/story";
import { countWords } from "../data/story";
import { extractProse } from "../lib/prose";
import { chatCompletionDetailed, cleanJsonBlock } from "./llm";
import { languageLock, splitIntoChunks } from "./story";

export interface ContinuityExtractInput {
  storyboard: Storyboard;
  /** Figuren-Register des Projekts. */
  characters: { name: string; role?: string }[];
  /** Namen der Welteneinträge des Projekts (optional, ergänzt die Storyboard-Welt). */
  worldNames?: string[];
  /** Bereits erfasste Aussagen → nicht erneut vorschlagen. */
  knownStatements?: string[];
  /** Bereits erfasste Beziehungen im Format "A→B:kind". */
  knownRelations?: string[];
  model: string;
  language: string;
}

const MAX_FACTS = 24;
const MAX_RELATIONS = 20;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

/** Toleranter Namensvergleich (Case, Akzente, Satzzeichen, Leerraum egal). */
function nameKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Findet den kanonischen Namen aus dem Register (oder null). */
function matchName(candidate: string, names: string[]): string | null {
  const key = nameKey(candidate);
  if (!key) return null;
  for (const name of names) {
    if (nameKey(name) === key) return name;
  }
  // Teiltreffer: „Kiro" ↔ „Kiro Tanaka", aber nur wenn eindeutig.
  const partial = names.filter((name) => {
    const other = nameKey(name);
    return other.includes(key) || key.includes(other);
  });
  return partial.length === 1 ? (partial[0] ?? null) : null;
}

function clampIntensity(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(Math.max(-1, Math.min(1, parsed)) * 10) / 10;
}

function parseJson(content: string): Record<string, unknown> {
  try {
    return JSON.parse(cleanJsonBlock(content)) as Record<string, unknown>;
  } catch {
    console.error("[continuity] invalid JSON:", content.slice(0, 400));
    throw new ApiError(
      "Das Kontinuitäts-JSON war ungültig. Bitte erneut versuchen oder ein anderes Modell wählen.",
      502,
    );
  }
}

/** Alle im Material bekannten Entitätsnamen (Figur/Welt), dedupliziert. */
export function knownEntityNames(input: {
  characters: { name: string }[];
  worldNames?: string[];
  storyboard: Storyboard;
}): { characters: string[]; world: string[] } {
  const characters = [...new Set(input.characters.map((entry) => entry.name.trim()).filter(Boolean))];
  const fromStoryboard = input.storyboard.world
    ? [
        ...input.storyboard.world.locations,
        ...input.storyboard.world.factions,
        ...input.storyboard.world.magic,
        ...input.storyboard.world.artifacts,
        ...input.storyboard.world.lore,
      ].map((item) => item.name)
    : [];
  const world = [
    ...new Set([...(input.worldNames ?? []), ...fromStoryboard].map((name) => name.trim()).filter(Boolean)),
  ];
  return { characters, world };
}

function continuitySystem(language: string): string {
  return `You are a continuity editor building a story bible.
${languageLock(language)}

TASK: from the material below, extract (1) facts that are explicitly established and
(2) relationships between the listed characters that the material actually shows.

Respond ONLY with a single valid JSON object:
{
  "facts": [{ "entity": string, "entityType": "character" | "world", "kind": string,
              "statement": string, "establishedIn": string, "hard": boolean }],
  "relations": [{ "from": string, "to": string, "kind": string, "intensity": number,
                  "note": string, "secret": boolean, "establishedIn": string }]
}

FACT RULES
- "entity" MUST be one of the names listed under KNOWN CHARACTERS or KNOWN WORLD ENTITIES.
- "kind" MUST be one of: ${FACT_KINDS.join(", ")}.
  attribute = stable trait/age/role · history = past event · skill = ability
  possession = important object · world = world fact · rule = hard world rule.
- "statement": ONE short, checkable sentence (no hedging, no interpretation).
- "establishedIn": short source label from the material, e.g. "Kapitel 4" or "Storyboard".
- "hard": true only for world rules that must never be broken.
- NEVER invent facts. If the material does not establish it, leave it out.

RELATION RULES
- "from"/"to" MUST be names from KNOWN CHARACTERS.
- "kind" MUST be one of: ${RELATION_KINDS.join(", ")}.
- "intensity": number from -1 (hostile) to 1 (devoted).
- "note": optional short reason grounded in the material.
- "secret": true only if the material marks it as hidden from others.
- Only relationships the material really establishes — no speculation, no filler.

LIMITS
- At most ${MAX_FACTS} facts and ${MAX_RELATIONS} relations; fewer is better than padded.
- Never repeat anything listed under ALREADY TRACKED.
- Statements/notes MUST be in ${language}; all other string values stay exactly as the enums/names.`;
}

function material(input: ContinuityExtractInput): string {
  const { characters, world } = knownEntityNames(input);
  const sb = input.storyboard;

  const cast = input.characters
    .map((entry) => `- ${entry.name}${entry.role?.trim() ? ` (${entry.role.trim()})` : ""}`)
    .join("\n");
  const chapters = sb.chapters
    .map((chapter, index) => `${index + 1}. ${chapter.title} — ${chapter.summary}`)
    .join("\n");
  const worldNames = world.length > 0 ? world.join(", ") : "(none)";

  const tracked = [...(input.knownStatements ?? []), ...(input.knownRelations ?? [])]
    .map((entry) => `- ${entry}`)
    .join("\n");

  return `TITLE: ${sb.title}
GENRE: ${sb.genre}
SYNOPSIS: ${sb.synopsis}
THEMES: ${sb.themes.join(", ")}

KNOWN CHARACTERS:
${cast || "- (none)"}

KNOWN WORLD ENTITIES:
${worldNames}

STORYBOARD CHARACTERS (descriptions):
${sb.characters.map((character) => `- ${character.name} (${character.role}): ${character.description}`).join("\n") || "- (none)"}

CHAPTERS:
${chapters || "- (none)"}

ALREADY TRACKED (do not repeat):
${tracked || "- (none)"}`;
}

/** Rohantwort normalisieren: unbekannte Entitäten verwerfen, Werte validieren, deduplizieren. */
export function normalizeContinuity(
  value: unknown,
  input: ContinuityExtractInput,
): ExtractedContinuity {
  const { characters, world } = knownEntityNames(input);
  const obj = asRecord(value);

  const seenStatements = new Set(
    (input.knownStatements ?? []).map((entry) => nameKey(entry)),
  );
  const facts: ExtractedFact[] = [];
  for (const entry of Array.isArray(obj.facts) ? obj.facts : []) {
    if (facts.length >= MAX_FACTS) break;
    const item = asRecord(entry);
    const rawEntity = str(item.entity);
    const statement = str(item.statement);
    if (!rawEntity || !statement) continue;

    const asCharacter = matchName(rawEntity, characters);
    const asWorld = asCharacter ? null : matchName(rawEntity, world);
    const entityName = asCharacter ?? asWorld;
    if (!entityName) continue; // erfundene Entität → verwerfen

    const entityType: FactEntityType = asCharacter ? "character" : "world";
    const kind = (FACT_KINDS as string[]).includes(str(item.kind))
      ? (str(item.kind) as FactKind)
      : "attribute";

    const key = nameKey(statement);
    if (seenStatements.has(key)) continue;
    seenStatements.add(key);

    facts.push({
      kind,
      entityName,
      entityType,
      statement,
      establishedIn: str(item.establishedIn) || undefined,
      hard: entityType === "world" && item.hard === true ? true : undefined,
    });
  }

  const seenRelations = new Set((input.knownRelations ?? []).map((entry) => nameKey(entry)));
  const relations: ExtractedRelation[] = [];
  for (const entry of Array.isArray(obj.relations) ? obj.relations : []) {
    if (relations.length >= MAX_RELATIONS) break;
    const item = asRecord(entry);
    const fromName = matchName(str(item.from), characters);
    const toName = matchName(str(item.to), characters);
    if (!fromName || !toName || fromName === toName) continue;

    const kind = (RELATION_KINDS as string[]).includes(str(item.kind))
      ? (str(item.kind) as RelationKind)
      : "loyalty";

    const key = nameKey(`${fromName}→${toName}:${kind}`);
    if (seenRelations.has(key)) continue;
    seenRelations.add(key);

    relations.push({
      fromName,
      toName,
      kind,
      intensity: clampIntensity(item.intensity),
      note: str(item.note) || undefined,
      secret: item.secret === true ? true : undefined,
      establishedIn: str(item.establishedIn) || undefined,
    });
  }

  return { facts, relations };
}

/** Extrahiert Fakten und Beziehungen aus Storyboard + Register (ein LLM-Aufruf). */
export async function extractContinuity(
  input: ContinuityExtractInput,
): Promise<ExtractedContinuity> {
  const { content, finishReason } = await chatCompletionDetailed({
    model: input.model,
    system: continuitySystem(input.language),
    user: `${material(input)}

Extract the facts and relationships now as JSON, statements in ${input.language}.`,
    json: true,
    maxTokens: 4000,
    temperature: 0.3,
  });

  if (finishReason === "length") {
    throw new ApiError(
      "Die Kontinuitäts-Extraktion wurde vom Token-Limit abgeschnitten. Bitte ein Modell mit größerem Kontext wählen.",
      502,
    );
  }

  return normalizeContinuity(parseJson(content), input);
}

/* ─────────────────────────── Fakten-Check (Kanon) ─────────────────────────── */

export interface CanonCheckInput {
  storyboard: Storyboard;
  chapterIndex: number;
  text: string;
  /** Fertiger Kanon-Block (`canonBlock`) — gleiche Quelle wie alle Prüf-Pässe. */
  canon: string;
  model: string;
  language: string;
}

export interface CanonViolation {
  /** Der geprüfte Kanon-Eintrag (kurz zitiert). */
  fact: string;
  /** Die widersprechende Stelle im Text. */
  quote: string;
  /** Konkreter Vorschlag zur Auflösung. */
  fix: string;
  /** Teil des Kapitels (bei gechunkter Prüfung), 1-basiert. */
  part?: number;
}

export interface CanonCheckResult {
  ok: boolean;
  summary: string;
  violations: CanonViolation[];
}

const MAX_VIOLATIONS = 20;

function canonCheckSystem(language: string): string {
  return `You are a continuity fact-checker.
${languageLock(language)}

You receive CANON FACTS / RELATIONS (binding) and one PART of a chapter.
Report ONLY passages that contradict the canon — nothing else.

Respond ONLY with a single valid JSON object:
{ "violations": [{ "fact": string, "quote": string, "fix": string }] }

Rules:
- A violation MUST contradict a stated fact, law, timeline, possession, ability or relationship.
- NOT style, pacing, wording, dialogue quality or "could be clearer".
- fact: the canon entry you are checking against, quoted briefly.
- quote: the contradicting passage from the part, verbatim, at most ~20 words.
- fix: one concrete sentence on how to resolve the contradiction.
- If the part is consistent, "violations" MUST be an empty array. Never invent violations.
- All strings in ${language}.`;
}

function canonCheckUser(input: CanonCheckInput, part: string): string {
  const chapter = input.storyboard.chapters[input.chapterIndex];
  return `${input.canon.trim()}

CHAPTER: ${chapter ? `${chapter.index + 1}. ${chapter.title}` : `#${input.chapterIndex + 1}`}

CHAPTER PART TO CHECK:
${part}

Check this part against the canon now and return the JSON, entirely in ${input.language}.`;
}

/** Normalisiert die Modellantwort und wirft Unbrauchbares weg. */
function normalizeViolations(value: unknown, part: number): CanonViolation[] {
  const raw = asRecord(value).violations;
  const result: CanonViolation[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const item = asRecord(entry);
    const fact = str(item.fact);
    const quote = str(item.quote);
    if (!fact || !quote) continue; // ohne beide Seiten ist es keine überprüfbare Meldung
    result.push({ fact, quote, fix: str(item.fix), part });
  }
  return result;
}

/**
 * Prüft ein Kapitel **nur gegen den Kanon** (getrennt von der Kohärenz).
 *
 * Das Kapitel wird gechunkt: dieselbe Robustheitsmaßnahme wie bei Kohärenz/Stil — ein
 * 5.000-Wörter-Kapitel in einem Aufruf läuft ins Ausgabelimit und bricht ab.
 */
export async function checkCanon(input: CanonCheckInput): Promise<CanonCheckResult> {
  if (!input.canon.trim()) {
    throw new ApiError(
      "Kein Kanon vorhanden — bitte zuerst Fakten oder Beziehungen erfassen oder ableiten.",
      400,
    );
  }
  if (!input.text.trim()) {
    throw new ApiError("Kein Kapiteltext für die Prüfung.", 400);
  }

  const chunks = splitIntoChunks(input.text);
  const violations: CanonViolation[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const { content, finishReason } = await chatCompletionDetailed({
      model: input.model,
      system: canonCheckSystem(input.language),
      user: canonCheckUser(input, chunks[index] ?? ""),
      json: true,
      // Ausgabe ist klein (JSON) — Limit bleibt trotzdem deutlich unter Modellgrenzen.
      maxTokens: 1500,
      temperature: 0.1,
      cache: true,
    });

    if (finishReason === "length") {
      throw new ApiError(
        `Der Fakten-Check wurde bei Teil ${index + 1}/${chunks.length} vom Token-Limit abgeschnitten. Bitte ein anderes Modell wählen.`,
        502,
      );
    }

    for (const violation of normalizeViolations(parseJson(content), index + 1)) {
      // Dubletten über Teile hinweg vermeiden (gleicher Fakt + gleiches Zitat).
      const key = `${nameKey(violation.fact)}|${nameKey(violation.quote)}`;
      if (violations.some((item) => `${nameKey(item.fact)}|${nameKey(item.quote)}` === key)) continue;
      if (violations.length >= MAX_VIOLATIONS) break;
      violations.push(violation);
    }
    if (violations.length >= MAX_VIOLATIONS) break;
  }

  const ok = violations.length === 0;
  return {
    ok,
    summary: ok
      ? "Keine Widersprüche zum Kanon gefunden."
      : violations.length === 1
        ? "1 Widerspruch zum Kanon gefunden."
        : `${violations.length} Widersprüche zum Kanon gefunden.`,
    violations,
  };
}

/* ────────────────── Fakten-Check über mehrere Kapitel (Queue) ────────────────── */

export type CanonChapterEvent =
  | { type: "started"; chapterIndex: number }
  | { type: "result"; chapterIndex: number; result?: CanonCheckResult; error?: string };

export interface CanonChaptersInput {
  storyboard: Storyboard;
  chapters: { index: number; text: string }[];
  canon: string;
  model: string;
  language: string;
  /** Gleichzeitige Kapitel-Prüfungen (Standard 3, max 6). */
  concurrency?: number;
}

/**
 * Prüft mehrere Kapitel **mit begrenzter Parallelität** und meldet jedes Ergebnis, sobald es
 * fertig ist. Die Kapitel sind unabhängig — sequenziell wäre die Wartezeit die Summe aller
 * Aufrufe (30 Kapitel ≈ 2,5 Minuten), parallel nur ein Bruchteil davon.
 */
export async function checkCanonChapters(
  input: CanonChaptersInput,
  onEvent: (event: CanonChapterEvent) => void,
): Promise<void> {
  if (!input.canon.trim()) {
    throw new ApiError(
      "Kein Kanon vorhanden — bitte zuerst Fakten oder Beziehungen erfassen oder ableiten.",
      400,
    );
  }

  const pending = [...input.chapters];
  const limit = Math.max(1, Math.min(6, input.concurrency ?? CHECK_CONCURRENCY));
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < pending.length) {
      const item = pending[cursor];
      cursor += 1;
      if (!item) continue;
      onEvent({ type: "started", chapterIndex: item.index });
      try {
        const result = await checkCanon({
          storyboard: input.storyboard,
          chapterIndex: item.index,
          text: item.text,
          canon: input.canon,
          model: input.model,
          language: input.language,
        });
        onEvent({ type: "result", chapterIndex: item.index, result });
      } catch (err) {
        onEvent({
          type: "result",
          chapterIndex: item.index,
          error: err instanceof Error ? err.message : "Unbekannter Fehler.",
        });
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, Math.max(1, pending.length)) }, () => worker()),
  );
}

/* ─────────────────────── Quick-Fix: Widersprüche beheben ─────────────────────── */

export interface CanonRepairInput {
  storyboard: Storyboard;
  chapterIndex: number;
  text: string;
  violations: CanonViolation[];
  canon: string;
  model: string;
  language: string;
}

export interface CanonRepairOutput {
  text: string;
  changed: boolean;
  /** Anzahl der tatsächlich angefassten Widersprüche. */
  applied: number;
  /** Widersprüche, deren Stelle nicht sicher zugeordnet werden konnte. */
  unassigned: number;
}

/** Politur-Grenze: eine Korrektur darf den Text nicht aufblähen. */
const REPAIR_MAX_GROWTH = 1.35;
/** Kapitel-Prüfungen sind unabhängig — begrenzte Parallelität als Standard. */
const CHECK_CONCURRENCY = 3;

function normalizeForMatch(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function repairSystem(language: string): string {
  return `You are a continuity repair editor.
${languageLock(language)}

TASK: fix ONLY the listed canon contradictions in the text part below.

Rules:
- Change as little as possible: repair the contradicting detail, keep every other sentence
  word-for-word.
- Do NOT rewrite style, do NOT add or remove scenes, do NOT change the length noticeably.
- Keep voice, tense, POV and all names that are not part of a contradiction.
- If a listed contradiction cannot be fixed without inventing new plot, restate the detail
  so it no longer contradicts the canon (e.g. drop the exact number/name).
- Remove any passage that only exists because of the contradiction.
- Return ONLY the corrected prose inside <TEXT>…</TEXT>. No notes, no explanation.
Everything in ${language}.`;
}

function repairUser(input: CanonRepairInput, chunk: string, violations: CanonViolation[]): string {
  const chapter = input.storyboard.chapters[input.chapterIndex];
  const list = violations
    .map(
      (violation, index) =>
        `${index + 1}. CANON: ${violation.fact}\n   WRONG IN TEXT: „${violation.quote}"\n   FIX: ${violation.fix || "resolve the contradiction"}`,
    )
    .join("\n");

  return `${input.canon.trim()}

CHAPTER: ${chapter ? `${chapter.index + 1}. ${chapter.title}` : `#${input.chapterIndex + 1}`}

CONTRADICTIONS TO FIX (only these):
${list}

TEXT PART — fix the contradictions, keep everything else as it is:
${chunk}

Return the corrected part now inside <TEXT>…</TEXT>, entirely in ${input.language}.`;
}

/**
 * Behebt die gemeldeten Kanon-Widersprüche in einem Kapitel.
 *
 * Nur Teile, in denen ein gemeldetes Zitat wirklich vorkommt, gehen ans Modell — alles andere
 * bleibt **unangetastet** (spart Aufrufe und verhindert unnötige Umschreibungen). Mit denselben
 * Sicherungen wie die Prüf-Pässe: Ausgabelimit am Chunk, Wachstumsgrenze, Fortsetzung nur bei
 * hartem Token-Limit.
 */
export async function repairCanon(input: CanonRepairInput): Promise<CanonRepairOutput> {
  if (input.violations.length === 0) {
    return { text: input.text, changed: false, applied: 0, unassigned: 0 };
  }

  const chunks = splitIntoChunks(input.text);
  // Vergleichsbasis ist der **normalisierte** Ausgangstext: Chunking trimmt Absätze, das darf
  // nicht als „geändert" gelten.
  const baseline = chunks.join("\n\n").trim();
  const parts: string[] = [];
  let applied = 0;

  for (const chunk of chunks) {
    const haystack = normalizeForMatch(chunk);
    const relevant = input.violations.filter((violation) =>
      violation.quote.trim().length > 0 && haystack.includes(normalizeForMatch(violation.quote)),
    );

    if (relevant.length === 0) {
      parts.push(chunk);
      continue;
    }

    const chunkWords = countWords(chunk);
    const { content, finishReason } = await chatCompletionDetailed({
      model: input.model,
      system: repairSystem(input.language),
      user: repairUser(input, chunk, relevant),
      maxTokens: Math.min(4000, Math.max(800, Math.round(chunkWords * 2.4))),
      temperature: 0.2,
    });

    // Am Limit abgebrochene Korrektur ist nicht vertrauenswürdig → Original behalten.
    if (finishReason === "length") {
      parts.push(chunk);
      continue;
    }

    // Führende Überschriften entfernen (Modelle setzen gern eine).
    const next = extractProse(content)
      .replace(/^#{1,6}[^\n]*\n+/, "")
      .trim();
    if (!next) {
      parts.push(chunk);
      continue;
    }

    if (chunk.length > 200 && next.length > chunk.length * REPAIR_MAX_GROWTH) {
      parts.push(chunk);
      continue;
    }

    parts.push(next);
    applied += relevant.length;
  }

  const text = parts.join("\n\n").trim();
  return {
    text,
    changed: text !== baseline,
    applied,
    // Alles, was nicht angefasst wurde — inklusive Zitaten, die in keinem Teil zu finden waren.
    unassigned: Math.max(0, input.violations.length - applied),
  };
}

/* ───────────────── Quick Fix über mehrere Kapitel (Queue) ───────────────── */

/** Behebt deutlich schwerer als eine Prüfung — deshalb nur zwei Kapitel gleichzeitig. */
const REPAIR_CONCURRENCY = 2;

export interface CanonRepairTarget {
  index: number;
  text: string;
  violations: CanonViolation[];
}

export type CanonRepairEvent =
  | { type: "started"; chapterIndex: number }
  | {
      type: "result";
      chapterIndex: number;
      /** Reparierter Text (nur bei `changed`). */
      text?: string;
      changed?: boolean;
      applied?: number;
      unassigned?: number;
      /** Frische Prüfung **nach** der Korrektur — zeigt, was übrig bleibt. */
      result?: CanonCheckResult;
      error?: string;
    };

export interface CanonRepairChaptersInput {
  storyboard: Storyboard;
  canon: string;
  model: string;
  language: string;
  chapters: CanonRepairTarget[];
  concurrency?: number;
}

/**
 * Quick Fix über mehrere Kapitel mit begrenzter Parallelität: behebt und **prüft danach erneut**,
 * damit das Ergebnis ehrlich ist. Jedes Kapitel wird gemeldet, sobald es fertig ist.
 */
export async function repairCanonChapters(
  input: CanonRepairChaptersInput,
  onEvent: (event: CanonRepairEvent) => void,
): Promise<void> {
  if (!input.canon.trim()) {
    throw new ApiError(
      "Kein Kanon vorhanden — bitte zuerst Fakten oder Beziehungen erfassen oder ableiten.",
      400,
    );
  }

  const pending = [...input.chapters];
  const limit = Math.max(1, Math.min(4, input.concurrency ?? REPAIR_CONCURRENCY));
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < pending.length) {
      const item = pending[cursor];
      cursor += 1;
      if (!item) continue;
      onEvent({ type: "started", chapterIndex: item.index });
      try {
        const repaired = await repairCanon({
          storyboard: input.storyboard,
          chapterIndex: item.index,
          text: item.text,
          violations: item.violations,
          canon: input.canon,
          model: input.model,
          language: input.language,
        });

        // Nachprüfung getrennt behandeln: scheitert sie, wird die **Korrektur trotzdem**
        // geliefert (sie darf nicht verloren gehen) — nur das frische Ergebnis fehlt.
        let result: CanonCheckResult | undefined;
        let recheckError: string | undefined;
        try {
          result = await checkCanon({
            storyboard: input.storyboard,
            chapterIndex: item.index,
            text: repaired.text,
            canon: input.canon,
            model: input.model,
            language: input.language,
          });
        } catch (err) {
          recheckError =
            err instanceof Error ? err.message : "Nachprüfung fehlgeschlagen.";
        }

        onEvent({
          type: "result",
          chapterIndex: item.index,
          text: repaired.text,
          changed: repaired.changed,
          applied: repaired.applied,
          unassigned: repaired.unassigned,
          result,
          error: recheckError,
        });
      } catch (err) {
        onEvent({
          type: "result",
          chapterIndex: item.index,
          error: err instanceof Error ? err.message : "Unbekannter Fehler.",
        });
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, Math.max(1, pending.length)) }, () => worker()),
  );
}
