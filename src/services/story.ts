/**
 * Client-side wrapper for storyboard, draft and expansion generation.
 * Talks only to the local Bun server; keys never reach the browser.
 */

import type { SceneConstraint, Storyboard, StoryCharacter, StoryWorld, WorldItem } from "@/data/story";

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
 * Mappt rohe Kapitel-Fix-Objekte (Modellantwort) auf `TimelineRepairFix`. Wird für das
 * Endergebnis **und** für die Live-Objekte des Streams genutzt — so verhalten sich beide gleich.
 */
function asTimelineRepairFixes(value: unknown): TimelineRepairFix[] {
  const fixes: TimelineRepairFix[] = [];
  for (const entry of Array.isArray(value) ? value : []) {
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
  return fixes;
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
  return {
    fixes: asTimelineRepairFixes(data.fixes),
    notes: Array.isArray(data.notes) ? data.notes.map((note) => String(note)) : [],
  };
}

export interface TimelineStreamHandlers {
  /** Ein Befund, sobald das Modell ihn geschrieben hat (live, vor der Endvalidierung). */
  onFinding?: (finding: TimelineFinding) => void;
}

/**
 * Gestreamte Timeline-Prüfung: Die Befunde treffen einzeln ein — bei langen Büchern ist der
 * Gesamtlauf spürbar, so sieht man die Hinweise schon während der Prüfung. Verbindlich ist die
 * normalisierte Liste aus dem Abschluss.
 */
export async function streamTimelineCheck(
  input: TimelineRequest,
  handlers: TimelineStreamHandlers = {},
): Promise<TimelineResult> {
  let result: TimelineResult | null = null;

  await streamEvents("/api/timeline/check/stream", input, (event) => {
    if (event.type === "finding" && event.finding) {
      const finding = asTimelineFindings([event.finding])[0];
      if (finding) handlers.onFinding?.(finding);
      return;
    }
    if (event.type === "done") {
      result = {
        summary: typeof event.summary === "string" ? event.summary : "",
        findings: asTimelineFindings(event.findings),
      };
    }
  });

  if (!result) throw new Error("Der Server hat kein Prüfergebnis geliefert.");
  return result;
}

export interface TimelineRepairStreamHandlers {
  /** Ein vorgeschlagenes Kapitel (live, noch unvalidiert). */
  onChapter?: (fix: TimelineRepairFix) => void;
}

/**
 * Gestreamte Timeline-Korrektur: die Vorschau füllt sich Kapitel für Kapitel. Verbindlich ist
 * das validierte Ergebnis aus dem Abschluss (unbekannte Nummern und Unverändertes fallen dort weg).
 */
export async function streamTimelineRepair(
  input: TimelineRepairRequest,
  handlers: TimelineRepairStreamHandlers = {},
): Promise<TimelineRepairResult> {
  let result: TimelineRepairResult | null = null;

  await streamEvents("/api/timeline/repair/stream", input, (event) => {
    if (event.type === "chapter") {
      const [fix] = asTimelineRepairFixes([event.raw]);
      if (fix) handlers.onChapter?.(fix);
      return;
    }
    if (event.type === "done") {
      result = {
        fixes: asTimelineRepairFixes(event.fixes),
        notes: Array.isArray(event.notes) ? event.notes.map((note) => String(note)) : [],
      };
    }
  });

  if (!result) throw new Error("Der Server hat keine Korrektur geliefert.");
  return result;
}

export interface StoryboardDeriveRequest {
  title: string;
  genre?: string;
  chapters: { title: string; text: string }[];
  model: string;
  language: string;
  seriesContext?: string;
}

/** Kapitelplan-Angaben aus dem Text (leer = nicht belegbar). */
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

/** Normalisiert die Meta-Angaben der Ableitung (Server liefert sie roh). */
function asDeriveMeta(value: unknown): StoryboardDeriveResult["meta"] {
  const meta = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const text = (key: string) => (typeof meta[key] === "string" ? (meta[key] as string) : "");
  return {
    title: text("title"),
    subtitle: text("subtitle"),
    genre: text("genre"),
    logline: text("logline"),
    synopsis: text("synopsis"),
    themes: Array.isArray(meta.themes) ? meta.themes.map(String) : [],
    tone: text("tone"),
    pov: text("pov"),
  };
}

/** Normalisiert Figuren der Ableitung (gleiche Toleranz wie die Figuren-Extraktion). */
function asDerivedCharacters(value: unknown): StoryCharacter[] {
  if (!Array.isArray(value)) return [];
  const characters: StoryCharacter[] = [];
  for (const entry of value) {
    const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) continue;
    characters.push({
      name,
      role: typeof item.role === "string" ? item.role : "",
      description: typeof item.description === "string" ? item.description : "",
    });
  }
  return characters;
}

