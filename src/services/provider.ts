/**
 * Client-Wrapper für die LLM-Anbieter-Konfiguration.
 *
 * Spricht ausschließlich mit dem lokalen Server (`/api/provider`) und erhält **nie** den Key
 * zurück — nur `hasKey: boolean`.
 */

import { postJson } from "./http";

export type ProviderMode = "openrouter" | "custom";

export interface ProviderStatus {
  mode: ProviderMode;
  baseUrl: string;
  /** Ist ein eigener Key gespeichert? (Nie der Key selbst.) */
  hasKey: boolean;
  openrouterAvailable: boolean;
  effective: ProviderMode;
  effectiveBaseUrl: string;
  ready: boolean;
}

export interface ProviderTestResult {
  ok: boolean;
  detail: string;
}

export async function fetchProvider(): Promise<ProviderStatus | null> {
  try {
    const response = await fetch("/api/provider");
    if (!response.ok) return null;
    return (await response.json()) as ProviderStatus;
  } catch {
    return null;
  }
}

/**
 * Speichert die Anbieter-Konfiguration.
 * `apiKey`: nicht-leer = setzen · `null` = löschen · weglassen = behalten.
 */
export async function saveProvider(input: {
  mode: ProviderMode;
  baseUrl: string;
  apiKey?: string | null;
}): Promise<ProviderStatus> {
  return postJson<ProviderStatus>("/api/provider", input, "PUT");
}

/** Testet (auch ungespeicherte) Werte gegen `{base}/models`. */
export async function testProvider(input: {
  mode: ProviderMode;
  baseUrl?: string;
  apiKey?: string;
}): Promise<ProviderTestResult> {
  try {
    return await postJson<ProviderTestResult>("/api/provider/test", input);
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "Unbekannter Fehler." };
  }
}
