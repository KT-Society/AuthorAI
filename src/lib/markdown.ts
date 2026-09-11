/** Markdown-Export eines Buchs (Kapitel mit Überschriften, Absätze). */

import type { Book } from "@/data/author";
import { countWords, toParagraphs } from "@/data/story";

import { manuscriptOf } from "./bookManuscript";

export function buildMarkdown(book: Book): string {
  const manuscript = manuscriptOf(book);
  const totalWords = manuscript.reduce(
    (sum, chapter) => sum + countWords(chapter.expanded || chapter.draft),
    0,
  );

  const lines: string[] = [`# ${book.title}`, ""];
  if (book.subtitle) lines.push(`## ${book.subtitle}`, "");
  lines.push(
    `*${book.genre || "Ohne Genre"} · ${totalWords.toLocaleString("de-DE")} Wörter · ${manuscript.length} Kapitel*`,
    "",
  );
  if (book.synopsis) lines.push(`> ${book.synopsis}`, "");
  if (book.tags.length > 0) lines.push("`" + book.tags.join("` `") + "`", "");

  manuscript.forEach((chapter, index) => {
    lines.push("---", "", `## Kapitel ${index + 1}: ${chapter.title}`, "");
    const paragraphs = toParagraphs(chapter.expanded || chapter.draft);
    if (paragraphs.length === 0) {
      lines.push("_Noch kein Text._", "");
      return;
    }
    for (const paragraph of paragraphs) lines.push(paragraph, "");
  });

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}
