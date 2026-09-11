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
import { chatCompletionDetailed, cleanJsonBlock } from "./llm";
import { languageLock } from "./story";

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
