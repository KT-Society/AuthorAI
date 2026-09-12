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

export interface TimelineResult {
  summary: string;
  findings: string[];
}

export async function checkTimeline(input: TimelineRequest): Promise<TimelineResult> {
  const data = await postJson<{ summary?: string; findings?: string[] }>(
    "/api/timeline/check",
    input,
  );
  return {
    summary: typeof data.summary === "string" ? data.summary : "",
    findings: Array.isArray(data.findings) ? data.findings : [],
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
