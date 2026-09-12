/**
 * Client-Wrapper für die Kontinuitäts-Extraktion.
 *
 * Spricht ausschließlich mit dem lokalen Server (`/api/*`); Keys bleiben serverseitig.
 */

import type { ExtractedContinuity } from "@/data/continuity";
import type { Storyboard } from "@/data/story";

import { postJson } from "./http";
export interface ContinuityExtractRequest {
  storyboard: Storyboard;
  characters: { name: string; role?: string }[];
  worldNames?: string[];
  knownStatements?: string[];
  knownRelations?: string[];
  model: string;
  language: string;
}

export async function extractContinuity(
  input: ContinuityExtractRequest,
): Promise<ExtractedContinuity> {
  const data = await postJson<Partial<ExtractedContinuity>>("/api/continuity/extract", input);
  return {
    facts: Array.isArray(data.facts) ? data.facts : [],
    relations: Array.isArray(data.relations) ? data.relations : [],
  };
}

export interface CanonViolation {
  /** Der geprüfte Kanon-Eintrag. */
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

export interface CanonCheckRequest {
  storyboard: Storyboard;
  chapterIndex: number;
  text: string;
  /** Fertiger Kanon-Block (`canonBlock`) — gleiche Quelle wie alle Prüf-Pässe. */
  canon: string;
  model: string;
  language: string;
}

/** Prüft ein Kapitel nur gegen den Kanon (getrennt von der Kohärenz). */
export async function checkCanon(input: CanonCheckRequest): Promise<CanonCheckResult> {
  const data = await postJson<Partial<CanonCheckResult>>("/api/continuity/check", input);
  return {
    ok: data.ok === true,
    summary: typeof data.summary === "string" ? data.summary : "",
    violations: Array.isArray(data.violations) ? data.violations : [],
  };
}
