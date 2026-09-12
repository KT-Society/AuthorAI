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
