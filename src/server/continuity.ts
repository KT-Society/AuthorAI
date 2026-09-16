/**
 * Server-only: Kontinuitäts-Extraktion (Fakten + Beziehungen) aus dem **Manuskript**, Kapitel
 * für Kapitel. Jeder Fakt braucht einen wörtlichen Beleg aus dem Kapiteltext (`quoteMatchesText`)
 * — sonst wandert er nicht in den Kanon. Zusätzlich: Fakten-Check, Kanon-Repair, Zusammenfassungen.
 *
 * Liefert **Namen**, keine IDs — die Zuordnung auf Charakter-/Welt-IDs macht der Client.
 * Nur Modul für den Server; niemals aus Client-Code importieren.
 */

import { ApiError } from "@promptgen/server/api";

import { createJsonlConsumer } from "./jsonl";
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
import { relationsMatch, statementsMatch } from "../lib/factMatch";
import { chatCompletionDetailed, chatCompletionStream, cleanJsonBlock } from "./llm";
import { languageLock, splitIntoChunks } from "./story";

export interface ContinuityExtractInput {
  /**
   * Manuskript-Kapitel in Lesereihenfolge — **die Quelle** der Fakten.
   *
   * Vorher wurde aus dem Storyboard (Kurzfassungen!) extrahiert; daraus *musste* das Modell
   * erfinden, und jeder Lauf lieferte andere „Fakten". Jetzt liest die Extraktion den echten Text,
   * Kapitel für Kapitel, und jeder Fakt braucht einen wörtlichen Beleg daraus.
   */
  chapters: { title: string; text: string }[];
  /**
   * Wie viele Kapitel davor übersprungen wurden (0-basiert). Nur für **ehrliche Labels**:
   * Beim Weiterlaufen heißt das erste gelesene Kapitel dann z. B. „Kapitel 7" statt „Kapitel 1"
   * — sonst würde `establishedIn` den falschen Kapitelnamen tragen.
   */
  startChapter?: number;
  /** Figuren-Register des Projekts (nur Zuordnung, keine Quelle). */
  characters: { name: string; role?: string }[];
  /** Namen der Welteneinträge des Projekts (nur Zuordnung). */
  worldNames?: string[];
  /** Bereits erfasste Aussagen → nicht erneut vorschlagen. */
  knownStatements?: string[];
  /** Bereits erfasste Beziehungen im Format "A→B:kind". */
  knownRelations?: string[];
  model: string;
  language: string;
}

/**
 * Grenzen — bewusst getrennt, denn sie haben **verschiedene Bedeutungen**:
 *
 * - `MAX_FACTS_PER_CHAPTER` / `MAX_RELATIONS_PER_CHAPTER`: Das Modell soll je Kapitel nur wenige,
 *   belegte Einträge liefern (steht auch im Prompt). Verhindert, dass ein geschwätziges Kapitel
 *   alles dominiert.
 * - `MAX_FACTS_PER_CALL` / `MAX_RELATIONS_PER_CALL`: reines Sicherheitsnetz je Modellaufruf.
 * - `MAX_FACTS_TOTAL` / `MAX_RELATIONS_TOTAL`: Notbremse für den **ganzen** Scan. Vorher stand hier
 *   24/20 — eine Grenze aus dem alten Ein-Aufruf-Design („extrahiere aus dem Storyboard"), die bei
 *   einem Buch-Scan die Funde **ab Kapitel 4 stillschweigend wegwarf**. Ein Roman hat legitim
 *   hunderte Fakten.
 */
const MAX_FACTS_PER_CHAPTER = 8;
const MAX_RELATIONS_PER_CHAPTER = 6;
const MAX_FACTS_PER_CALL = 24;
const MAX_RELATIONS_PER_CALL = 20;
const MAX_FACTS_TOTAL = 800;
const MAX_RELATIONS_TOTAL = 500;
/** Wortbudget eines Kapitel-Teils (wie bei den Szenen: die Antwort ist klein). */
const CONTINUITY_CHUNK_WORDS = 2500;

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
}): { characters: string[]; world: string[] } {
  const characters = [...new Set(input.characters.map((entry) => entry.name.trim()).filter(Boolean))];
  const world = [
    ...new Set((input.worldNames ?? []).map((name) => name.trim()).filter(Boolean)),
  ];
  return { characters, world };
}