/** Normalisiert einen abgeleiteten Kapitelplan. */
function asDerivedPlan(value: unknown): DerivedChapterPlan | null {
  const item = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const index = Number.parseInt(String(item.index ?? ""), 10);
  if (!Number.isFinite(index) || index < 0) return null;
  return {
    index,
    summary: typeof item.summary === "string" ? item.summary : "",
    pov: typeof item.pov === "string" ? item.pov : "",
    setting: typeof item.setting === "string" ? item.setting : "",
    foreshadowing: Array.isArray(item.foreshadowing) ? item.foreshadowing.map(String) : [],
  };
}

export interface StoryboardDeriveHandlers {
  /** Vor dem ersten Aufruf: Anzahl Kapitel und Batches. */
  onStart?: (info: { chapters: number; batches: number }) => void;
  onPhase?: (phase: "meta" | "chapters") => void;
  onMeta?: (meta: StoryboardDeriveResult["meta"]) => void;
  onCharacter?: (character: StoryCharacter) => void;
  /** Ein Kapitelplan, sobald das Modell ihn geschrieben hat (live, vor der Endprüfung). */
  onChapter?: (plan: DerivedChapterPlan) => void;
  onBatch?: (done: number, total: number) => void;
}

/**
 * Gestreamte Storyboard-Ableitung aus einem fertigen Manuskript: **gechunkt** (Meta/Figuren, dann
 * Kapitel in Batches) und **gestreamt** (Figuren und Kapitel treffen einzeln ein). Verbindlich ist
 * das Ergebnis aus dem Abschluss.
 */
export async function streamDeriveStoryboard(
  input: StoryboardDeriveRequest,
  handlers: StoryboardDeriveHandlers = {},
): Promise<StoryboardDeriveResult> {
  let result: StoryboardDeriveResult | null = null;

  await streamEvents("/api/storyboard/derive/stream", input, (event) => {
    if (event.type === "start") {
      handlers.onStart?.({
        chapters: Number(event.chapters ?? 0),
        batches: Number(event.batches ?? 0),
      });
      return;
    }
    if (event.type === "phase" && (event.phase === "meta" || event.phase === "chapters")) {
      handlers.onPhase?.(event.phase);
      return;
    }
    if (event.type === "meta") {
      handlers.onMeta?.(asDeriveMeta(event.meta));
      return;
    }
    if (event.type === "character") {
      const [character] = asDerivedCharacters([event.character]);
      if (character) handlers.onCharacter?.(character);
      return;
    }
    if (event.type === "chapter") {
      const plan = asDerivedPlan(event.plan);
      if (plan) handlers.onChapter?.(plan);
      return;
    }
    if (event.type === "batch") {
      handlers.onBatch?.(Number(event.done ?? 0), Number(event.total ?? 0));
      return;
    }
    if (event.type === "done") {
      result = {
        meta: asDeriveMeta(event.meta),
        characters: asDerivedCharacters(event.characters),
        chapters: (Array.isArray(event.chapters) ? event.chapters : [])
          .map(asDerivedPlan)
          .filter((plan): plan is DerivedChapterPlan => plan !== null),
      };
    }
  });

  if (!result) throw new Error("Der Server hat keine Storyboard-Ableitung geliefert.");
  return result;
}

export interface SceneDeriveRequest {
  chapterTitle: string;
  text: string;
  hint?: string;
  model: string;
  language: string;
}

/** Eine aus dem Text gelesene Szene (Beat-Zeile + optionale Zeit/Schauplatz/POV/Figuren). */
export interface DerivedScene {
  text: string;
  time: string;
  setting: string;
  pov: string;
  /** Figuren **als Namen** — die Zuordnung Name → ID macht der Aufrufer (er kennt die Figuren). */
  characters: string[];
}

/** Normalisiert eine Szenen-Zeile (Live-Ereignis wie Abschluss). */
function asDerivedScene(value: unknown): DerivedScene | null {
  const item = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const text = typeof item.text === "string" ? item.text.trim() : "";
  if (!text) return null;
  const rawCharacters = Array.isArray(item.characters)
    ? item.characters
    : typeof item.characters === "string"
      ? item.characters.split(",")
      : [];
  const characters: string[] = [];
  for (const entry of rawCharacters) {
    const name = typeof entry === "string" ? entry.trim() : "";
    if (name && !characters.includes(name)) characters.push(name);
  }
  return {
    text,
    time: typeof item.time === "string" ? item.time.trim() : "",
    setting: typeof item.setting === "string" ? item.setting.trim() : "",
    pov: typeof item.pov === "string" ? item.pov.trim() : "",
    characters,
  };
}

