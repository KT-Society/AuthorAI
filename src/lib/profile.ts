/**
 * Lightweight local profiles ("per user" state without a backend).
 *
 * Each profile keeps its own copy of the library/characters/world/plot/research,
 * so the example data is present for every new profile, deletions only affect the
 * profile that made them, and new items belong to that profile alone.
 */

import { clearProfileData } from "@/lib/persistence";

export { clearProfileData };

export interface Profile {
  id: string;
  name: string;
  createdAt: string;
}

const PROFILES_KEY = "authorai.profiles";
const CURRENT_KEY = "authorai.currentProfile";

const SCOPED_NAMES = ["books", "characters", "world", "plot", "research", "notifications"] as const;

const LEGACY_KEYS: Record<(typeof SCOPED_NAMES)[number], string> = {
  books: "authorai.books",
  characters: "authorai.characters",
  world: "authorai.world",
  plot: "authorai.plot",
  research: "authorai.research",
  notifications: "authorai.notifications",
};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadProfiles(): Profile[] {
  const raw = localStorage.getItem(PROFILES_KEY);
  const data = safeParse<Profile[]>(raw);
  return Array.isArray(data) ? data : [];
}

export function saveProfiles(profiles: Profile[]): void {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  } catch {
    // ignore
  }
}

export function loadCurrentProfileId(): string | null {
  return localStorage.getItem(CURRENT_KEY);
}

export function saveCurrentProfileId(id: string | null): void {
  if (id === null) localStorage.removeItem(CURRENT_KEY);
  else localStorage.setItem(CURRENT_KEY, id);
}

export function createProfile(name: string): Profile {
  return {
    id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || "Autor",
    createdAt: new Date().toISOString(),
  };
}

/**
 * Returns the profiles, migrating any pre-profiles (global) data into a default
 * profile the first time so existing work is not lost.
 */
export function ensureProfiles(): Profile[] {
  const existing = loadProfiles();
  if (existing.length > 0) return existing;

  const hasLegacyData = SCOPED_NAMES.some(
    (name) => localStorage.getItem(LEGACY_KEYS[name]) !== null,
  );
  if (!hasLegacyData) return [];

  const profile = createProfile("Autor");
  for (const name of SCOPED_NAMES) {
    const value = localStorage.getItem(LEGACY_KEYS[name]);
    if (value !== null) {
      localStorage.setItem(`authorai.${profile.id}.${name}`, value);
      localStorage.removeItem(LEGACY_KEYS[name]);
    }
  }
  saveProfiles([profile]);
  saveCurrentProfileId(profile.id);
  return [profile];
}
