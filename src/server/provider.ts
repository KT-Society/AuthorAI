/**
 * Server-only: LLM-Anbieter-Konfiguration (OpenRouter **oder** eigener OpenAI-kompatibler
 * Anbieter).
 *
 * **Sicherheit:** Der API-Key des eigenen Anbieters kommt über die Einstellungen (Client →
 * lokaler Server) und wird **serverseitig** in einer eigenen Tabelle `provider` abgelegt — nicht
 * in `state`, damit er weder über `/api/state` noch über Client-Backups nach außen gelangt. Er
 * wird **nie** an den Client zurückgegeben, nie geloggt und nie in Fehlermeldungen aufgenommen;
 * nach außen sichtbar ist nur `hasKey: boolean`.
 */

import { getOpenRouterKey } from "@promptgen/server/env";

import { store } from "./store";

export type ProviderMode = "openrouter" | "custom";

export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface ProviderSettings {
  mode: ProviderMode;
  baseUrl: string;
  apiKey: string;
}

export interface ProviderStatus {
  mode: ProviderMode;
  /** Gespeicherte Base-URL (ohne Key). */
  baseUrl: string;
  /** Ist ein eigener Key gespeichert? (Niemals der Key selbst.) */
  hasKey: boolean;
  /** OpenRouter-Key aus der `.env` vorhanden? */
  openrouterAvailable: boolean;
  /** Welcher Anbieter tatsächlich benutzt wird (Env-Override berücksichtigt). */
  effective: ProviderMode;
  /** Effektive Basis-URL (ohne `/chat/completions`). */
  effectiveBaseUrl: string;
  /** Ist der wirksame Anbieter einsatzbereit (Key vorhanden)? */
  ready: boolean;
}

export interface ChatEndpoint {
  url: string;
  apiKey: string;
  label: ProviderMode;
}

let tableReady = false;

function ensureTable(): void {
  if (tableReady) return;
  store().exec(`
    CREATE TABLE IF NOT EXISTS provider (
      id         INTEGER PRIMARY KEY CHECK (id = 1),
      mode       TEXT NOT NULL,
      base_url   TEXT NOT NULL,
      api_key    TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  tableReady = true;
}

interface ProviderRow {
  mode: string;
  base_url: string;
  api_key: string;
}

/** Gespeicherte Konfiguration (inkl. Key — nur serverseitig verwenden!). */
export function readProvider(): ProviderSettings {
  ensureTable();
  const row = store()
    .query<ProviderRow, []>("SELECT mode, base_url, api_key FROM provider WHERE id = 1")
    .get();
  return {
    mode: row?.mode === "custom" ? "custom" : "openrouter",
    baseUrl: row?.base_url ?? "",
    apiKey: row?.api_key ?? "",
  };
}

/**
 * Schreibt die Konfiguration. `apiKey`:
 * - `undefined`/`""` → vorhandenen Key **behalten** (z. B. nur Base-URL ändern)
 * - `null` → Key **löschen**
 * - String → Key setzen
 */
export function writeProvider(input: {
  mode: ProviderMode;
  baseUrl: string;
  apiKey?: string | null;
}): ProviderStatus {
  ensureTable();
  const current = readProvider();
  const apiKey =
    input.apiKey === undefined || input.apiKey === ""
      ? current.apiKey
      : input.apiKey === null
        ? ""
        : input.apiKey;

  store()
    .query(
      `INSERT INTO provider (id, mode, base_url, api_key, updated_at)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         mode = excluded.mode,
         base_url = excluded.base_url,
         api_key = excluded.api_key,
         updated_at = excluded.updated_at`,
    )
    .run(input.mode, normalizeBaseUrl(input.baseUrl), apiKey, new Date().toISOString());

  return providerStatus();
}

/** Entfernt abschließende Slashes; ein vollständiger Chat-Pfad bleibt unangetastet. */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

/** `<base>/chat/completions` (bzw. der bereits vollständige Pfad). */
export function chatCompletionsUrl(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl);
  return /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`;
}

/** `<base>/models` — für den Verbindungstest. */
export function modelsUrl(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl).replace(/\/chat\/completions$/i, "");
  return `${base}/models`;
}

