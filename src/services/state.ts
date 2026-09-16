/**
 * Client-Wrapper für den Server-Speicher (SQLite).
 *
 * Spricht ausschließlich mit den lokalen `/api/state`-Routen — kein Direktzugriff auf die
 * Datenbank, keine Secrets.
 */

import { postJson } from "./http";

export interface StoreInfo {
  file: string;
  sizeBytes: number;
  profiles: number;
  totalRows: number;
  rows: { collection: string; bytes: number; updatedAt: string }[];
}

/** Alle Sammlungen eines Profils laden. */
export async function fetchState(profileId: string): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/state?profile=${encodeURIComponent(profileId)}`);
  if (!response.ok) {
    throw new Error(`Server-Speicher nicht erreichbar (HTTP ${response.status}).`);
  }
  const data = (await response.json()) as { collections?: Record<string, unknown> };
  return data.collections && typeof data.collections === "object" ? data.collections : {};
}

/** Eine Sammlung schreiben. */
export async function putState(
  profileId: string,
  collection: string,
  value: unknown,
): Promise<void> {
  await postJson("/api/state", { profileId, collection, value }, "PUT");
}

/** Mehrere Sammlungen auf einmal schreiben (Migration, Backup-Import). */
export async function putStateBulk(
  profileId: string,
  entries: Record<string, unknown>,
): Promise<number> {
  const data = await postJson<{ written?: number }>(
    "/api/state",
    { profileId, entries },
    "PUT",
  );
  return typeof data.written === "number" ? data.written : 0;
}

/** Alle Daten eines Profils löschen. */
export async function clearState(profileId: string): Promise<void> {
  await fetch(`/api/state?profile=${encodeURIComponent(profileId)}`, { method: "DELETE" });
}

/** Belegung der Datenbank. */
export async function fetchStoreInfo(): Promise<StoreInfo | null> {
  try {
    const response = await fetch("/api/store/info");
    if (!response.ok) return null;
    return (await response.json()) as StoreInfo;
  } catch {
    return null;
  }
}

export interface CompactResult {
  before: number;
  after: number;
  saved: number;
}

/**
 * Lädt eine konsistente Datenbank-Kopie als Datei herunter.
 *
 * Der Server streamt die Kopie und löscht sie danach selbst — der Client hält nichts zurück.
 */
export async function downloadStoreBackup(): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/store/backup", { method: "POST" });
  } catch {
    throw new Error("Server nicht erreichbar. Läuft `bun run dev`?");
  }
  if (!response.ok) {
    let message = `Serverfehler (${response.status})`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // Generische Meldung behalten.
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = match?.[1] ?? "authorai.db";
  anchor.click();
  URL.revokeObjectURL(url);
}

/** WAL-Checkpoint und VACUUM; liefert Vorher/Nachher in Bytes. */
export async function compactStore(): Promise<CompactResult> {
  return postJson<CompactResult>("/api/store/compact", {});
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  enabled: boolean;
}

/** Trefferquote des flüchtigen Antwort-Caches. */
export async function fetchCacheStats(): Promise<CacheStats | null> {
  try {
    const response = await fetch("/api/cache");
    if (!response.ok) return null;
    return (await response.json()) as CacheStats;
  } catch {
    return null;
  }
}

/** Leert den Antwort-Cache. */
export async function clearCache(): Promise<void> {
  await postJson("/api/cache/clear", {});
}
