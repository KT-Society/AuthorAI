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
