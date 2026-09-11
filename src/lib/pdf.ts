/**
 * Minimaler PDF-Writer (PDF 1.4) im Browser — ohne externe Abhängigkeiten.
 *
 * Erzeugt ein textbasiertes PDF (Helvetica, WinAnsi) mit Titelblatt,
 * Kapitelüberschriften (Seitenumbruch) und umbrochenen Absätzen.
 */

import type { Book } from "@/data/author";
import { toParagraphs } from "@/data/story";

import { manuscriptOf } from "./bookManuscript";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 56;
const BODY_SIZE = 11;
const LINE_HEIGHT = 15.5;
const HEADING_SIZE = 18;
const TITLE_SIZE = 26;

const WIN_ANSI: Record<string, number> = {
  ä: 0xe4, ö: 0xf6, ü: 0xfc, Ä: 0xc4, Ö: 0xd6, Ü: 0xdc, ß: 0xdf, "€": 0x80,
  "„": 0x84, "“": 0x93, "”": 0x94, "‚": 0x82, "‘": 0x91, "–": 0x96, "—": 0x97,
  "…": 0x85, "·": 0xb7, "«": 0xab, "»": 0xbb, "°": 0xb0, "’": 0x92, "†": 0x86,
};

/**
 * Breitenklassen als Lookup-Tabelle: 0 = normal (0.52), 1 = breit (0.85), 2 = schmal (0.28).
 * Vorher lief pro Zeichen eine `String.includes`-Suche — bei ~1 MB Prosa der Flaschenhals.
 */
const WIDTH_CLASS = new Uint8Array(128);
for (const char of "mwMW") WIDTH_CLASS[char.charCodeAt(0)] = 1;
for (const char of "iltfj.,:;'!|") WIDTH_CLASS[char.charCodeAt(0)] = 2;
WIDTH_CLASS[0x20] = 2; // Leerzeichen

const WIDE_FACTOR = 0.85;
const NARROW_FACTOR = 0.28;
const NORMAL_FACTOR = 0.52;

function charWidth(char: string, size: number): number {
  const code = char.charCodeAt(0);
  const cls = code < 128 ? (WIDTH_CLASS[code] ?? 0) : 0;
  if (cls === 1) return size * WIDE_FACTOR;
  if (cls === 2) return size * NARROW_FACTOR;
  return size * NORMAL_FACTOR;
}

function textWidth(text: string, size: number): number {
  const wide = size * WIDE_FACTOR;
  const narrow = size * NARROW_FACTOR;
  const normal = size * NORMAL_FACTOR;
  let width = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    const cls = code < 128 ? (WIDTH_CLASS[code] ?? 0) : 0;
    width += cls === 1 ? wide : cls === 2 ? narrow : normal;
  }
  return width;
}

