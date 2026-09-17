/**
 * Client-Wrapper für die Kontinuitäts-Extraktion.
 *
 * Spricht ausschließlich mit dem lokalen Server (`/api/*`); Keys bleiben serverseitig.
 */

import type { ExtractedContinuity, ExtractedFact, ExtractedRelation } from "@/data/continuity";
import type { Storyboard } from "@/data/story";

import { postJson } from "./http";
import { streamEvents } from "./stream";

export interface ContinuityExtractRequest {
  /** Manuskript-Kapitel in Lesereihenfolge — die Quelle der Fakten (Belege werden daraus geprüft). */
  chapters: { title: string; text: string }[];
  characters: { name: string; role?: string }[];
  worldNames?: string[];
  knownStatements?: string[];
  knownRelations?: string[];
  /**
   * Bei „weitermachen": die **absolute** Kapitelnummer (1-basiert), bei der der Lauf beginnt.
   * Der Server nutzt sie für die Kapitel-Labels der Warnungen („Kapitel 27 übersprungen"), damit
   * sie zur Buch-Nummerierung passen und nicht zur Position im übergebenen Ausschnitt.
   */
  startChapter?: number;
  model: string;
  language: string;
}

/** Ergebnis eines Scans: validierte Einträge **und** übersprungene Kapitel. */
export interface ContinuityScanResult extends ExtractedContinuity {
  /** Kapitel, die das Modell unbrauchbar beantwortet hat (übersprungen, Rest wurde gelesen). */
  warnings: string[];
}

export interface ContinuityStreamHandlers {
  /** Ein Kapitel wird jetzt gelesen (1-basiert, bezogen auf die übergebene Kapitelliste). */
  onChapter?: (index: number, total: number) => void;
  /** Ein Kapitel ist durch — Grundlage für „hier weitermachen". */
  onChapterDone?: (info: { index: number; facts: number; relations: number }) => void;
  onItem?: (type: "fact" | "relation", item: ExtractedFact | ExtractedRelation) => void;
  /** Ein Kapitel wurde übersprungen (Fehler); der Lauf geht weiter. */
  onWarning?: (message: string) => void;
}

/**
 * Gestreamte Extraktion (JSONL), **Kapitel für Kapitel**: Der Server schickt jeden Vorschlag,
 * sobald das Modell ihn fertig hat, meldet den Kapitel-Fortschritt (inkl. „Kapitel N ist durch")
 * und übersprungene Kapitel als Warnung. Am Ende kommt die **validierte** Fassung — die Live-
 * Objekte sind absichtlich nur grob gemappt.
 */
export async function streamContinuityExtract(
  input: ContinuityExtractRequest,
  handlers: ContinuityStreamHandlers = {},
): Promise<ContinuityScanResult> {
  let result: ContinuityScanResult | null = null;

  await streamEvents("/api/continuity/extract/stream", input, (event) => {
    if (event.type === "chapter") {
      handlers.onChapter?.(Number(event.index ?? 0), Number(event.total ?? 0));
      return;
    }
    if (event.type === "chapterDone") {
      handlers.onChapterDone?.({
        index: Number(event.index ?? 0),
        facts: Number(event.facts ?? 0),
        relations: Number(event.relations ?? 0),
      });
      return;
    }
    if (event.type === "warning" && typeof event.message === "string") {
      handlers.onWarning?.(event.message);
      return;
    }
    if (event.type === "item" && event.item && typeof event.raw === "object" && event.raw) {
      const raw = event.raw as Record<string, unknown>;
      if (event.item === "fact") {
        const fact = mapRawFact(raw);
        if (fact) handlers.onItem?.("fact", fact);
      } else if (event.item === "relation") {
        const relation = mapRawRelation(raw);
        if (relation) handlers.onItem?.("relation", relation);
      }
      return;
    }
    if (event.type === "done") {
      result = {
        facts: Array.isArray(event.facts) ? (event.facts as ExtractedFact[]) : [],
        relations: Array.isArray(event.relations) ? (event.relations as ExtractedRelation[]) : [],
        warnings: Array.isArray(event.warnings) ? event.warnings.map(String) : [],
      };
    }
  });

  if (!result) throw new Error("Der Server hat kein Ergebnis geliefert.");
  return result;
}

function mapRawFact(raw: Record<string, unknown>): ExtractedFact | null {
  const entityName = typeof raw.entity === "string" ? raw.entity.trim() : "";
  const statement = typeof raw.statement === "string" ? raw.statement.trim() : "";
  if (!entityName || !statement) return null;
  return {
    kind: (typeof raw.kind === "string" ? raw.kind : "attribute") as ExtractedFact["kind"],
    entityName,
    entityType: raw.entityType === "world" ? "world" : "character",
    statement,
    quote: typeof raw.quote === "string" ? raw.quote.trim() || undefined : undefined,
    establishedIn: typeof raw.establishedIn === "string" ? raw.establishedIn : undefined,
    hard: raw.hard === true ? true : undefined,
  };
}

function mapRawRelation(raw: Record<string, unknown>): ExtractedRelation | null {
  const fromName = typeof raw.from === "string" ? raw.from.trim() : "";
  const toName = typeof raw.to === "string" ? raw.to.trim() : "";
  if (!fromName || !toName) return null;
  return {
    fromName,
    toName,
    kind: (typeof raw.kind === "string" ? raw.kind : "loyalty") as ExtractedRelation["kind"],
    intensity: typeof raw.intensity === "number" ? raw.intensity : 0,
    note: typeof raw.note === "string" ? raw.note : undefined,
    secret: raw.secret === true ? true : undefined,
    establishedIn: typeof raw.establishedIn === "string" ? raw.establishedIn : undefined,
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
  /** Steht das Zitat wörtlich im geprüften Text? `false` = umformuliert oder erfunden. */
  quoteVerified?: boolean;
}

export interface CanonCheckResult {
  ok: boolean;
  summary: string;
  violations: CanonViolation[];
  /** Anzahl der Befunde ohne wörtlichen Beleg im Text. */
  unverified?: number;
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
    unverified: typeof data.unverified === "number" ? data.unverified : 0,
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



