import type { Book } from "@/data/author";
import type { ChapterContent } from "@/data/story";

/** Strips stray pass markers (`<TEXT>`, `<NOTES>`…) that older runs may have left in the prose. */
function cleanProse(text: string): string {
  if (!text) return text;
  let result = text.replace(/^\s*<TEXT>\s*/i, "").replace(/\s*<\/TEXT>\s*$/i, "");
  result = result.replace(/\n\s*<NOTES>[\s\S]*$/i, "");
  result = result.replace(/<\/?TEXT>/gi, "").replace(/<\/?NOTES>/gi, "");
  return result.trim();
}

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
    draft: cleanProse(chapter.draft ?? ""),
    expanded: cleanProse(chapter.expanded ?? ""),
  }));
}