function envCustom(): { baseUrl: string; apiKey: string } | undefined {
  const baseUrl = (process.env.AUTHORAI_BASE_URL ?? "").trim();
  const apiKey = (process.env.AUTHORAI_API_KEY ?? "").trim();
  return baseUrl && apiKey ? { baseUrl, apiKey } : undefined;
}

/**
 * Der wirksame Chat-Endpoint. Präzedenz: Env-Override → gespeicherte Konfiguration →
 * OpenRouter (`.env`).
 */
export function resolveChatEndpoint(): ChatEndpoint {
  const envMode = (process.env.AUTHORAI_PROVIDER ?? "").trim().toLowerCase();
  const env = envCustom();

  if (envMode === "openrouter") return openRouterEndpoint();
  if (env) return { url: chatCompletionsUrl(env.baseUrl), apiKey: env.apiKey, label: "custom" };

  const settings = readProvider();
  if (settings.mode === "custom" && settings.baseUrl && settings.apiKey) {
    return {
      url: chatCompletionsUrl(settings.baseUrl),
      apiKey: settings.apiKey,
      label: "custom",
    };
  }
  return openRouterEndpoint();
}

function openRouterEndpoint(): ChatEndpoint {
  return { url: OPENROUTER_CHAT_URL, apiKey: getOpenRouterKey() ?? "", label: "openrouter" };
}

/** Status für die Einstellungen — **ohne** Key. */
export function providerStatus(): ProviderStatus {
  const settings = readProvider();
  const endpoint = resolveChatEndpoint();
  return {
    mode: settings.mode,
    baseUrl: settings.baseUrl,
    hasKey: settings.apiKey.length > 0,
    openrouterAvailable: Boolean(getOpenRouterKey()),
    effective: endpoint.label,
    effectiveBaseUrl: endpoint.url.replace(/\/chat\/completions$/i, ""),
    ready: endpoint.apiKey.length > 0,
  };
}

export interface ProviderTestResult {
  ok: boolean;
  detail: string;
}

/**
 * Prüft einen (auch ungespeicherten) Anbieter gegen `{base}/models`. Ohne `apiKey` wird der
 * gespeicherte bzw. der `.env`-Key benutzt. Fehlertexte enthalten **nie** den Key.
 */
export async function testProvider(input: {
  mode?: ProviderMode;
  baseUrl?: string;
  apiKey?: string;
}): Promise<ProviderTestResult> {
  const stored = readProvider();
  const mode: ProviderMode = input.mode === "custom" ? "custom" : input.mode === "openrouter" ? "openrouter" : stored.mode;

  let url: string;
  let apiKey: string;
  if (mode === "openrouter") {
    url = modelsUrl(OPENROUTER_CHAT_URL);
    apiKey = getOpenRouterKey() ?? "";
  } else {
    const baseUrl = (input.baseUrl ?? "").trim() || stored.baseUrl;
    apiKey = (input.apiKey ?? "").trim() || stored.apiKey;
    if (!baseUrl) return { ok: false, detail: "Keine Base-URL angegeben." };
    if (!/^https?:\/\//i.test(baseUrl)) {
      return { ok: false, detail: "Die Base-URL muss mit http:// oder https:// beginnen." };
    }
    url = modelsUrl(baseUrl);
  }

  if (!apiKey) return { ok: false, detail: "Kein API-Key vorhanden." };

  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!response.ok) {
      return { ok: false, detail: `HTTP ${response.status}` };
    }
    const data = (await response.json()) as { data?: unknown[] };
    const count = Array.isArray(data.data) ? data.data.length : 0;
    return { ok: true, detail: count > 0 ? `${count} Modelle erreichbar` : "Erreichbar" };
  } catch {
    return { ok: false, detail: "Verbindung fehlgeschlagen (URL/Netzwerk prüfen)." };
  }
}
