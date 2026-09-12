/**
 * Reihen-Übersicht: alle Bände einer Reihe mit Fortschritt und Lücken.
 *
 * Pur und damit testbar — die UI (LibraryView) rendert nur noch.
 */

import type { Book, BookStatus } from "@/data/author";
import { progressOf } from "@/data/author";
import type { Series } from "@/data/series";

export interface SeriesVolumeInfo {
  bookId: string;
  /** 1-basierte Position in der Lesereihenfolge. */
  position: number;
  book?: Book;
}

export interface SeriesOverview {
  id: string;
  name: string;
  description?: string;
  volumes: SeriesVolumeInfo[];
  /** Bände ohne vorhandenes Buch (gelöscht) — die Reihenfolge hat eine Lücke. */
  missing: number;
  /** Bände ohne Storyboard (noch nicht begonnen). */
  withoutStoryboard: number;
  totalWords: number;
  /** Durchschnittlicher Fortschritt über die vorhandenen Bände (0 … 100, wie `progressOf`). */
  progress: number;
  /** Schwächster Band — die Reihe ist erst fertig, wenn alle fertig sind (0 … 100). */
  minProgress: number;
  statuses: BookStatus[];
}

export function seriesOverview(series: Series[], books: Book[]): SeriesOverview[] {
  const byId = new Map(books.map((book) => [book.id, book]));

  return series.map((entry) => {
    const volumes = entry.volumeIds.map((bookId, index) => ({
      bookId,
      position: index + 1,
      book: byId.get(bookId),
    }));
    const present = volumes.filter((volume) => volume.book);
    const progresses = present.map((volume) => progressOf(volume.book as Book));

    return {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      volumes,
      missing: volumes.length - present.length,
      withoutStoryboard: present.filter((volume) => !volume.book?.storyboard).length,
      totalWords: present.reduce((sum, volume) => sum + (volume.book?.words ?? 0), 0),
      progress:
        progresses.length > 0
          ? progresses.reduce((sum, value) => sum + value, 0) / progresses.length
          : 0,
      minProgress: progresses.length > 0 ? Math.min(...progresses) : 0,
      statuses: present.map((volume) => (volume.book as Book).status),
    };
  });
}
