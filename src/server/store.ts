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
import os from "node:os";
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

/** Zeitstempel für Dateinamen: `YYYYMMDD-HHMMSS` (lokal, sortierbar). */
export function timestampSlug(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** Belegte Bytes auf Platte, inklusive WAL/SHM — sonst wäre die Anzeige zu klein. */
export function storeSize(): number {
  const file = databaseFile();
  return [file, `${file}-wal`, `${file}-shm`].reduce((sum, part) => sum + fileSize(part), 0);
}

/**
 * Konsistente Kopie der Datenbank in eine **neue** Datei (`VACUUM INTO`).
 *
 * Die lebende Datei wird nie verschoben oder umbenannt — unter Windows bleibt sie unmittelbar
 * nach dem Schließen kurz gesperrt. Rückgabe ist der Pfad der Kopie; der Aufrufer löscht sie.
 */
export function createSnapshot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "authorai-snapshot-"));
  const target = path.join(dir, `authorai-${timestampSlug()}.db`);
  try {
    // VACUUM INTO schreibt eine sortierte, konsistente Sicherung ohne WAL-Reste.
    store().query("VACUUM INTO ?").run(target);
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  }
  return target;
}

/** WAL-Reste in die Hauptdatei schreiben und die Datei komprimieren. */
export function compactStore(): { before: number; after: number } {
  const db = store();
  // TRUNCATE entfernt zusätzlich die -wal-Datei, sonst würde sie den Gewinn wieder auffressen.
  db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  const before = storeSize();
  db.exec("VACUUM;");
  // Nach VACUUM kann ein Rest-WAL entstehen — der Aufruf entfernt ihn für eine ehrliche Anzeige.
  db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  return { before, after: storeSize() };
}

/**
 * Löscht eine Snapshot-Datei. Unter Windows kann die Datei noch kurz gesperrt sein —
 * deshalb ein paar Versuche mit kurzer Pause; scheitert alles, räumt das Temp-Verzeichnis
 * das nächste System auf.
 */
export function removeSnapshot(file: string): void {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(file, { force: true });
      const dir = path.dirname(file);
      // Nur unser eigenes mkdtemp-Verzeichnis entfernen — nie darüber hinaus.
      if (path.basename(dir).startsWith("authorai-snapshot-")) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
      return;
    } catch {
      // Windows hält die Datei kurz nach dem Schreiben — kurz warten und erneut versuchen.
      Bun.sleepSync(50);
    }
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
  const sizeBytes = storeSize();

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
