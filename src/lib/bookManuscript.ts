import type { Book } from "@/data/author";
import type { ChapterContent } from "@/data/story";
import { extractProse } from "@/lib/prose";

/** Returns the book's manuscript, deriving empty chapters from the storyboard if needed. */
export function manuscriptOf(book: Book): ChapterContent[] {
  const source =
    book.manuscript && book.manuscript.length > 0
      ? book.manuscript
      : book.storyboard && book.storyboard.chapters.length > 0
        ? book.storyboard.chapters.map((chapter, index) => ({
            index,
            title: chapter.title,
            draft: "",
            expanded: "",
          }))
        : [];

  return source.map((chapter) => ({
    ...chapter,
    draft: extractProse(chapter.draft ?? ""),
    expanded: extractProse(chapter.expanded ?? ""),
  }));
}

/**
 * Start-Schritt für den Wizard beim **Wiedereinstieg**: der letzte erledigte Pipeline-Schritt,
 * damit man dort weitermacht, wo man aufgehört hat. Reihenfolge:
 * `0 Idee · 1 Storyboard · 2 Rohentwurf · 3 Ausbau · 4 Kohärenz · 5 Stil · 6 Fakten`.
 */
export function resumeStep(manuscript: ChapterContent[]): number {
  if (manuscript.length === 0) return 0;
  const hasText = (text: string) => text.trim().length > 0;
  const all = (fn: (chapter: ChapterContent) => boolean) => manuscript.every(fn);
  const some = (fn: (chapter: ChapterContent) => boolean) => manuscript.some(fn);
  // `styleChecked`/`consistencyChecked` sind optional — `Boolean(...)` macht daraus ein echtes
  // Ja/Nein für den Prädikatstyp (sonst wäre „undefined" weder wahr noch falsch).
  if (some((chapter) => hasText(chapter.expanded)) && all((chapter) => Boolean(chapter.styleChecked)))
    return 6;
  if (
    some((chapter) => hasText(chapter.expanded)) &&
    all((chapter) => Boolean(chapter.consistencyChecked))
  )
    return 5;
  if (all((chapter) => hasText(chapter.expanded))) return 4;
  if (some((chapter) => hasText(chapter.expanded))) return 3;
  if (some((chapter) => hasText(chapter.draft))) return 2;
  return 1;
}
