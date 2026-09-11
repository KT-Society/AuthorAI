/**
 * Serien-Modus: mehrere Bände mit geteilter Welt, Figuren-Historie und Kanon.
 *
 * Bewusst **eine** Quelle der Wahrheit: die Reihe hält die Band-IDs in Lesereihenfolge
 * (`volumeIds`). `Book` bekommt kein `seriesId` — so kann nichts auseinanderlaufen.
 */

export interface Series {
  id: string;
  name: string;
  description?: string;
  /** Buch-IDs in Lesereihenfolge (Band 1 … n). */
  volumeIds: string[];
  createdAt: string;
}

export function newSeriesId(): string {
  return `series-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Die Reihe, zu der ein Buch gehört (oder undefined). */
export function seriesOfBook(series: Series[], bookId: string): Series | undefined {
  return series.find((entry) => entry.volumeIds.includes(bookId));
}

/** 1-basierte Bandnummer innerhalb der Reihe (0 = kein Band). */
export function volumeNumber(series: Series, bookId: string): number {
  const index = series.volumeIds.indexOf(bookId);
  return index === -1 ? 0 : index + 1;
}

/** Anzeigelabel wie „Band 3" (oder "" wenn kein Band). */
export function volumeLabel(series: Series, bookId: string): string {
  const number = volumeNumber(series, bookId);
  return number > 0 ? `Band ${number}` : "";
}

/**
 * Alle Band-IDs, die für den Kanon eines Buchs gelten:
 * die ganze Reihe (gemeinsame Welt/Historie) oder nur das Buch selbst.
 */
export function canonVolumeIds(series: Series[], bookId: string): string[] {
  const entry = seriesOfBook(series, bookId);
  if (!entry || entry.volumeIds.length === 0) return [bookId];
  return entry.volumeIds.includes(bookId) ? [...entry.volumeIds] : [bookId];
}

/** Bücher, die noch zu keiner Reihe gehören (Auswahl „Band hinzufügen"). */
export function availableVolumes(series: Series[], allBookIds: string[]): string[] {
  const taken = new Set(series.flatMap((entry) => entry.volumeIds));
  return allBookIds.filter((id) => !taken.has(id));
}

/** Reihen, die dieses Buch aufnehmen können (alle, in denen es noch nicht steckt). */
export function addableSeries(series: Series[], bookId: string): Series[] {
  return series.filter((entry) => !entry.volumeIds.includes(bookId));
}

/** Entfernt ein Buch aus allen Reihen (z. B. wenn das Buch gelöscht wird). */
export function removeBookFromSeries(series: Series[], bookId: string): Series[] {
  return series.map((entry) =>
    entry.volumeIds.includes(bookId)
      ? { ...entry, volumeIds: entry.volumeIds.filter((id) => id !== bookId) }
      : entry,
  );
}

/** Keine Seed-Reihen: die Beispiel-Bücher sind eigenständige Projekte. */
export const SERIES: Series[] = [];
