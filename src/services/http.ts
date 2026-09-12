/** Shared client-side JSON request helper (POST oder PUT). */

export async function postJson<T>(
  path: string,
  body: unknown,
  method: "POST" | "PUT" = "POST",
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

  return (await response.json()) as T;
}
