/**
 * Client-side wrapper for the character generation API.
 *
 * Runs in the browser and talks ONLY to the local Bun server (`/api/*`),
 * which uses the promptgen engine. API keys never reach the client.
 */

export interface AppConfig {
  tavily: boolean;
  openrouter: boolean;
  languages: string[];
  defaultLanguage: string;
}

export interface GenerateInput {
  slug: string;
  model: string;
  language: string;
}

export type SoulData = Record<string, string>;

export async function fetchConfig(): Promise<AppConfig | null> {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) return null;
    return (await response.json()) as AppConfig;
  } catch {
    return null;
  }
}

export async function generateSoul(input: GenerateInput): Promise<SoulData> {
  let response: Response;
  try {
    response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
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

  const data = (await response.json()) as { soul?: SoulData };
  if (!data.soul) {
    throw new Error("Leere Antwort vom Server.");
  }
  return data.soul;
}
