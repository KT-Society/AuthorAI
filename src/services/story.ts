/**
 * Client-side wrapper for storyboard, draft and expansion generation.
 * Talks only to the local Bun server; keys never reach the browser.
 */

import type { SceneConstraint, Storyboard, StoryCharacter, StoryWorld } from "@/data/story";

import { postJson } from "./http";
import { streamEvents } from "./stream";

export interface StoryboardRequest {
  idea: string;
  model: string;
  language: string;
  chapters: number;
  /** Reihen-Kontext (Vorbände + Kanon), damit der neue Band die Reihe fortsetzt. */
  seriesContext?: string;
}

export async function generateStoryboard(input: StoryboardRequest): Promise<Storyboard> {
  const data = await postJson<{ storyboard?: Storyboard }>("/api/storyboard", input);
  if (!data.storyboard) throw new Error("Leere Storyboard-Antwort vom Server.");
  return data.storyboard;
}

export interface StoryboardStreamHandlers {
  /** Eine Phase des Entwurfs beginnt (`outline` = Metadaten + Titel, `chapters` = Details). */
  onPhase?: (phase: "outline" | "chapters") => void;
  /** Die Kapiteltitel stehen fest. */
  onTitles?: (titles: string[]) => void;
  /** Ein Detail-Batch ist fertig. */
  onBatch?: (done: number, total: number) => void;
}

/**
 * Gestreamter Storyboard-Entwurf. Die Antworten sind JSON, deshalb gibt es **kein** Text-Delta:
 * Der Server meldet Phase, Kapiteltitel und Batch-Fortschritt, am Ende das fertige Storyboard.
 */
export async function streamStoryboard(
  input: StoryboardRequest,
  handlers: StoryboardStreamHandlers = {},
): Promise<Storyboard> {
  let storyboard: Storyboard | null = null;

  await streamEvents("/api/storyboard/stream", input, (event) => {
    if (event.type === "phase" && (event.phase === "outline" || event.phase === "chapters")) {
      handlers.onPhase?.(event.phase);
      return;
    }
    if (event.type === "titles" && Array.isArray(event.titles)) {
      handlers.onTitles?.((event.titles as unknown[]).map((title) => String(title)));
      return;
    }
    if (event.type === "batch") {
      handlers.onBatch?.(Number(event.done ?? 0), Number(event.total ?? 0));
      return;
    }
    if (event.type === "done" && event.storyboard) {
      storyboard = event.storyboard as Storyboard;
    }
  });

  if (!storyboard) throw new Error("Der Server hat kein Storyboard geliefert.");
  return storyboard;
}

export interface ChapterRequest {
  storyboard: Storyboard;
  chapterIndex: number;
  model: string;
  language: string;
  /** Verbindliche Szenen-Vorgaben (Beats + Figuren + POV/Schauplatz/Zeit). */
  scenes?: SceneConstraint[];
  /** Verbindlicher Kanon-Block (Fakten + Beziehungen) aus dem Projekt. */
  canon?: string;
}

export async function draftChapter(input: ChapterRequest): Promise<string> {
  const data = await postJson<{ draft?: string }>("/api/chapter/draft", input);
  if (typeof data.draft !== "string") throw new Error("Leerer Rohentwurf vom Server.");
  return data.draft;
}

export interface ExpandRequest extends ChapterRequest {
  draft: string;
  targetWords: number;
}

export async function expandChapter(input: ExpandRequest): Promise<string> {
  const data = await postJson<{ expanded?: string }>("/api/chapter/expand", input);
  if (typeof data.expanded !== "string") throw new Error("Leerer Ausbau vom Server.");
  return data.expanded;
}

export interface PassResult {
  text: string;
  notes: string[];
  changed?: boolean;
}

