/**
 * Client-Wrapper für die Kontinuitäts-Extraktion.
 *
 * Spricht ausschließlich mit dem lokalen Server (`/api/*`); Keys bleiben serverseitig.
 */

import type { ExtractedContinuity } from "@/data/continuity";
import type { Storyboard } from "@/data/story";

import { postJson } from "./http";
import { streamEvents } from "./stream";
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

export interface CanonChapterText {
  index: number;
  text: string;
}

export interface CanonStreamHandlers {
  /** Ein Kapitel wurde begonnen (für „prüfe Kapitel n…"). */
  onStarted?: (chapterIndex: number) => void;
  /** Ergebnis eines Kapitels — entweder `result` oder `error`. */
  onResult: (chapterIndex: number, result?: CanonCheckResult, error?: string) => void;
}

/**
 * Prüft mehrere Kapitel über **eine** SSE-Verbindung. Der Server arbeitet mit begrenzter
 * Parallelität und schickt jedes Ergebnis, sobald es fertig ist — die Liste füllt sich also
 * live, statt erst am Ende zu erscheinen.
 */
export async function streamCanonCheck(
  input: {
    storyboard: Storyboard;
    chapters: CanonChapterText[];
    canon: string;
    model: string;
    language: string;
    concurrency?: number;
  },
  handlers: CanonStreamHandlers,
): Promise<void> {
  await streamEvents("/api/continuity/check/stream", input, (event) => {
    if (event.type === "started" && typeof event.chapterIndex === "number") {
      handlers.onStarted?.(event.chapterIndex);
      return;
    }
    if (event.type !== "result" || typeof event.chapterIndex !== "number") return;
    handlers.onResult(
      event.chapterIndex,
      event.result as CanonCheckResult | undefined,
      typeof event.error === "string" ? event.error : undefined,
    );
  });
}

export interface CanonRepairOutput {
  text: string;
  changed: boolean;
  applied: number;
  unassigned: number;
}

export interface CanonRepairRequest {
  storyboard: Storyboard;
  chapterIndex: number;
  text: string;
  violations: CanonViolation[];
  canon: string;
  model: string;
  language: string;
}

/** Behebt die gemeldeten Widersprüche eines Kapitels (Quick Fix). */
export async function repairCanon(input: CanonRepairRequest): Promise<CanonRepairOutput> {
  const data = await postJson<Partial<CanonRepairOutput>>("/api/continuity/repair", input);
  return {
    text: typeof data.text === "string" ? data.text : input.text,
    changed: data.changed === true,
    applied: typeof data.applied === "number" ? data.applied : 0,
    unassigned: typeof data.unassigned === "number" ? data.unassigned : 0,
  };
}

export interface CanonRepairTarget {
  index: number;
  text: string;
  violations: CanonViolation[];
}

export interface CanonRepairResultEvent {
  chapterIndex: number;
  text?: string;
  changed?: boolean;
  applied?: number;
  unassigned?: number;
  /** Frische Prüfung nach der Korrektur. */
  result?: CanonCheckResult;
  error?: string;
}

export interface CanonRepairStreamHandlers {
  onStarted?: (chapterIndex: number) => void;
  onResult: (event: CanonRepairResultEvent) => void;
}

/**
 * Quick Fix über mehrere Kapitel in **einem** SSE-Aufruf: der Server korrigiert (begrenzt
 * parallel) und prüft jedes Kapitel direkt danach erneut. Ergebnisse kommen live zurück.
 */
export async function streamCanonRepair(
  input: {
    storyboard: Storyboard;
    canon: string;
    model: string;
    language: string;
    chapters: CanonRepairTarget[];
    concurrency?: number;
  },
  handlers: CanonRepairStreamHandlers,
): Promise<void> {
  await streamEvents("/api/continuity/repair/stream", input, (event) => {
    if (event.type === "started" && typeof event.chapterIndex === "number") {
      handlers.onStarted?.(event.chapterIndex);
      return;
    }
    if (event.type !== "result" || typeof event.chapterIndex !== "number") return;
    handlers.onResult({
      chapterIndex: event.chapterIndex,
      text: typeof event.text === "string" ? event.text : undefined,
      changed: event.changed === true,
      applied: typeof event.applied === "number" ? event.applied : undefined,
      unassigned: typeof event.unassigned === "number" ? event.unassigned : undefined,
      result: event.result as CanonCheckResult | undefined,
      error: typeof event.error === "string" ? event.error : undefined,
    });
  });
}
