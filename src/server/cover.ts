/**
 * Server-only cover generation via Pollinations.
 * Uses the black-forest-labs/flux.1-schnell model and the POLLINATIONS_API_KEY
 * from the repository root `.env`. Never imported by client code.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ApiError } from "@promptgen/server/api";

const API_BASE = process.env.POLLINATIONS_API_BASE ?? "https://gen.pollinations.ai";
const COVERS_DIR = path.resolve(import.meta.dir, "../../covers");

export const DEFAULT_COVER_MODEL = "black-forest-labs/flux.1-schnell";

export interface CoverInput {
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
  seed?: number;
}

function getKey(): string | undefined {
  return process.env.POLLINATIONS_API_KEY ?? process.env.POLLINATIONS_TOKEN;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function coversDir(): string {
  return COVERS_DIR;
}

/** Generates a cover image and returns its public URL path (e.g. `/covers/xyz.png`). */
export async function generateCover(input: CoverInput): Promise<string> {
  const key = getKey();
  if (!key) {
    throw new ApiError("Kein POLLINATIONS_API_KEY in der .env gefunden.", 500);
  }

  const model = input.model?.trim() || DEFAULT_COVER_MODEL;
  const width = clamp(input.width ?? 768, 256, 1536);
  const height = clamp(input.height ?? 1024, 256, 1536);
  const seed = input.seed ?? Math.floor(Math.random() * 1_000_000_000);

  const params = new URLSearchParams({
    model,
    width: String(width),
    height: String(height),
    seed: String(seed),
  });
  const endpoint = `${API_BASE}/image/${encodeURIComponent(input.prompt)}?${params.toString()}`;

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${key}`,
      safe: "nsfw",
      "User-Agent": "AuthorAI/1.0",
    },
  });

  if (!response.ok) {
    throw new ApiError(`Pollinations-Cover fehlgeschlagen (HTTP ${response.status}).`, 502);
  }

  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength === 0) {
    throw new ApiError("Pollinations hat ein leeres Bild geliefert.", 502);
  }

  await mkdir(COVERS_DIR, { recursive: true });
  const fileName = `cover-${Date.now().toString(36)}-${seed.toString(36)}.png`;
  await writeFile(path.join(COVERS_DIR, fileName), buffer);
  return `/covers/${fileName}`;
}

/** Persists a client-composed PNG (e.g. cover + text) and returns its URL path. */
export async function saveCoverImage(buffer: Uint8Array): Promise<string> {
  await mkdir(COVERS_DIR, { recursive: true });
  const fileName = `cover-${Date.now().toString(36)}-${Math.floor(Math.random() * 1_000_000).toString(36)}.png`;
  await writeFile(path.join(COVERS_DIR, fileName), buffer);
  return `/covers/${fileName}`;
}
