/**
 * Kontext für einen neuen Band einer Reihe: Was in den **Vorbänden** etabliert wurde.
 *
 * Zwei Blöcke, beide optional:
 * - `context` — Prosa-Kontext für die Storyboard-Erzeugung (Fortsetzung statt Nacherzählung).
 * - `canon` — verbindlicher Fakten-/Beziehungs-Block aller Vorbände für die Prüf-Pässe.
 */

import type { Book } from "@/data/author";
import type { Character } from "@/data/characters";
import { canonBlock, factsForBook, relationsForBook } from "@/data/continuity";
import type { CanonFact, CharacterRelation } from "@/data/continuity";
import type { Series } from "@/data/series";
import type { WorldEntry } from "@/data/world";

const SYNOPSIS_LIMIT = 500;
const MAX_CAST = 12;
const MAX_PLACES = 8;

export interface SeriesContextInput {
  series: Series;
  books: Book[];
  characters: Character[];
  worlds: WorldEntry[];
  facts: CanonFact[];
  relations: CharacterRelation[];
}

function clip(value: string, limit: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit)}…` : clean;
}

/** Die Vorbände dieser Reihe in Lesereihenfolge (ohne das neue Buch). */
export function previousVolumes(input: SeriesContextInput, bookId?: string): Book[] {
  return input.series.volumeIds
    .filter((id) => id !== bookId)
    .map((id) => input.books.find((book) => book.id === id))
    .filter((book): book is Book => Boolean(book));
}

/**
 * Baut den Reihen-Kontext für ein neues Buch.
 * Liefert `undefined`, wenn die Reihe noch keine Vorbände hat.
 */
export function buildSeriesContext(
  input: SeriesContextInput,
  bookId?: string,
): { context?: string; canon?: string } {
  const volumes = previousVolumes(input, bookId);
  if (volumes.length === 0) return {};

  const volumeLines = volumes.map((book, index) => {
    const storyboard = book.storyboard;
    const cast = (storyboard?.characters ?? [])
      .slice(0, MAX_CAST)
      .map((character) => `${character.name}${character.role ? ` (${character.role})` : ""}`)
      .join(", ");
    const places = [
      ...(storyboard?.world?.locations ?? []),
      ...(storyboard?.world?.factions ?? []),
    ]
      .slice(0, MAX_PLACES)
      .map((item) => item.name)
      .join(", ");
    const parts = [
      `Band ${index + 1}: „${book.title}"`,
      storyboard?.genre ? `Genre: ${storyboard.genre}` : "",
      storyboard?.logline ? `Logline: ${clip(storyboard.logline, 200)}` : "",
      storyboard?.synopsis ? `Handlung: ${clip(storyboard.synopsis, SYNOPSIS_LIMIT)}` : "",
      cast ? `Figuren: ${cast}` : "",
      places ? `Schauplätze/Fraktionen: ${places}` : "",
    ].filter(Boolean);
    return `- ${parts.join(" — ")}`;
  });

  const context = `SERIES: this book is the next volume of „${input.series.name}"${
    input.series.description ? ` (${clip(input.series.description, 240)})` : ""
  }.
EARLIER VOLUMES (established — continue from here, never retell them):
${volumeLines.join("\n")}
Rules: the new volume must be consistent with everything established above. Continue the
story forward — reuse the world and cast instead of reintroducing them from scratch.`;

  // Kanon der Vorbände (Fakten + Beziehungen), falls vorhanden.
  const volumeIds = new Set(volumes.map((book) => book.id));
  const characterIds = new Set(
    input.characters
      .filter((character) => volumeIds.has(character.bookId ?? ""))
      .map((character) => character.id),
  );
  const worldIds = new Set(
    input.worlds.filter((entry) => volumeIds.has(entry.bookId ?? "")).map((entry) => entry.id),
  );
  const nameOf = (id: string) =>
    input.characters.find((character) => character.id === id)?.name ??
    input.worlds.find((entry) => entry.id === id)?.title ??
    "";
  const canon = canonBlock({
    facts: factsForBook(input.facts, characterIds, worldIds),
    relations: relationsForBook(input.relations, characterIds),
    nameOf,
  });

  return { context, canon: canon.trim().length > 0 ? canon : undefined };
}
