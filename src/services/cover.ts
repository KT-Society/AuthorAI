/**
 * Client-side cover generation wrapper.
 * Builds a cover prompt from the storyboard and asks the server (Pollinations).
 */

import type { Storyboard } from "@/data/story";

import { postJson } from "./http";

export const COVER_MODEL = "black-forest-labs/flux.1-schnell";

export function buildCoverPrompt(storyboard: Storyboard): string {
  const parts = [
    "professional book cover art",
    storyboard.genre ? `genre: ${storyboard.genre}` : "",
    storyboard.themes.length > 0 ? `themes: ${storyboard.themes.join(", ")}` : "",
    storyboard.tone ? `mood: ${storyboard.tone}` : "",
    storyboard.logline ? `concept: ${storyboard.logline}` : storyboard.title,
    "dramatic cinematic lighting, rich colors, painterly, highly detailed",
    "vertical portrait composition",
    "no text, no letters, no words, no typography, no watermark",
  ];
  return parts.filter(Boolean).join(", ");
}

export interface CoverRequest {
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
  seed?: number;
}

export async function generateCover(input: CoverRequest): Promise<string> {
  const data = await postJson<{ url?: string }>("/api/cover", {
    model: COVER_MODEL,
    width: 768,
    height: 1024,
    ...input,
  });
  if (!data.url) throw new Error("Leere Cover-Antwort vom Server.");
  return data.url;
}

/** Uploads a client-composed PNG to the server and returns its URL path. */
export async function saveCoverImage(blob: Blob): Promise<string> {
  let response: Response;
  try {
    response = await fetch("/api/cover/save", {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: blob,
    });
  } catch {
    throw new Error("Server nicht erreichbar. Läuft `bun run dev`?");
  }

  if (!response.ok) {
    let message = `Serverfehler (${response.status})`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }

  const data = (await response.json()) as { url?: string };
  if (!data.url) throw new Error("Leere Antwort beim Speichern des Covers.");
  return data.url;
}

/** Deletes a generated cover file on the server (best effort). */
export async function deleteCover(url: string): Promise<void> {
  const file = url.replace(/^\/covers\//, "");
  if (!/^[a-zA-Z0-9._-]+\.png$/.test(file)) return;
  try {
    await fetch(`/api/cover/${file}`, { method: "DELETE" });
  } catch {
    // best effort — never block the UI on cleanup
  }
}
