/**
 * Per-profile local persistence (browser localStorage).
 *
 * Keys are scoped to a profile id: `authorai.<profileId>.<collection>`.
 * A missing key means the profile is fresh (seeds apply); an empty array means
 * the user explicitly emptied the collection (so nothing reappears).
 */

import { BOOKS, DEFAULT_META } from "@/data/author";
import type { Book, DashboardMeta, Idea } from "@/data/author";
import type { CanonFact, CharacterRelation } from "@/data/continuity";
import type { SavedCoverPreset } from "@/data/cover";
import type { Character } from "@/data/characters";
import type { PlotCard } from "@/data/plot";
import type { ResearchNote } from "@/data/research";
import type { Series } from "@/data/series";
import type { WorldEntry } from "@/data/world";
import type { AppNotification } from "@/lib/notifications";

export type DataName =
  | "books"
  | "characters"
  | "world"
  | "plot"
  | "research"
  | "ideas"
  | "coverPresets"
  | "notifications"
  | "facts"
  | "relations"
  | "series";

const ALL_NAMES: DataName[] = [
  "books",
  "characters",
  "world",
  "plot",
  "research",
  "ideas",
  "coverPresets",
  "notifications",
  "facts",
  "relations",
  "series",
];

function scopedKey(profileId: string, name: DataName): string {
  return `authorai.${profileId}.${name}`;
}

function safeParse<T>(raw: string | null): T | null {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** null = never stored (fresh profile) · [] = explicitly emptied. */
function load<T>(profileId: string, name: DataName): T[] | null {
  const raw = localStorage.getItem(scopedKey(profileId, name));
  if (raw === null) return null;
  const data = safeParse<T[]>(raw);
  return Array.isArray(data) ? data : null;
}

function save<T>(profileId: string, name: DataName, value: T[]): void {
  try {
    localStorage.setItem(scopedKey(profileId, name), JSON.stringify(value));
  } catch {
    // storage full / unavailable — ignore
  }
}

/**
 * Loads stored books, backfilling the generated example covers onto seed books
 * that were persisted before covers existed.
 */
export function loadBooks(profileId: string): Book[] | null {
  const stored = load<Book>(profileId, "books");
  if (!stored) return null;
  return stored.map((book) => {
    if (book.coverUrl) return book;
    const seed = BOOKS.find((item) => item.id === book.id);
    return seed?.coverUrl ? { ...book, coverUrl: seed.coverUrl } : book;
  });
}
export const saveBooks = (profileId: string, value: Book[]) => save(profileId, "books", value);

export const loadCharacters = (profileId: string) => load<Character>(profileId, "characters");
export const saveCharacters = (profileId: string, value: Character[]) =>
  save(profileId, "characters", value);

export const loadWorld = (profileId: string) => load<WorldEntry>(profileId, "world");
export const saveWorld = (profileId: string, value: WorldEntry[]) =>
  save(profileId, "world", value);

export const loadFacts = (profileId: string) => load<CanonFact>(profileId, "facts");
export const saveFacts = (profileId: string, value: CanonFact[]) =>
  save(profileId, "facts", value);

export const loadRelations = (profileId: string) => load<CharacterRelation>(profileId, "relations");
export const saveRelations = (profileId: string, value: CharacterRelation[]) =>
  save(profileId, "relations", value);

export const loadSeries = (profileId: string) => load<Series>(profileId, "series");
export const saveSeries = (profileId: string, value: Series[]) => save(profileId, "series", value);

export const loadPlot = (profileId: string) => load<PlotCard>(profileId, "plot");
export const savePlot = (profileId: string, value: PlotCard[]) => save(profileId, "plot", value);

export const loadResearch = (profileId: string) => load<ResearchNote>(profileId, "research");
export const saveResearch = (profileId: string, value: ResearchNote[]) =>
  save(profileId, "research", value);

export const loadIdeas = (profileId: string) => load<Idea>(profileId, "ideas");
export const saveIdeas = (profileId: string, value: Idea[]) => save(profileId, "ideas", value);

export const loadCoverPresets = (profileId: string) =>
  load<SavedCoverPreset>(profileId, "coverPresets");
export const saveCoverPresets = (profileId: string, value: SavedCoverPreset[]) =>
  save(profileId, "coverPresets", value);

export const loadNotifications = (profileId: string) => {
  const stored = load<AppNotification>(profileId, "notifications");
  if (!stored) return stored;
  // Drop legacy example notifications that older versions seeded.
  return stored.filter((item) => !item.id.startsWith("ntf-seed-"));
};
export const saveNotifications = (profileId: string, value: AppNotification[]) =>
  save(profileId, "notifications", value);

/** Object store for dashboard metrics (not an array). */
export function loadMeta(profileId: string): DashboardMeta | null {
  const raw = localStorage.getItem(`authorai.${profileId}.meta`);
  if (raw === null) return null;
  const data = safeParse<DashboardMeta>(raw);
  if (!data || typeof data !== "object") return null;
  if (typeof data.version !== "number") return null;

  if (data.version < DEFAULT_META.version) {
    // Migrate older shapes without losing today's count.
    return {
      ...DEFAULT_META,
      todayWords: typeof data.todayWords === "number" ? data.todayWords : 0,
      goal: typeof data.goal === "number" ? data.goal : DEFAULT_META.goal,
      streakBest: typeof data.streakBest === "number" ? data.streakBest : 0,
    };
  }
  return data;
}

export function saveMeta(profileId: string, value: DashboardMeta): void {
  try {
    localStorage.setItem(`authorai.${profileId}.meta`, JSON.stringify(value));
  } catch {
    // ignore
  }
}

/** Removes every scoped collection for a profile. */
export function clearProfileData(profileId: string): void {
  for (const name of ALL_NAMES) {
    localStorage.removeItem(scopedKey(profileId, name));
  }
  localStorage.removeItem(`authorai.${profileId}.meta`);
}