/* ─────────────────────── Beleg-Prüfung (gegen den Text) ─────────────────────── */

/** Für den Beleg-Vergleich normalisieren: Kleinschreibung, Anführungs-/Strichzeichen, Weißraum. */
function normalizeEvidence(text: string): string {
  return text
    .toLowerCase()
    .replace(/[„“”«»‚‘’'"`´]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Wörter ohne Zeichensetzung — Grundlage des toleranten Vergleichs. */
function wordSequence(text: string): string[] {
  return normalizeEvidence(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function containsWindow(haystack: string[], window: string[]): boolean {
  if (window.length === 0 || window.length > haystack.length) return false;
  for (let start = 0; start + window.length <= haystack.length; start += 1) {
    let match = true;
    for (let offset = 0; offset < window.length; offset += 1) {
      if (haystack[start + offset] !== window[offset]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

/**
 * Steht der Beleg **wirklich** im Text?
 *
 * Tolerant gegenüber Weißraum, Zeichensetzung und typografischen Anführungszeichen (bekannte
 * Fallen in diesem Repo) — aber nicht gegenüber Umformulierungen: Entweder der normalisierte
 * Beleg kommt wörtlich vor, oder mindestens 60 % seiner Wörter (und nie weniger als 6) müssen
 * als **zusammenhängender** Wortlauf im Text stehen.
 *
 * Damit ist die Extraktion nachprüfbar: Ein erfundener oder paraphrasierter Beleg fällt raus,
 * egal wie überzeugend die Aussage klingt.
 */
export function quoteMatchesText(quote: string, text: string): boolean {
  const needle = normalizeEvidence(quote);
  if (needle.replace(/\s/g, "").length < 10) return false;

  const haystack = normalizeEvidence(text);
  if (haystack.includes(needle)) return true;

  const needleWords = wordSequence(quote);
  if (needleWords.length < 6) return false;
  const haystackWords = wordSequence(text);
  const required = Math.max(6, Math.ceil(needleWords.length * 0.6));

  for (let start = 0; start + required <= needleWords.length; start += 1) {
    if (containsWindow(haystackWords, needleWords.slice(start, start + required))) return true;
  }
  return false;
}

function continuityChapterSystem(language: string): string {
  return `You are a continuity editor building a story bible from a FINISHED manuscript.
${languageLock(language)}

TASK: read the CHAPTER TEXT below and record ONLY what it literally states:
(1) facts about a listed character or world entity,
(2) relationships between two listed characters that the text actually shows.

EVIDENCE IS MANDATORY: every entry needs "quote" — a passage copied **verbatim** from the chapter
text (5-25 words, no ellipsis, no rewording, no added punctuation). The server checks each quote
against the text and DISCARDS entries whose quote is not found there. A paraphrase is a lost entry,
and that is intentional: the canon must be verifiable, not plausible.

Format: one JSON object per line (JSONL). Examples:
{"t":"fact","entity":"Aria","entityType":"character","kind":"attribute","statement":"…","quote":"…","hard":false}
{"t":"relation","from":"Aria","to":"Theron","kind":"distrust","intensity":-0.6,"quote":"…","secret":false}

FACT RULES
- "entity" MUST be one of the names under KNOWN CHARACTERS / KNOWN WORLD ENTITIES.
- "kind" MUST be one of: ${FACT_KINDS.join(", ")}.
  attribute = stable trait/age/role · history = past event · skill = ability
  possession = important object · world = world fact · rule = hard world rule.
- "statement": ONE short, checkable sentence that the quote supports — no hedging, no interpretation,
  nothing beyond what the text says.
- "hard": true only for world rules the text presents as unbreakable.
- Omission is fine. If the chapter only implies it, leave it out.

RELATION RULES
- "from"/"to" MUST be names under KNOWN CHARACTERS (two different figures).
- "kind" MUST be one of: ${RELATION_KINDS.join(", ")}.
- "intensity": number from -1 (hostile) to 1 (devoted), as the text shows it.
- "quote": verbatim evidence for that relationship.
- "secret": true only if the text marks it as hidden from others.

LIMITS
- At most ${MAX_FACTS_PER_CHAPTER} facts and ${MAX_RELATIONS_PER_CHAPTER} relations for ONE chapter;
  fewer, well-evidenced entries are far better than padding.
- Never repeat anything listed under ALREADY TRACKED.
- Statements/notes/quotes in ${language}; enums and entity/character names exactly as listed.`;
}

/** Ein Kapitel (oder Kapitelteil) als Auftrag — inklusive bereits gefundener Aussagen. */
function chapterMaterial(
  chapter: { title: string; text: string },
  index: number,
  total: number,
  part: { index: number; count: number } | null,
  context: { title: string; knownStatements: string[]; knownRelations: string[] },
): string {
  const trackedFacts = context.knownStatements.map((entry) => `- ${entry}`).join("\n");
  const trackedRelations = context.knownRelations.map((entry) => `- ${entry}`).join("\n");

  return `BOOK: ${context.title || "(untitled)"}
CHAPTER: ${index + 1} of ${total} — ${chapter.title.trim() || `Kapitel ${index + 1}`}${
    part && part.count > 1 ? ` · part ${part.index + 1} of ${part.count}` : ""
  }

ALREADY TRACKED — FACTS (never repeat these):
${trackedFacts || "- (none)"}

ALREADY TRACKED — RELATIONS (never repeat these):
${trackedRelations || "- (none)"}

CHAPTER TEXT:
${chapter.text}

Record the facts and relationships of THIS text now as JSONL (one object per line), entirely in the given language.`;
}

/**
 * Rohantwort normalisieren: unbekannte Entitäten verwerfen, Werte validieren, deduplizieren —
 * und **Belege gegen den Text prüfen**. Ohne Beleg (oder mit erfundenem/paraphrasiertem Beleg)
 * wandert ein Fakt nicht in den Kanon.
 *
 * `source` ist der Text, den das Modell für diese Antwort gesehen hat (Kapitel oder Kapitelteil),
 * plus das Label, das als `establishedIn` gesetzt wird — vertrauenswürdig, weil serverseitig.
 */
export function normalizeContinuity(
  value: unknown,
  input: ContinuityExtractInput,
  source: { text: string; label: string },
): ExtractedContinuity {
  const { characters, world } = knownEntityNames(input);
  const obj = asRecord(value);

  // Bekanntes **unscharf** vergleichen: dieselbe Aussage wird gern umformuliert.
  const knownStatements = [...(input.knownStatements ?? [])];
  const facts: ExtractedFact[] = [];
  for (const entry of Array.isArray(obj.facts) ? obj.facts : []) {
    if (facts.length >= MAX_FACTS_PER_CALL) break;
    const item = asRecord(entry);
    const rawEntity = str(item.entity);
    const statement = str(item.statement);
    const quote = str(item.quote);
    if (!rawEntity || !statement) continue;

    // Belegpflicht: kein Beleg oder Beleg nicht im Text → Fakt verwerfen.
    if (!quote || !quoteMatchesText(quote, source.text)) continue;

    const asCharacter = matchName(rawEntity, characters);
    const asWorld = asCharacter ? null : matchName(rawEntity, world);
    const entityName = asCharacter ?? asWorld;
    if (!entityName) continue; // erfundene Entität → verwerfen

    const entityType: FactEntityType = asCharacter ? "character" : "world";
    const kind = (FACT_KINDS as string[]).includes(str(item.kind))
      ? (str(item.kind) as FactKind)
      : "attribute";

    // Schon getrackt (auch umformuliert) oder innerhalb dieses Laufs doppelt → verwerfen.
    if (knownStatements.some((known) => statementsMatch(known, statement))) continue;
    if (facts.some((existing) => statementsMatch(existing.statement, statement))) continue;
    knownStatements.push(statement);

    facts.push({
      kind,
      entityName,
      entityType,
      statement,
      quote,
      establishedIn: source.label,
      hard: entityType === "world" && item.hard === true ? true : undefined,
    });
  }

  const seenRelations = new Set((input.knownRelations ?? []).map((entry) => nameKey(entry)));
  const relations: ExtractedRelation[] = [];
  for (const entry of Array.isArray(obj.relations) ? obj.relations : []) {
    if (relations.length >= MAX_RELATIONS_PER_CALL) break;
    const item = asRecord(entry);
    const fromName = matchName(str(item.from), characters);
    const toName = matchName(str(item.to), characters);
    if (!fromName || !toName || fromName === toName) continue;

    // Auch Beziehungen brauchen einen Beleg aus dem Text (nicht gespeichert, aber geprüft).
    const quote = str(item.quote);
    if (!quote || !quoteMatchesText(quote, source.text)) continue;

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

/**
 * Extrahiert Fakten und Beziehungen **Kapitel für Kapitel** aus dem Manuskript.
 *
 * Sammelt die bereits gefundenen Aussagen und gibt sie als „ALREADY TRACKED" in die nächsten
 * Kapitel — so wächst der Kanon, statt sich zu wiederholen. Jeder Fakt braucht einen Beleg aus
 * dem jeweiligen Kapiteltext (siehe `quoteMatchesText`).
 */
/* ─────────────────── Gestreamte Extraktion (JSONL, live) ─────────────────── */

export interface ContinuityItemEvent {
  type: "fact" | "relation";
  /** Rohobjekt des Modells (noch nicht normalisiert). */
  raw: Record<string, unknown>;
}

/** Ordnet eine Zeile als Fakt oder Beziehung ein. */
function classifyItem(obj: Record<string, unknown>): ContinuityItemEvent | null {
  const tag = typeof obj.t === "string" ? obj.t : typeof obj.kind === "string" ? "" : "";
  if (typeof obj.entity === "string" || typeof obj.statement === "string") {
    return { type: "fact", raw: obj };
  }
  if (typeof obj.from === "string" || typeof obj.to === "string") {
    return { type: "relation", raw: obj };
  }
  if (tag === "fact" || tag === "relation") return { type: tag, raw: obj };
  return null;
}

/** Ergebnis eines Scans: die validierten Einträge **und** was schiefging (übersprungene Kapitel). */
export interface ContinuityScanResult extends ExtractedContinuity {
  warnings: string[];
}

export interface ContinuityStreamHandlers {
  /** Ein Kapitel wird jetzt gelesen (1-basiert, bezogen auf die übergebene Kapitelliste). */
  onChapter?: (index: number, total: number) => void;
  /** Ein Kapitel ist durch — Grundlage für „hier weitermachen". */
  onChapterDone?: (info: { index: number; facts: number; relations: number }) => void;
  /** Ein fertiges Objekt (live, vor der Beleg-Prüfung). */
  onItem?: (item: ContinuityItemEvent) => void;
  /** Ein Kapitel wurde übersprungen (Fehler), der Lauf geht weiter. */
  onWarning?: (message: string) => void;
}

/**
 * Extrahiert live, **Kapitel für Kapitel**: Jedes fertige JSONL-Objekt wird sofort gemeldet, am
 * Ende steht die validierte Fassung — geprüft gegen den Text des jeweiligen Kapitels.
 *
 * Lange Kapitel werden absatzsicher geteilt (`splitIntoChunks`), damit die Eingabe nicht aus dem
 * Kontext läuft; der Beleg wird dann gegen den jeweiligen Teil geprüft (genau den Text, den das
 * Modell gesehen hat).
 *
 * **Ein Kapitel kann den Lauf nicht mehr zerreißen:** Antwortet das Modell unbrauchbar, wird nur
 * dieses Kapitel übersprungen (als Warnung gemeldet) — alles davor bleibt erhalten, und der Rest
 * wird weiter gelesen. Vorher warf ein einziger unlesbarer Block den gesamten Scan weg.
 */
export async function extractContinuityStream(
  input: ContinuityExtractInput,
  handlers: ContinuityStreamHandlers = {},
): Promise<ContinuityScanResult> {
  const chapters = input.chapters.filter((chapter) => chapter.text.trim().length > 0);
  if (chapters.length === 0) {
    throw new ApiError(
      "Kein Manuskript-Text vorhanden, aus dem sich Fakten belegen ließen.",
      400,
    );
  }

  const allFacts: ExtractedFact[] = [];
  const allRelations: ExtractedRelation[] = [];
  const warnings: string[] = [];
  const context = {
    title: "",
    knownStatements: [...(input.knownStatements ?? [])],
    knownRelations: [...(input.knownRelations ?? [])],
  };

  const offset = input.startChapter ?? 0;
  const totalChapters = offset + chapters.length;

  for (const [index, chapter] of chapters.entries()) {
    const absolute = offset + index;
    handlers.onChapter?.(absolute + 1, totalChapters);
    const label = `Kapitel ${absolute + 1}: ${chapter.title.trim() || "ohne Titel"}`;
    const beforeFacts = allFacts.length;
    const beforeRelations = allRelations.length;
    /**
     * Was **dieses** Kapitel beiträgt. Die Kapitel-Grenze gilt über alle Teile zusammen (ein langes
     * Kapitel wird in mehrere Teile zerlegt — sonst würde die Grenze je Teil greifen).
     */
    const chapterFacts: ExtractedFact[] = [];
    const chapterRelations: ExtractedRelation[] = [];

    try {
      const parts = splitIntoChunks(chapter.text, CONTINUITY_CHUNK_WORDS);

      for (const [partIndex, part] of parts.entries()) {
        const rawFacts: unknown[] = [];
        const rawRelations: unknown[] = [];

        const consumer = createJsonlConsumer((parsed) => {
          const item = classifyItem(parsed);
          if (!item) return;
          if (item.type === "fact") rawFacts.push(parsed);
          else rawRelations.push(parsed);
          handlers.onItem?.(item);
        });

        const call = await chatCompletionStream(
          {
            model: input.model,
            system: continuityChapterSystem(input.language),
            user: chapterMaterial(
              { title: chapter.title, text: part },
              absolute,
              totalChapters,
              parts.length > 1 ? { index: partIndex, count: parts.length } : null,
              context,
            ),
            maxTokens: 3000,
            temperature: 0.2,
          },
          consumer.push,
        );
        consumer.flush();

        // Nichts als JSONL? Dann hat das Modell ein JSON-Dokument geliefert → damit arbeiten.
        const payload =
          rawFacts.length > 0 || rawRelations.length > 0
            ? { facts: rawFacts, relations: rawRelations }
            : parseJson(call.content);

        // Gegen **genau den Text** prüfen, den das Modell gesehen hat.
        const normalized = normalizeContinuity(payload, input, { text: part, label });

        /**
         * Kontext sofort ergänzen (verhindert Wiederholungen in den folgenden Teilen/Kapiteln),
         * aber **je Kapitel** begrenzen, was übernommen wird. Vorher stand hier eine Gesamtgrenze
         * (24/20) — die warf beim Buch-Scan alles ab Kapitel 4 stillschweigend weg.
         */
        for (const fact of normalized.facts) {
          if (!context.knownStatements.some((known) => statementsMatch(known, fact.statement))) {
            context.knownStatements.push(fact.statement);
          }
          if (chapterFacts.length < MAX_FACTS_PER_CHAPTER) chapterFacts.push(fact);
        }
        for (const relation of normalized.relations) {
          const key = `${relation.fromName}→${relation.toName}:${relation.kind}`;
          if (!context.knownRelations.includes(key)) context.knownRelations.push(key);
          if (chapterRelations.length < MAX_RELATIONS_PER_CHAPTER) chapterRelations.push(relation);
        }
      }
    } catch (err) {
      // Nur dieses Kapitel verlieren — nicht den ganzen Lauf.
      const message = err instanceof Error ? err.message : "Unbekannter Fehler.";
      const skipped = `Kapitel ${absolute + 1} (${chapter.title.trim() || "ohne Titel"}): ${message}`;
      warnings.push(`${skipped} — übersprungen, der Rest wurde weiter gelesen.`);
      handlers.onWarning?.(skipped);
    }

    // Kapitel-Beiträge in das Gesamtergebnis übernehmen (Notbremse statt 24er-Grenze).
    for (const fact of chapterFacts) {
      if (allFacts.length >= MAX_FACTS_TOTAL) break;
      allFacts.push(fact);
    }
    for (const relation of chapterRelations) {
      if (allRelations.length >= MAX_RELATIONS_TOTAL) break;
      allRelations.push(relation);
    }

    handlers.onChapterDone?.({
      index: absolute + 1,
      facts: allFacts.length - beforeFacts,
      relations: allRelations.length - beforeRelations,
    });
  }

  return { facts: allFacts, relations: allRelations, warnings };
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
  /**
   * Steht das Zitat **wörtlich** im geprüften Text? `false` heißt: Das Modell hat umformuliert
   * oder erfunden. Der Befund bleibt erhalten (er kann trotzdem echt sein) — nur ein Marker im
   * Text darf sich später ausschließlich auf bestätigte Zitate stützen.
   */
  quoteVerified?: boolean;
}

export interface CanonCheckResult {
  ok: boolean;
  summary: string;
  violations: CanonViolation[];
  /** Anzahl der Befunde ohne wörtlichen Beleg im Text (Teil von `violations`). */
  unverified: number;
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

/**
 * Normalisiert die Modellantwort und wirft Unbrauchbares weg.
 *
 * Jedes Zitat wird gegen **genau den geprüften Text** gehalten (`quoteMatchesText`) — dieselbe
 * Prüfung, die die Kanon-Extraktion schon macht. Ein Befund mit erfundenem oder umformuliertem
 * Zitat wird aber **nicht** verworfen, sondern als unbestätigt markiert
 * (`quoteVerified: false`): „hier stimmt etwas nicht, aber belegen kann ich es nicht" ist mehr
 * wert als eine stille Löschung. Verlässlich wird daraus erst die Grundlage für einen Marker im
 * Kapiteltext — der darf sich später nur auf bestätigte Zitate stützen.
 */
function normalizeViolations(value: unknown, part: number, partText: string): CanonViolation[] {
  const raw = asRecord(value).violations;
  const result: CanonViolation[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const item = asRecord(entry);
    const fact = str(item.fact);
    const quote = str(item.quote);
    if (!fact || !quote) continue; // ohne beide Seiten ist es keine überprüfbare Meldung
    result.push({
      fact,
      quote,
      fix: str(item.fix),
      part,
      quoteVerified: quoteMatchesText(quote, partText),
    });
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

    for (const violation of normalizeViolations(parseJson(content), index + 1, chunks[index] ?? "")) {
      // Dubletten über Teile hinweg vermeiden (gleicher Fakt + gleiches Zitat).
      const key = `${nameKey(violation.fact)}|${nameKey(violation.quote)}`;
      if (violations.some((item) => `${nameKey(item.fact)}|${nameKey(item.quote)}` === key)) continue;
      if (violations.length >= MAX_VIOLATIONS) break;
      violations.push(violation);
    }
    if (violations.length >= MAX_VIOLATIONS) break;
  }

  const unverified = violations.filter((violation) => violation.quoteVerified === false).length;
  const ok = violations.length === 0;
  const base = ok
    ? "Keine Widersprüche zum Kanon gefunden."
    : violations.length === 1
      ? "1 Widerspruch zum Kanon gefunden."
      : `${violations.length} Widersprüche zum Kanon gefunden.`;
  return {
    ok,
    // Ehrlich bleiben: Ein Befund ohne wörtlichen Beleg ist schwächer — das gehört in den Bericht,
    // nicht unter den Tisch. Die Zahl steht getrennt, damit man sie nicht mit den Befunden verwechselt.
    summary:
      unverified === 0
        ? base
        : `${base} ${unverified === 1 ? "1 Befund" : `${unverified} Befunde`} ohne wörtlichen Beleg im Text.`,
    violations,
    unverified,
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







