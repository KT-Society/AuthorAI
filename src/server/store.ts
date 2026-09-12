/**
 * Server-only: SQLite-Speicher für alle Fachdaten (`bun:sqlite`).
 *
 * Warum überhaupt: Fachdaten lagen im `localStorage` — dessen Limit liegt bei ~5 MB pro Origin.
 * Ein großes Projekt (13 Kapitel × 8.000 Wörter **mit** Versionshistorie) braucht allein 8,8 MB;
 * danach schlug jedes Speichern fehl und Änderungen waren nach einem Reload weg.
 *
 * Die Datei liegt neben `covers/` unter `<runtimeRoot>/data/authorai.db` (gitignored) — in
 * einem Standalone-Binary also neben dem Binary, nie im Repo.
 *
 * `bun:sqlite` statt `better-sqlite3`: gleiche API, aber **kein nativer Build** nötig.
 */

import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";

import { isStateCollection } from "../data/state";
import type { StateCollection } from "../data/state";
import { runtimeRoot } from "./paths";

function dataDir(): string {
  return path.resolve(runtimeRoot(), "data");
}

export function databaseFile(): string {
  return path.join(dataDir(), "authorai.db");
}

let handle: Database | null = null;

/** Öffnet (beim ersten Zugriff) die Datenbank und legt das Schema an. */
export function store(): Database {
  if (handle) return handle;
  fs.mkdirSync(dataDir(), { recursive: true });
  const db = new Database(databaseFile(), { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS state (
      profile_id TEXT NOT NULL,
      collection TEXT NOT NULL,
      json       TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (profile_id, collection)
    );
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_state_profile ON state (profile_id);");
  handle = db;
  return db;
}

export interface StateRow {
  collection: string;
  bytes: number;
  updatedAt: string;
}

/** Alle Sammlungen eines Profils einlesen. */
export function readState(profileId: string): Record<string, unknown> {
  const rows = store()
    .query<{ collection: string; json: string }, [string]>(
      "SELECT collection, json FROM state WHERE profile_id = ?",
    )
    .all(profileId);

  const out: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      out[row.collection] = JSON.parse(row.json) as unknown;
    } catch {
      // Defekte Zeile ignorieren — der Rest bleibt nutzbar.
      console.error(`[store] defekter Eintrag: ${profileId}/${row.collection}`);
    }
  }
  return out;
}

/** Eine Sammlung schreiben (Upsert). Liefert die gespeicherte Größe. */
export function writeState(
  profileId: string,
  collection: StateCollection,
  value: unknown,
): { bytes: number; updatedAt: string } {
  const json = JSON.stringify(value ?? null);
  const updatedAt = new Date().toISOString();
  store()
    .query(
      `INSERT INTO state (profile_id, collection, json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(profile_id, collection)
       DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
    )
    .run(profileId, collection, json, updatedAt);
  return { bytes: json.length, updatedAt };
}

/** Mehrere Sammlungen auf einmal schreiben (Migration, Backup-Import). */
export function writeStateBulk(
  profileId: string,
  entries: Record<string, unknown>,
): { written: number } {
  const db = store();
  const statement = db.query(
    `INSERT INTO state (profile_id, collection, json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(profile_id, collection)
     DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
  );
  const updatedAt = new Date().toISOString();
  let written = 0;

  const run = db.transaction((pairs: [string, unknown][]) => {
    for (const [collection, value] of pairs) {
      if (!isStateCollection(collection)) continue;
      statement.run(profileId, collection, JSON.stringify(value ?? null), updatedAt);
      written += 1;
    }
  });
  run(Object.entries(entries));

  return { written };
}

/** Alle Daten eines Profils entfernen (Profil löschen). */
export function clearState(profileId: string): { deleted: number } {
  const result = store()
    .query("DELETE FROM state WHERE profile_id = ?")
    .run(profileId);
  return { deleted: Number(result.changes ?? 0) };
}

function fileSize(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

/** Belegung für die Anzeige in den Einstellungen. */
export function storeInfo(): {
  file: string;
  sizeBytes: number;
  profiles: number;
  totalRows: number;
  rows: StateRow[];
} {
  const rows = store()
    .query<{ profile_id: string; collection: string; bytes: number; updated_at: string }, []>(
      `SELECT profile_id, collection, length(json) AS bytes, updated_at
       FROM state ORDER BY length(json) DESC LIMIT 50`,
    )
    .all();

  // WAL: frisch Geschriebenes liegt noch in `-wal`/`-shm` — sonst wäre die Anzeige zu klein.
  const file = databaseFile();
  const sizeBytes = fileSize(file) + fileSize(`${file}-wal`) + fileSize(`${file}-shm`);

  const profiles = store()
    .query<{ count: number }, []>("SELECT COUNT(DISTINCT profile_id) AS count FROM state")
    .get();

  return {
    file,
    sizeBytes,
    profiles: profiles?.count ?? 0,
    totalRows: rows.length,
    rows: rows.map((row) => ({
      collection: `${row.collection}`,
      bytes: row.bytes,
      updatedAt: row.updated_at,
    })),
  };
}
