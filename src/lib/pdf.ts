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

function charWidth(char: string, size: number): number {
  if ("mwMW".includes(char)) return size * 0.85;
  if ("iltfj.,:;'!|".includes(char)) return size * 0.28;
  if (char === " ") return size * 0.28;
  return size * 0.52;
}

function textWidth(text: string, size: number): number {
  let width = 0;
  for (const char of text) width += charWidth(char, size);
  return width;
}

function wrap(text: string, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (textWidth(candidate, size) <= maxWidth || current === "") {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function escapePdfText(text: string): string {
  let out = "";
  for (const char of Array.from(text)) {
    const code = char.charCodeAt(0);
    const byte = code >= 32 && code <= 126 ? code : (WIN_ANSI[char] ?? 0x3f);
    if (byte === 0x28) out += "\\(";
    else if (byte === 0x29) out += "\\)";
    else if (byte === 0x5c) out += "\\\\";
    else if (byte < 32 || byte > 126) out += `\\${byte.toString(8).padStart(3, "0")}`;
    else out += String.fromCharCode(byte);
  }
  return out;
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
