/**
 * Projekt-Backup: alle Profildaten als JSON exportieren/importieren.
 */

import type { Book, DashboardMeta, Idea } from "@/data/author";
import type { Character } from "@/data/characters";
import type { CanonFact, CharacterRelation } from "@/data/continuity";
import type { PlotCard } from "@/data/plot";
import type { ResearchNote } from "@/data/research";
import type { Series } from "@/data/series";
import type { AppNotification } from "@/lib/notifications";
import type { WorldEntry } from "@/data/world";

export const BACKUP_FORMAT = "authorai-backup";
export const BACKUP_VERSION = 2;

export interface BackupData {
  books: Book[];
  characters: Character[];
  world: WorldEntry[];
  plot: PlotCard[];
  research: ResearchNote[];
  ideas: Idea[];
  notifications: AppNotification[];
  facts: CanonFact[];
  relations: CharacterRelation[];
  series: Series[];
  meta: DashboardMeta;
}

export interface ProfileBackup extends BackupData {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  profileName: string;
}

export function createBackup(profileName: string, data: BackupData): ProfileBackup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    profileName,
    ...data,
  };
}

const asList = (value: unknown): never[] => (Array.isArray(value) ? (value as never[]) : []);

export function parseBackup(text: string): ProfileBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Die Datei ist kein gültiges JSON.");
  }

  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!obj || obj.format !== BACKUP_FORMAT) {
    throw new Error("Das ist kein AuthorAI-Backup.");
  }
  if (typeof obj.version !== "number" || obj.version > BACKUP_VERSION) {
    throw new Error("Das Backup stammt aus einer neueren Version und kann nicht gelesen werden.");
  }

  return {
    format: BACKUP_FORMAT,
    version: obj.version,
    exportedAt: typeof obj.exportedAt === "string" ? obj.exportedAt : "",
    profileName: typeof obj.profileName === "string" ? obj.profileName : "Backup",
    books: asList(obj.books) as unknown as Book[],
    characters: asList(obj.characters) as unknown as Character[],
    world: asList(obj.world) as unknown as WorldEntry[],
    plot: asList(obj.plot) as unknown as PlotCard[],
    research: asList(obj.research) as unknown as ResearchNote[],
    ideas: asList(obj.ideas) as unknown as Idea[],
    notifications: asList(obj.notifications) as unknown as AppNotification[],
    // Ab Version 2 dabei; ältere Backups (v1) liefern hier leere Listen.
    facts: asList(obj.facts) as unknown as CanonFact[],
    relations: asList(obj.relations) as unknown as CharacterRelation[],
    series: asList(obj.series) as unknown as Series[],
    meta:
      obj.meta && typeof obj.meta === "object"
        ? (obj.meta as DashboardMeta)
        : ({} as DashboardMeta),
  };
}
