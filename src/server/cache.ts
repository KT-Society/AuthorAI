/**
 * Server-only: kleiner In-Memory-Antwort-Cache für **wiederholbare Analysen**.
 *
 * Sinn: identische Extraktions-/Prüf-Aufrufe (z. B. zweimal „Fakten vorschlagen" auf
 * unverändertem Material) kosten sonst doppelt. Kreative Generierungen werden **nie**
 * gecacht — sonst bekäme „Erneut generieren" dieselbe Antwort.
 *
 * Bewusst flüchtig: nichts wird auf Platte geschrieben; ein Neustart leert den Cache.
 * Abschaltbar über `AUTHORAI_CACHE=0`.
 */

import { createHash } from "node:crypto";

export interface CacheRecord {
  content: string;
  finishReason: string | null;
}

const MAX_ENTRIES = 200;
const TTL_MS = 30 * 60 * 1000;

const store = new Map<string, { value: CacheRecord; at: number }>();
let hits = 0;
let misses = 0;

export function cacheEnabled(): boolean {
  return process.env.AUTHORAI_CACHE !== "0";
}

/** Schlüssel über alle inhaltsbestimmenden Parameter. */
export function cacheKey(parts: {
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}): string {
  const payload = [
    parts.model,
    String(parts.temperature ?? ""),
    String(parts.maxTokens ?? ""),
    parts.json ? "json" : "",
    parts.system,
    parts.user,
  ].join("\u0000");
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

export function cacheGet(key: string): CacheRecord | undefined {
  const entry = store.get(key);
  if (!entry) {
    misses += 1;
    return undefined;
  }
  if (Date.now() - entry.at > TTL_MS) {
    store.delete(key);
    misses += 1;
    return undefined;
  }
  // LRU: Zugriff frischt die Position auf.
  store.delete(key);
  store.set(key, entry);
  hits += 1;
  return entry.value;
}

export function cacheSet(key: string, value: CacheRecord): void {
  store.delete(key);
  store.set(key, { value, at: Date.now() });
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

export function cacheStats(): { size: number; hits: number; misses: number; enabled: boolean } {
  return { size: store.size, hits, misses, enabled: cacheEnabled() };
}

export function cacheClear(): void {
  store.clear();
  hits = 0;
  misses = 0;
}