export interface PassRequest {
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

export async function checkConsistency(input: PassRequest): Promise<PassResult> {
  const data = await postJson<{ text?: string; notes?: string[]; changed?: boolean }>(
    "/api/chapter/consistency",
    input,
  );
  if (typeof data.text !== "string") throw new Error("Leerer Prüfbericht vom Server.");
  return { text: data.text, notes: Array.isArray(data.notes) ? data.notes : [], changed: data.changed };
}

export async function refineStyle(input: PassRequest): Promise<PassResult> {
  const data = await postJson<{ text?: string; notes?: string[]; changed?: boolean }>(
    "/api/chapter/style",
    input,
  );
  if (typeof data.text !== "string") throw new Error("Leerer Prüfbericht vom Server.");
  return { text: data.text, notes: Array.isArray(data.notes) ? data.notes : [], changed: data.changed };
}

export interface PassStreamHandlers {
  /** Ein neuer Teil der Überarbeitung beginnt (Kapitel werden gechunkt). */
  onPartStart?: (part: number, parts: number) => void;
  /** Textstück des laufenden Teils. */
  onPartDelta?: (text: string) => void;
  /** Fertig bearbeiteter Teil. */
  onPartDone?: (part: number, text: string) => void;
}

/**
 * Gestreamte Überarbeitung (Kohärenz oder Stil): Der Server chunkt das Kapitel und schickt
 * Teil-Ereignisse, damit der Text live mitwächst. Am Ende kommt das vollständige Ergebnis
 * samt gesammelter Notizen.
 */
export async function streamPass(
  kind: "consistency" | "style",
  input: PassRequest,
  handlers: PassStreamHandlers = {},
): Promise<PassResult> {
  let result: PassResult | null = null;

  await streamEvents(
    `/api/chapter/${kind === "consistency" ? "consistency" : "style"}/stream`,
    input,
    (event) => {
      if (event.type === "part-start") {
        handlers.onPartStart?.(Number(event.part ?? 1), Number(event.parts ?? 1));
        return;
      }
      if (event.type === "part-delta" && typeof event.text === "string") {
        handlers.onPartDelta?.(event.text);
        return;
      }
      if (event.type === "part-done") {
        handlers.onPartDone?.(
          Number(event.part ?? 1),
          typeof event.text === "string" ? event.text : "",
        );
        return;
      }
      if (event.type === "done") {
        result = {
          text: typeof event.text === "string" ? event.text : "",
          notes: Array.isArray(event.notes) ? (event.notes as string[]) : [],
          changed: event.changed === true,
        };
      }
    },
  );

  if (!result) throw new Error("Der Server hat kein Ergebnis geliefert.");
  return result;
}

export interface TimelineRequest {
  storyboard: Storyboard;
  scenesByChapter: SceneConstraint[][];
  model: string;
  language: string;
  /** Verbindlicher Kanon-Block (Fakten + Beziehungen) aus dem Projekt. */
  canon?: string;
}

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

export async function checkTimeline(input: TimelineRequest): Promise<TimelineResult> {
  const data = await postJson<{ summary?: string; findings?: unknown[] }>(
    "/api/timeline/check",
    input,
  );
  return {
    summary: typeof data.summary === "string" ? data.summary : "",
    findings: asTimelineFindings(data.findings),
  };
}

/**
 * Befunde kommen als Objekte; ältere Modelle (oder ein Modell, das sich nicht ans Schema hält)
 * liefern reine Strings. Beides wird auf dieselbe Form gebracht — die Kapitelnummer wird zur Not
 * aus dem Text gelesen, damit die Markierung trotzdem greift.
 */
function asTimelineFindings(value: unknown): TimelineFinding[] {
  if (!Array.isArray(value)) return [];
  const findings: TimelineFinding[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      const issue = entry.trim();
      if (!issue) continue;
      const match = issue.match(/\b(?:kapitel|chapter|kap\.?|ch\.?)\s*(\d{1,3})\b/i);
      const parsed = match?.[1] ? Number.parseInt(match[1], 10) : Number.NaN;
      findings.push({ chapter: Number.isFinite(parsed) ? parsed : 0, issue, fix: "" });
      continue;
    }
    const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const issue = typeof item.issue === "string" ? item.issue.trim() : "";
    if (!issue) continue;
    const chapter = Number.parseInt(String(item.chapter ?? ""), 10);
    const scene = Number.parseInt(String(item.scene ?? ""), 10);
    findings.push({
      chapter: Number.isFinite(chapter) && chapter > 0 ? chapter : 0,
      scene: Number.isFinite(scene) && scene > 0 ? scene : undefined,
      issue,
      fix: typeof item.fix === "string" ? item.fix.trim() : "",
    });
  }
  return findings;
}

