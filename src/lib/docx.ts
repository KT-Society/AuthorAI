/**
 * DOCX-Export (Office Open XML) im Browser — ohne externe Abhängigkeiten.
 *
 * Erzeugt ein von Word/LibreOffice lesbares Dokument mit Titelblatt,
 * Kapitelüberschriften (inkl. Seitenumbruch) und Absätzen.
 */

import type { Book } from "@/data/author";
import { toParagraphs } from "@/data/story";

import { manuscriptOf } from "./bookManuscript";
import { createStoredZip } from "./zip";
import type { ZipEntry } from "./zip";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function paragraph(text: string, options: { style?: string; pageBreakBefore?: boolean } = {}): string {
  const properties = [
    options.style ? `<w:pStyle w:val="${options.style}"/>` : "",
    options.pageBreakBefore ? "<w:pageBreakBefore/>" : "",
  ]
    .filter(Boolean)
    .join("");

  return `    <w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ""}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

export interface DocxOptions {
  author: string;
}

export function buildDocx(book: Book, options: DocxOptions): Blob {
  const encoder = new TextEncoder();
  const manuscript = manuscriptOf(book);

  const blocks: string[] = [];
  blocks.push(paragraph(book.title, { style: "Title" }));
  if (book.subtitle) blocks.push(paragraph(book.subtitle, { style: "Subtitle" }));
  blocks.push(
    paragraph(`${options.author} · ${book.genre || "Ohne Genre"}`, { style: "Subtitle" }),
  );
  if (book.synopsis) blocks.push(paragraph(book.synopsis, { style: "Quote" }));

  manuscript.forEach((chapter, index) => {
    const title = `Kapitel ${index + 1}${chapter.title ? `: ${chapter.title}` : ""}`;
    blocks.push(paragraph(title, { style: "Heading1", pageBreakBefore: index > 0 }));
    const paragraphs = toParagraphs(chapter.expanded || chapter.draft);
    if (paragraphs.length === 0) {
      blocks.push(paragraph("Dieses Kapitel ist noch leer.", { style: "Quote" }));
    } else {
      for (const text of paragraphs) blocks.push(paragraph(text));
    }
  });

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
${blocks.join("\n")}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418"/></w:sectPr>
  </w:body>
</w:document>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="56"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="120"/></w:pPr><w:rPr><w:i/><w:color w:val="555555"/><w:sz w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:spacing w:before="360" w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:pPr><w:ind w:left="720"/></w:pPr><w:rPr><w:i/><w:color w:val="444444"/></w:rPr></w:style>
</w:styles>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const entries: ZipEntry[] = [
    { path: "[Content_Types].xml", data: encoder.encode(contentTypes) },
    { path: "_rels/.rels", data: encoder.encode(rootRels) },
    { path: "word/document.xml", data: encoder.encode(document) },
    { path: "word/styles.xml", data: encoder.encode(styles) },
    { path: "word/_rels/document.xml.rels", data: encoder.encode(documentRels) },
  ];

  const blob = createStoredZip(entries);
  return blob.slice(0, blob.size, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}