export interface SceneDeriveHandlers {
  /** Vor dem ersten Aufruf: in wie viele Teile das Kapitel zerlegt wurde. */
  onStart?: (info: { parts: number }) => void;
  onPart?: (done: number, total: number) => void;
  /** Eine Szene, sobald das Modell sie geschrieben hat (live). */
  onScene?: (scene: DerivedScene) => void;
}

/**
 * Gestreamte Szenen-Ableitung: lange Kapitel werden serverseitig gechunkt, die Szenen treffen
 * einzeln ein. Verbindlich ist die Liste aus dem Abschluss.
 */
export async function streamDeriveScenes(
  input: SceneDeriveRequest,
  handlers: SceneDeriveHandlers = {},
): Promise<DerivedScene[]> {
  let scenes: DerivedScene[] | null = null;

  await streamEvents("/api/chapter/scenes/stream", input, (event) => {
    if (event.type === "start") {
      handlers.onStart?.({ parts: Number(event.parts ?? 0) });
      return;
    }
    if (event.type === "part") {
      handlers.onPart?.(Number(event.done ?? 0), Number(event.total ?? 0));
      return;
    }
    if (event.type === "scene") {
      const scene = asDerivedScene(event.scene);
      if (scene) handlers.onScene?.(scene);
      return;
    }
    if (event.type === "done") {
      scenes = (Array.isArray(event.scenes) ? event.scenes : [])
        .map(asDerivedScene)
        .filter((scene): scene is DerivedScene => scene !== null);
    }
  });

  if (scenes === null) throw new Error("Der Server hat keine Szenen geliefert.");
  return scenes.length > 0 ? scenes : [];
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

/** Kategorie-Schlüssel des Weltenbaus, wie der Stream sie meldet. */
export type WorldStreamCategory = keyof StoryWorld;

export interface WorldStreamHandlers {
  /** Ein Vorschlag, sobald das Modell ihn geschrieben hat (live, vor Dedupe/Validierung). */
  onEntry?: (category: WorldStreamCategory, entry: WorldItem) => void;
}

/**
 * Gestreamte Weltenbau-Extraktion: Die Vorschläge wachsen live in den Review-Dialog. Verbindlich
 * ist das Welt-Objekt aus dem Abschluss (normalisiert und ohne Dubletten).
 */
export async function streamWorldExtract(
  input: WorldExtractRequest,
  handlers: WorldStreamHandlers = {},
): Promise<StoryWorld> {
  let world: StoryWorld | null = null;

  await streamEvents("/api/world/extract/stream", input, (event) => {
    if (event.type === "entry") {
      const category = event.category as WorldStreamCategory;
      const name = typeof event.name === "string" ? event.name.trim() : "";
      if (!name) return;
      handlers.onEntry?.(category, {
        name,
        description: typeof event.description === "string" ? event.description : "",
      });
      return;
    }
    if (event.type === "done" && event.world) {
      world = event.world as StoryWorld;
    }
  });

  if (!world) throw new Error("Der Server hat keinen Weltenbau geliefert.");
  return world;
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

export interface CharacterStreamHandlers {
  /** Eine Figur, sobald das Modell sie geschrieben hat (live, vor Dedupe/Validierung). */
  onCharacter?: (character: StoryCharacter) => void;
}

/**
 * Gestreamte Figuren-Extraktion: Die gefundenen Figuren treffen einzeln ein. Verbindlich ist die
 * Liste aus dem Abschluss (normalisiert, ohne bereits getrackte Namen).
 */
export async function streamCharactersExtract(
  input: CharacterExtractRequest,
  handlers: CharacterStreamHandlers = {},
): Promise<StoryCharacter[]> {
  let characters: StoryCharacter[] | null = null;

  await streamEvents("/api/characters/extract/stream", input, (event) => {
    if (event.type === "character" && event.character) {
      const raw = event.character as Record<string, unknown>;
      const name = typeof raw.name === "string" ? raw.name.trim() : "";
      if (!name) return;
      handlers.onCharacter?.({
        name,
        role: typeof raw.role === "string" ? raw.role : "",
        description: typeof raw.description === "string" ? raw.description : "",
      });
      return;
    }
    if (event.type === "done") {
      characters = Array.isArray(event.characters) ? (event.characters as StoryCharacter[]) : [];
    }
  });

  if (!characters) throw new Error("Der Server hat keine Figuren geliefert.");
  return characters;
}
