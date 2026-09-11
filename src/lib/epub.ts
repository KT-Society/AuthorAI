/**
 * EPUB-Erzeugung (EPUB 3) im Browser — ohne externe Abhängigkeiten.
 *
 * Enthält Cover (falls vorhanden), Titelblatt, Kapitel, CSS, Navigation
 * (nav.xhtml) und eine toc.ncx für ältere Lesegeräte.
 */

import type { Book } from "@/data/author";
import { countWords, toParagraphs } from "@/data/story";

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

function xhtml(title: string, language: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${language}" lang="${language}">
  <head>
    <meta charset="utf-8"/>
    <title>${escapeXml(title)}</title>
    <link rel="stylesheet" type="text/css" href="styles.css"/>
  </head>
  <body>
${body}
  </body>
</html>`;
}

const STYLES = `body { font-family: Georgia, "Times New Roman", serif; line-height: 1.6; margin: 0 5%; }
h1 { font-size: 1.8em; text-align: center; margin: 2em 0 0.5em; }
h2 { font-size: 1.3em; margin: 2.5em 0 1em; }
p { margin: 0 0 1em; text-align: justify; }
.subtitle { text-align: center; font-style: italic; margin-bottom: 1em; }
.meta { text-align: center; font-size: 0.9em; margin-bottom: 3em; }
.cover { text-align: center; margin: 0; padding: 0; }
.cover img { max-width: 100%; max-height: 100%; }
blockquote { margin: 1em 2em; font-style: italic; }`;

export interface EpubOptions {
  author: string;
  language: string;
  /** Welches Cover eingebunden wird (Standard: Front, falls vorhanden). */
  cover?: "front" | "back" | "none";
}

export async function buildEpub(book: Book, options: EpubOptions): Promise<Blob> {
  const encoder = new TextEncoder();
  const language = options.language || "German";
  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const identifier = `urn:uuid:${crypto.randomUUID()}`;
  const manuscript = manuscriptOf(book);
  const totalWords = manuscript.reduce(
    (sum, chapter) => sum + countWords(chapter.expanded || chapter.draft),
    0,
  );

  const entries: ZipEntry[] = [
    // Muss der ERSTE Eintrag und unkomprimiert sein → createStoredZip nutzt „store".
    { path: "mimetype", data: encoder.encode("application/epub+zip") },
    {
      path: "META-INF/container.xml",
      data: encoder.encode(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`),
    },
    { path: "OEBPS/styles.css", data: encoder.encode(STYLES) },
  ];

  /* Titelblatt */
  entries.push({
    path: "OEBPS/title.xhtml",
    data: encoder.encode(
      xhtml(
        book.title,
        language,
        `    <h1>${escapeXml(book.title)}</h1>
    ${book.subtitle ? `<p class="subtitle">${escapeXml(book.subtitle)}</p>` : ""}
    <p class="meta">${escapeXml(options.author)} · ${escapeXml(book.genre)} · ${totalWords.toLocaleString("de-DE")} Wörter</p>
    ${book.synopsis ? `<blockquote>${escapeXml(book.synopsis)}</blockquote>` : ""}`,
      ),
    ),
  });

  /* Cover (optional) */
  let coverManifest = "";
  let coverSpine = "";
  let coverLegacyMeta = "";
  const coverSource =
    options.cover === "none"
      ? undefined
      : options.cover === "back"
        ? book.coverBackUrl
        : book.coverUrl;

  if (coverSource) {
    try {
      const response = await fetch(coverSource);
      if (response.ok) {
        entries.push({
          path: "OEBPS/images/cover.png",
          data: new Uint8Array(await response.arrayBuffer()),
        });
        entries.push({
          path: "OEBPS/cover.xhtml",
          data: encoder.encode(
            xhtml(
              "Cover",
              language,
              `    <div class="cover"><img src="images/cover.png" alt="${escapeXml(book.title)}"/></div>`,
            ),
          ),
        });
        coverManifest =
          '    <item id="cover-image" href="images/cover.png" media-type="image/png" properties="cover-image"/>\n' +
          '    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>\n';
        coverSpine = '    <itemref idref="cover"/>\n';
        coverLegacyMeta = '    <meta name="cover" content="cover-image"/>\n';
      }
    } catch {
      // Cover ist optional — ohne weiter
    }
  }

  /* Kapitel */
  const chapterManifest: string[] = [];
  const chapterSpine: string[] = [];
  const chapterNav: string[] = [];
  const chapterNavPoints: string[] = [];

  manuscript.forEach((chapter, index) => {
    const file = `chapter-${index + 1}.xhtml`;
    const title = `Kapitel ${index + 1}${chapter.title ? `: ${chapter.title}` : ""}`;
    const paragraphs = toParagraphs(chapter.expanded || chapter.draft);
    const body =
      `    <h2>${escapeXml(title)}</h2>\n` +
      (paragraphs.length > 0
        ? paragraphs.map((paragraph) => `    <p>${escapeXml(paragraph)}</p>`).join("\n")
        : "    <p><em>Dieses Kapitel ist noch leer.</em></p>");

    entries.push({
      path: `OEBPS/${file}`,
      data: encoder.encode(xhtml(chapter.title || title, language, body)),
    });

    chapterManifest.push(
      `    <item id="chapter-${index + 1}" href="${file}" media-type="application/xhtml+xml"/>`,
    );
    chapterSpine.push(`    <itemref idref="chapter-${index + 1}"/>`);
    chapterNav.push(`      <li><a href="${file}">${escapeXml(title)}</a></li>`);
    chapterNavPoints.push(
      `    <navPoint id="np-${index + 1}" playOrder="${index + 2}"><navLabel><text>${escapeXml(title)}</text></navLabel><content src="${file}"/></navPoint>`,
    );
  });

  /* Navigation (EPUB 3) */
  entries.push({
    path: "OEBPS/nav.xhtml",
    data: encoder.encode(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${language}" lang="${language}">
  <head><meta charset="utf-8"/><title>Inhalt</title></head>
  <body>
    <nav epub:type="toc" id="toc">
      <h2>Inhalt</h2>
      <ol>
        <li><a href="title.xhtml">${escapeXml(book.title)}</a></li>
${chapterNav.join("\n")}
      </ol>
    </nav>
  </body>
</html>`),
  });

  /* toc.ncx (EPUB 2) */
  entries.push({
    path: "OEBPS/toc.ncx",
    data: encoder.encode(`<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="${language}">
  <head><meta name="dtb:uid" content="${escapeXml(identifier)}"/></head>
  <docTitle><text>${escapeXml(book.title)}</text></docTitle>
  <navMap>
    <navPoint id="np-title" playOrder="1"><navLabel><text>${escapeXml(book.title)}</text></navLabel><content src="title.xhtml"/></navPoint>
${chapterNavPoints.join("\n")}
  </navMap>
</ncx>`),
  });

  /* Paket */
  entries.push({
    path: "OEBPS/content.opf",
    data: encoder.encode(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${language}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${escapeXml(identifier)}</dc:identifier>
    <dc:title>${escapeXml(book.title)}</dc:title>
    <dc:language>${escapeXml(language)}</dc:language>
    <dc:creator>${escapeXml(options.author)}</dc:creator>
    ${book.genre ? `<dc:subject>${escapeXml(book.genre)}</dc:subject>` : ""}
    ${book.synopsis ? `<dc:description>${escapeXml(book.synopsis)}</dc:description>` : ""}
    <meta property="dcterms:modified">${modified}</meta>
${coverLegacyMeta}  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="styles.css" media-type="text/css"/>
    <item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
${coverManifest}${chapterManifest.join("\n")}
  </manifest>
  <spine toc="ncx">
${coverSpine}    <itemref idref="title"/>
${chapterSpine.join("\n")}
  </spine>
</package>`),
  });

  return createStoredZip(entries);
}
