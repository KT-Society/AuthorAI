/**
 * Server-only environment loader.
 *
 * The app is run from `packages/promptgen`, but the secrets live in the
 * repository root `.env` (D:\workplace\AuthorAI\.env). Bun only auto-loads
 * `.env` from the current working directory, so we explicitly read the root
 * file here. This module must NEVER be imported by client code.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Findet die `.env`:
 *  1. im aktuellen Arbeitsverzeichnis,
 *  2. neben dem laufenden Binary (Standalone-Build),
 *  3. in den Elternverzeichnissen dieses Moduls (Entwicklung).
 */
function findRootEnv(): string | null {
  const explicit = [
    path.join(process.cwd(), ".env"),
    path.join(path.dirname(process.execPath), ".env"),
  ];
  for (const candidate of explicit) {
    if (existsSync(candidate)) return candidate;
  }

  let dir = import.meta.dir;
  for (let depth = 0; depth < 12; depth += 1) {
    const candidate = path.join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

let loaded = false;

function parseEnvFile(contents: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    if (!key) continue;

    let value = line.slice(separator + 1).trim();
    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (isQuoted && value.length >= 2) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

/**
 * Loads the repository root `.env` into `process.env`.
 * Existing process env vars always win (standard dotenv semantics).
 */
export function loadRootEnv(): void {
  if (loaded) return;
  loaded = true;

  const envPath = findRootEnv();
  if (!envPath) {
    console.warn("[env] No .env found in this project or any parent directory.");
    return;
  }

  const parsed = parseEnvFile(readFileSync(envPath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function getTavilyKey(): string | undefined {
  return process.env.TAVILY_API_KEY ?? process.env.TAVILY_KEY;
}

export function getOpenRouterKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY ?? process.env.OPENROUTER_KEY;
}

export function hasTavilyKey(): boolean {
  return Boolean(getTavilyKey());
}

export function getPollinationsKey(): string | undefined {
  return process.env.POLLINATIONS_API_KEY ?? process.env.POLLINATIONS_TOKEN;
}

export function hasOpenRouterKey(): boolean {
  return Boolean(getOpenRouterKey());
}

export function hasPollinationsKey(): boolean {
  return Boolean(getPollinationsKey());
}