function wrap(text: string, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  const spaceWidth = charWidth(" ", size);
  let current = "";
  let currentWidth = 0;

  for (const word of words) {
    const wordWidth = textWidth(word, size);
    if (current === "") {
      current = word;
      currentWidth = wordWidth;
      continue;
    }
    // Breite inkrementell statt den ganzen Kandidaten neu zu messen (vorher O(n²)).
    if (currentWidth + spaceWidth + wordWidth <= maxWidth) {
      current += ` ${word}`;
      currentWidth += spaceWidth + wordWidth;
    } else {
      lines.push(current);
      current = word;
      currentWidth = wordWidth;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function escapePdfText(text: string): string {
  // Index-Schleife statt Array.from(text): keine 1-Char-Array-Allokation pro Zeile.
  const parts: string[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 32 && code <= 126) {
      const char = text[index];
      if (char === "(") parts.push("\\(");
      else if (char === ")") parts.push("\\)");
      else if (char === "\\") parts.push("\\\\");
      else parts.push(char ?? "");
      continue;
    }
    const byte = WIN_ANSI[text[index] ?? ""] ?? 0x3f;
    // Surrogatpaare (Emoji & Co.) als EIN unbekanntes Zeichen ausgeben.
    if (byte === 0x3f && code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) index += 1;
    }
    parts.push(`\\${byte.toString(8).padStart(3, "0")}`);
  }
  return parts.join("");
}

interface Block {
  text: string;
  size: number;
  bold?: boolean;
  align?: "left" | "center";
  spaceAfter?: number;
  pageBreakBefore?: boolean;
}

export interface PdfOptions {
  author: string;
}

export function buildPdf(book: Book, options: PdfOptions): Blob {
  const blocks: Block[] = [
    { text: book.title, size: TITLE_SIZE, bold: true, align: "center", spaceAfter: 14 },
  ];
  if (book.subtitle) {
    blocks.push({ text: book.subtitle, size: 14, align: "center", spaceAfter: 8 });
  }
  blocks.push({
    text: `${options.author} · ${book.genre || "Ohne Genre"}`,
    size: 11,
    align: "center",
    spaceAfter: 24,
  });
  if (book.synopsis) {
    blocks.push({ text: book.synopsis, size: 11, spaceAfter: 24 });
  }

  const manuscript = manuscriptOf(book);
  manuscript.forEach((chapter, index) => {
    blocks.push({
      text: `Kapitel ${index + 1}${chapter.title ? `: ${chapter.title}` : ""}`,
      size: HEADING_SIZE,
      bold: true,
      spaceAfter: 14,
      pageBreakBefore: index > 0,
    });
    const paragraphs = toParagraphs(chapter.expanded || chapter.draft);
    if (paragraphs.length === 0) {
      blocks.push({ text: "Dieses Kapitel ist noch leer.", size: BODY_SIZE, spaceAfter: 12 });
      return;
    }
    for (const paragraph of paragraphs) {
      blocks.push({ text: paragraph, size: BODY_SIZE, spaceAfter: 10 });
    }
  });

  /* Layout in Seiten umbrechen */
  const maxWidth = PAGE_WIDTH - MARGIN * 2;
  const pages: string[] = [];
  let content = "";
  let cursorY = PAGE_HEIGHT - MARGIN;

  const newPage = () => {
    pages.push(content);
    content = "";
    cursorY = PAGE_HEIGHT - MARGIN;
  };

  for (const block of blocks) {
    if (block.pageBreakBefore && content) newPage();
    const lines = wrap(block.text, block.size, maxWidth);
    for (const line of lines) {
      if (cursorY < MARGIN + LINE_HEIGHT) newPage();
      const font = block.bold ? "F2" : "F1";
      const width = textWidth(line, block.size);
      const x = block.align === "center" ? Math.max(MARGIN, (PAGE_WIDTH - width) / 2) : MARGIN;
      content += `BT /${font} ${block.size} Tf 1 0 0 1 ${x.toFixed(2)} ${cursorY.toFixed(2)} Tm (${escapePdfText(line)}) Tj ET\n`;
      cursorY -= LINE_HEIGHT * (block.size / BODY_SIZE);
    }
    cursorY -= block.spaceAfter ?? 0;
  }
  pages.push(content);

  /* PDF-Objekte zusammensetzen */
  const chunks: string[] = [];
  let length = 0;
  const offsets: number[] = [];

  const push = (text: string) => {
    chunks.push(text);
    length += text.length;
  };
  const startObject = (index: number) => {
    offsets[index] = length;
    push(`${index} 0 obj\n`);
  };

  const pageObjectStart = 5;
  const pageObjects: number[] = [];
  let objectIndex = pageObjectStart;

  const contentObjectIds: number[] = [];
  const pageIds: number[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    contentObjectIds.push(objectIndex);
    pageIds.push(objectIndex + 1);
    objectIndex += 2;
  }

  push("%PDF-1.4\n");

  startObject(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  startObject(2);
  push(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>\nendobj\n`,
  );

  startObject(3);
  push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n");

  startObject(4);
  push(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n",
  );

  pages.forEach((pageContent, index) => {
    const contentId = contentObjectIds[index] ?? 0;
    const pageId = pageIds[index] ?? 0;

    startObject(contentId);
    push(`<< /Length ${pageContent.length} >>\nstream\n`);
    push(pageContent);
    push("endstream\nendobj\n");

    startObject(pageId);
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
    );
  });

  const xrefOffset = length;
  const totalObjects = 4 + pages.length * 2 + 1;
  push(`xref\n0 ${totalObjects}\n`);
  push("0000000000 65535 f \n");
  for (let index = 1; index < totalObjects; index += 1) {
    const offset = offsets[index] ?? 0;
    push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${totalObjects} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const bytes = new Uint8Array(length);
  let cursor = 0;
  for (const chunk of chunks) {
    for (let index = 0; index < chunk.length; index += 1) {
      bytes[cursor + index] = chunk.charCodeAt(index) & 0xff;
    }
    cursor += chunk.length;
  }

  return new Blob([bytes], { type: "application/pdf" });
}