export interface TimelineRepairRequest extends TimelineRequest {
  findings: TimelineFinding[];
}

/** Vorgeschlagene Korrektur **einer Szene** — nur gesetzte Felder ändern etwas. */
export interface TimelineSceneFix {
  scene: number;
  time?: string;
  setting?: string;
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

/**
 * Quick Fix der Timeline: korrigiert die **Struktur** (Szenen-Zeit/Schauplatz/Text), die die
 * Chronologie-Prüfung liest. Der Server prüft die Nummern gegen die echten Kapitel/Szenen und
 * meldet nur tatsächliche Änderungen zurück.
 */
export async function repairTimeline(input: TimelineRepairRequest): Promise<TimelineRepairResult> {
  const data = await postJson<{ fixes?: unknown[]; notes?: unknown[] }>(
    "/api/timeline/repair",
    input,
  );
  const fixes: TimelineRepairFix[] = [];
  for (const entry of Array.isArray(data.fixes) ? data.fixes : []) {
    const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const chapter = Number.parseInt(String(item.chapter ?? ""), 10);
    if (!Number.isFinite(chapter) || chapter <= 0) continue;
    const scenes: TimelineSceneFix[] = [];
    for (const sceneEntry of Array.isArray(item.scenes) ? item.scenes : []) {
      const sceneItem =
        sceneEntry && typeof sceneEntry === "object" ? (sceneEntry as Record<string, unknown>) : {};
      const scene = Number.parseInt(String(sceneItem.scene ?? ""), 10);
      if (!Number.isFinite(scene) || scene <= 0) continue;
      const fix: TimelineSceneFix = { scene };
      if (typeof sceneItem.time === "string" && sceneItem.time.trim())
        fix.time = sceneItem.time.trim();
      if (typeof sceneItem.setting === "string" && sceneItem.setting.trim())
        fix.setting = sceneItem.setting.trim();
      if (typeof sceneItem.text === "string" && sceneItem.text.trim())
        fix.text = sceneItem.text.trim();
      if (fix.time || fix.setting || fix.text) scenes.push(fix);
    }
    if (scenes.length > 0) {
      fixes.push({ chapter, note: typeof item.note === "string" ? item.note : "", scenes });
    }
  }
  return {
    fixes,
    notes: Array.isArray(data.notes) ? data.notes.map((note) => String(note)) : [],
  };
}

export interface WorldExtractRequest {
  storyboard: Storyboard;
  model: string;
  language: string;
  /** Bereits getrackte Einträge — verhindert Dubletten bei wiederholten Scans. */
  knownEntries?: { title: string; category: string }[];
}

export async function extractWorld(input: WorldExtractRequest): Promise<StoryWorld> {
  const data = await postJson<{ world?: StoryWorld }>("/api/world/extract", input);
  if (!data.world) throw new Error("Leere Weltenbau-Antwort vom Server.");
  return data.world;
}

export interface CharacterExtractRequest {
  bookTitle: string;
  genre?: string;
  chapters: { title: string; text: string }[];
  knownCharacters: string[];
  model: string;
  language: string;
}

/** Leitet benannte Figuren aus dem Manuskript ab (inkl. Storyboard-unbekannter Figuren). */
export async function extractCharacters(
  input: CharacterExtractRequest,
): Promise<StoryCharacter[]> {
  const data = await postJson<{ characters?: StoryCharacter[] }>(
    "/api/characters/extract",
    input,
  );
  return Array.isArray(data.characters) ? data.characters : [];
}
