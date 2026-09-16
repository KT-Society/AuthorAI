/**
 * Markdown-Import: macht aus einem vorhandenen Manuskript (Markdown) ein vollständiges Buch.
 *
 * Zwei Anforderungen bestimmen den Aufbau:
 *
 * 1. **Round-Trip zum eigenen Export.** `lib/markdown.ts` erzeugt eine klar erkennbare Form
 *    (`# Titel`, optional `## Untertitel`, `*Genre · n Wörter · n Kapitel*`, `> Synopsis`,
 *    `` `tag` ``, dann `---` + `## Kapitel n: Titel`). Diese Form wird zuerst und exakt erkannt —
 *    ein Autor kann also sein in AuthorAI exportiertes Manuskript verlustfrei wieder einlesen.
 * 2. **Fremde Manuskripte.** Unbekannte Struktur wird heuristisch gelesen: häufigste
 *    Überschriftsebene = Kapitel, Szenentrenner (`***`, `---`, `* * *`, `— — —`) = Szenen,
 *    YAML-Frontmatter oder die erste H1 = Titel. Was nicht erkannt wird, landet als ein Kapitel
 *    samt Hinweis in der Oberfläche — nichts geht verloren.
 *
 * Kein Markdown-Paket: Das Repo schreibt seine Format-Helfer selbst (siehe `lib/zip.ts`,
 * `lib/pdf.ts`), und ein Import braucht nur Überschriften, Trenner und Inline-Auszeichnung.
 */

import type { Book } from "@/data/author";
import { COVER_PALETTE, FALLBACK_COVER } from "@/data/cover";
import type { ChapterContent, ChapterPlan, Storyboard } from "@/data/story";
import {
  EXPAND_DEFAULT_WORDS,
  EXPAND_MAX_WORDS,
  EXPAND_MIN_WORDS,
  countWords,
} from "@/data/story";
import { slugify } from "@/lib/slug";

/** Ein aus dem Markdown gelesenes Kapitel. */
export interface ImportedChapter {
  title: string;
  /** Prosa mit `\n\n`-Absätzen (Inline-Auszeichnung entfernt). */
  text: string;
  /** Szenen-Beats aus Szenentrennern (`[]` = keine Trenner im Kapitel). */
  scenes: string[];
  words: number;
}

export interface ParsedManuscript {
  title: string;
  subtitle: string;
  genre: string;
  synopsis: string;
  tags: string[];
  chapters: ImportedChapter[];
  /** Was beim Lesen aufgefallen ist (für die Vorschau im Dialog). */
  warnings: string[];
}

export interface ImportParseOptions {
  /** Titel-Ersatz, wenn das Markdown keinen liefert (z. B. aus dem Dateinamen). */
  fallbackTitle?: string;
}

/* ─────────────────────────────── Aufräumen ─────────────────────────────── */

/** Zeilenenden vereinheitlichen, BOM weg, rechte Leerzeichen weg. */
function normalizeText(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n");
}

/** Inline-Auszeichnung entfernen — Prosa bleibt Prosa, Struktur nicht. */
function stripInline(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // Bilder
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // Links → Beschriftung
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1") // Inline-Code
    .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, "$1$2")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "") // HTML-Tags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/^>\s?/, "") // Zitat-Marker
    .replace(/[ \t]+$/, "");
}

/** Kapitelüberschrift auf den reinen Titel kürzen (Numerierung gehört zur Struktur). */
function cleanChapterTitle(raw: string, index: number): string {
  let title = stripInline(raw).trim();

  // Mehrfach putzen: „2. Kapitel: Das Ende" trägt zwei Präfixe hintereinander.
  for (let round = 0; round < 3; round += 1) {
    const before = title;
    title = title
      .replace(/^(kapitel|chapter|kap\.?|ch\.?)\s*\d+\s*[:.\-–—]?\s*/i, "")
      // „Kapitel: Titel" ohne Nummer — nur mit Trenner, sonst wäre „Kapitel der Asche" ein Titel.
      .replace(/^(kapitel|chapter|teil)\s*[:.\-–—]\s*/i, "")
      .replace(/^\d+\s*[:.)\-–—]\s+/, "")
      .trim();
    if (title === before) break;
  }

  return title || `Kapitel ${index + 1}`;
}

/** Kurzfassung eines Kapitels (erste Sätze) — Grundlage für Plan-Zusammenfassungen. */
function digest(text: string, max = 220): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return `${(lastStop > 60 ? cut.slice(0, lastStop + 1) : cut).trim()}…`;
}

/** Erster Satz — Grundlage für abgeleitete Szenen-Beats. */
function firstSentence(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length === 0) return "";
  const match = flat.match(/^[\s\S]*?[.!?…](?=\s|$)/);
  const sentence = (match?.[0] ?? flat).trim();
  return sentence.length > max ? `${sentence.slice(0, max).trim()}…` : sentence;
}

/* ─────────────────────────────── Erkennung ─────────────────────────────── */

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
/** Trennlinien: `---`, `- - -`, `***`, `* * *`, `___`, `— — —` (TXT-Export). */
const RULE = /^\s*(?:[-*_]\s*){3,}$|^\s*(?:—\s*){3,}$/;
/** Metazeile des eigenen Exports: `*Genre · 4.000 Wörter · 12 Kapitel*`. */
const META_LINE = /^\*([^*]+·[^*]+)\*$/;
/** Kapitelzeile ohne Markdown: `Kapitel 3: Der Sturm` (so sieht der TXT-Export aus). */
const PLAIN_CHAPTER = /^\s*(?:kapitel|chapter|kap\.?|ch\.?)\s+\d+\b.*$/i;

interface HeadingInfo {
  level: number;
  text: string;
  line: number;
}

interface FrontMatter {
  values: Record<string, string>;
  body: string;
  /** Zeilen, die das Frontmatter im Original belegt hat (für Zeilennummern im Body irrelevant). */
  had: boolean;
}

/**
 * YAML-Frontmatter (`---\ntitle: …\n---`) lesen — aber nur, wenn es wirklich eines ist:
 * Der Block muss von `---` begrenzt sein **und** mindestens eine `schlüssel: wert`-Zeile
 * enthalten. Sonst wäre ein Manuskript, das mit einer Szenen-Trennlinie beginnt, fälschlich
 * als Frontmatter gelesen.
 */
function splitFrontMatter(text: string): FrontMatter {
  const lines = text.split("\n");
  const first = lines.findIndex((line) => line.trim().length > 0);
  const values: Record<string, string> = {};
  if (first === -1 || lines[first]?.trim() !== "---") return { values, body: text, had: false };

  const limit = Math.min(lines.length, first + 41);
  let end = -1;
  for (let index = first + 1; index < limit; index += 1) {
    if (lines[index]?.trim() === "---") {
      end = index;
      break;
    }
  }
  if (end === -1) return { values, body: text, had: false };

  const block = lines.slice(first + 1, end);
  const pairs = block
    .map((line) => line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match));
  if (pairs.length === 0) return { values, body: text, had: false };

  for (const match of pairs) {
    const key = (match[1] ?? "").toLowerCase();
    const value = (match[2] ?? "")
      .trim()
      .replace(/^["']|["']$/g, "")
      // YAML-Listen (`tags: [Krieg, KI]`) auf den Inhalt reduzieren.
      .replace(/^\[|\]$/g, "")
      .trim();
    if (value) values[key] = value;
  }
  return { values, body: lines.slice(end + 1).join("\n"), had: true };
}

/** Häufigste Überschriftsebene; bei Gleichstand die tiefere (Kapitel liegen unter Teilen). */
function pickChapterLevel(headings: HeadingInfo[]): number {
  const counts = new Map<number, number>();
  for (const heading of headings) counts.set(heading.level, (counts.get(heading.level) ?? 0) + 1);

  let best = headings[0]?.level ?? 2;
  let bestCount = -1;
  for (const [level, count] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
    if (count >= bestCount) {
      best = level;
      bestCount = count;
    }
  }
  return best;
}

/* ─────────────────────────────── Parser ─────────────────────────────── */

export function parseManuscriptMarkdown(
  raw: string,
  options: ImportParseOptions = {},
): ParsedManuscript {
  const warnings: string[] = [];
  const source = normalizeText(raw);
  const front = splitFrontMatter(source);
  const lines = front.body.split("\n");

  const headings: HeadingInfo[] = [];
  lines.forEach((line, index) => {
    const match = line.match(HEADING);
    if (match?.[2]) headings.push({ level: match[1]?.length ?? 1, text: match[2], line: index });
  });

  const metaLineIndex = lines.findIndex((line) => META_LINE.test(line));
  const meta = metaLineIndex >= 0 ? (lines[metaLineIndex]?.match(META_LINE)?.[1] ?? "") : "";
  const metaGenre = metaLineIndex >= 0 ? (meta.split("·")[0] ?? "").trim() : "";

  /**
   * Kein Markdown im Dokument? Manche Manuskripte (und unser **TXT-Export**) numerieren
   * Kapitel als reine Zeile: `Kapitel 3: Der Sturm`. Erst ab **zwei** solchen Zeilen wird
   * geschnitten — sonst würde ein Prosasatz, der zufällig so beginnt, das Buch zerteilen.
   */
  const plainChapterLines =
    headings.length === 0
      ? lines.map((line, index) => ({ line, index })).filter((entry) => PLAIN_CHAPTER.test(entry.line))
      : [];
  const hasPlainChapters = plainChapterLines.length >= 2;
  if (hasPlainChapters) {
    plainChapterLines.forEach((entry) =>
      headings.push({ level: 1, text: entry.line.trim(), line: entry.index }),
    );
  }

  // ── Kapitel-Ebene und Titel ────────────────────────────────────────────────
  let chapterLevel: number;
  let titleFromHeading: string | null = null;

  if (headings.length === 0) {
    chapterLevel = 0; // kein Kapitel
  } else if (metaLineIndex >= 0) {
    // Eigener Export: Titel = erste H1, Kapitel = H2 **hinter** der Metazeile (davor steht
    // der Vorspann — auch der Untertitel ist dort eine H2).
    chapterLevel = 2;
    const first = headings[0];
    if (first && first.level === 1 && first.line < metaLineIndex) titleFromHeading = first.text;
  } else if (hasPlainChapters) {
    // TXT-Form: Titel ist die erste Zeile vor dem ersten Kapitel.
    chapterLevel = 1;
    const firstChapter = plainChapterLines[0]?.index ?? 0;
    const titleLine = lines
      .slice(0, firstChapter)
      .map((line) => stripInline(line).trim())
      .find((line) => line.length > 0);
    // Eine Ziffern-/„Kapitel“-Zeile wäre kein Titel.
    if (titleLine && !PLAIN_CHAPTER.test(titleLine)) titleFromHeading = titleLine;
  } else if (headings.length === 1) {
    // Eine einzige Überschrift = der Titel des Werks, der Text ist ein Kapitel.
    chapterLevel = 0;
    titleFromHeading = headings[0]?.text ?? null;
  } else {
    chapterLevel = pickChapterLevel(headings);
    const first = headings[0];
    // Eine Überschrift **über** der Kapitel-Ebene ist der Titel (z. B. `# Werk` + `## Kapitel`).
    if (first && first.level < chapterLevel) titleFromHeading = first.text;
  }

  // Kapitel sind nur Überschriften **hinter** dem Vorspann (beim eigenen Export: hinter der
  // Metazeile) — sonst würde der Untertitel zum ersten Kapitel.
  const frontEnd = metaLineIndex >= 0 ? metaLineIndex : -1;
  const chapterHeadings = headings.filter(
    (heading) => heading.level === chapterLevel && heading.line > frontEnd,
  );
  const title =
    front.values.title?.trim() ||
    titleFromHeading?.trim() ||
    options.fallbackTitle?.trim() ||
    "Ohne Titel";
  if (!front.values.title && !titleFromHeading && !options.fallbackTitle) {
    warnings.push("Kein Titel gefunden — bitte in der Vorschau setzen.");
  }

  // ── Vorspann: Untertitel, Genre, Synopsis, Tags ────────────────────────────
  const firstChapterLine = chapterHeadings[0]?.line ?? lines.length;
  const frontLines = lines.slice(0, firstChapterLine);
  const subtitleHeading = headings.find(
    (heading) =>
      heading.level > 1 && heading.line < firstChapterLine && heading.text.trim() !== title.trim(),
  );
  const synopsisLines = frontLines
    .filter((line) => /^\s*>\s?/.test(line))
    .map((line) => stripInline(line).trim())
    .filter(Boolean);
  const tags = frontLines
    .filter((line) => /^\s*`[^`]+`(\s*`[^`]+`)*\s*$/.test(line))
    .flatMap((line) => [...line.matchAll(/`([^`]+)`/g)].map((match) => (match[1] ?? "").trim()))
    .filter(Boolean);

  // ── Kapitel schneiden ──────────────────────────────────────────────────────
  const chapters: ImportedChapter[] = [];

  const pushChapter = (titleRaw: string, body: string[]) => {
    const index = chapters.length;
    const segments: string[][] = [[]];
    for (const line of body) {
      if (RULE.test(line)) {
        segments.push([]);
        continue;
      }
      const heading = line.match(HEADING);
      // Untergeordnete Überschrift: Marker weg, Text bleibt der Prosa erhalten.
      segments[segments.length - 1]?.push(heading ? (heading[2] ?? "") : stripInline(line));
    }

    const texts = segments
      .map((segment) =>
        segment
          .join("\n")
          .replace(/\n{3,}/g, "\n\n")
          .replace(/^\n+|\n+$/g, "")
          .trim(),
      )
      .filter((segment) => segment.length > 0);

    const prose = texts.join("\n\n");
    const scenes =
      texts.length > 1
        ? texts.map((segment) => firstSentence(segment)).filter((beat) => beat.length > 0)
        : [];

    chapters.push({
      title: cleanChapterTitle(titleRaw, index),
      text: prose,
      scenes,
      words: countWords(prose),
    });
  };

  if (chapterHeadings.length === 0) {
    // Kein Kapitel erkannt: alles als ein Kapitel — nichts verlieren.
    const body = lines.slice();
    if (metaLineIndex >= 0) body.splice(metaLineIndex, 1);
    pushChapter(title, body);
    if (lines.some((line) => line.trim().length > 0)) {
      warnings.push("Keine Kapitelüberschriften gefunden — der Text wurde ein Kapitel.");
    }
  } else {
    chapterHeadings.forEach((heading, position) => {
      const start = heading.line + 1;
      const end = chapterHeadings[position + 1]?.line ?? lines.length;
      // Die Metazeile des Exports ist Struktur, keine Prosa — per Index entfernen (nicht per
      // Wertsuche: gleiche Zeilen könnten mehrfach vorkommen).
      const body = lines
        .slice(start, end)
        .filter((_, offset) => start + offset !== metaLineIndex);
      pushChapter(heading.text, body);
    });
  }

  const empty = chapters.filter((chapter) => chapter.words === 0);
  if (empty.length > 0) {
    warnings.push(
      empty.length === 1
        ? `1 Kapitel ohne Text (${empty[0]?.title}).`
        : `${empty.length} Kapitel ohne Text.`,
    );
  }

  const frontTags = (front.values.tags ?? "")
    .split(/[,;]/)
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    title,
    subtitle: (front.values.subtitle?.trim() || subtitleHeading?.text?.trim() || "").trim(),
    genre: (front.values.genre?.trim() || metaGenre || "").trim(),
    synopsis: (front.values.synopsis?.trim() || synopsisLines.join(" ")).trim(),
    tags: frontTags.length > 0 ? frontTags : tags,
    chapters,
    warnings,
  };
}

/* ─────────────────────────── Buch bauen ─────────────────────────── */

export interface ImportBookOptions {
  /** Szenen aus Szenentrennern als Beats übernehmen (Standard: ja). */
  deriveScenes?: boolean;
  /** Index in der Cover-Palette (z. B. die Anzahl vorhandener Bücher). */
  paletteIndex?: number;
  /** Projekt-Vorgabe für Ziel-Wörter pro Kapitel. */
  defaultTargetWords?: number;
}

/** Ziel-Wörter eines importierten Kapitels: der echte Umfang, in die Pipeline-Grenzen geklemmt. */
function importedTargetWords(words: number): number {
  return Math.min(EXPAND_MAX_WORDS, Math.max(EXPAND_MIN_WORDS, words || EXPAND_MIN_WORDS));
}

/**
 * Baut aus dem gelesenen Manuskript ein **vollständiges** Buch: Manuskript, Storyboard
 * (Kapitelplan mit Kurzfassung + optional Szenen), Zählwerte und Ziel-Wörter.
 *
 * Der Text landet in **`draft`** („Rohentwurf"), nicht in `expanded`: Importierter Text ist
 * mitgebrachte Prosa, die den **Ausbau dieser App** noch nicht durchlaufen hat. Unabhängig davon,
 * wie lang ein Kapitel ist — die Wortzahl sagt nichts darüber, ob es hier ausgearbeitet wurde.
 * Wirkung: Das Kapitel steht in der Spalte „Rohentwurf", und der Weg über „Ausbau" bleibt offen,
 * statt ein Kapitel vorzeitig als fertig auszuweisen.
 *
 * Das ist überall unproblematisch, weil jeder Leser denselben Vorrang kennt
 * (`chapter.expanded || chapter.draft`): Exporte (EPUB, DOCX, PDF, Markdown), Pässe, Prüfungen,
 * Kanon-Ableitung und Zählwerte. Der Editor zeigt beide Kästen — der importierte Text steht im
 * Rohentwurf-Feld und ist dort editierbar.
 */
export function buildImportedBook(parsed: ParsedManuscript, options: ImportBookOptions = {}): Book {
  const deriveScenes = options.deriveScenes ?? true;
  const defaultTargetWords = options.defaultTargetWords ?? EXPAND_DEFAULT_WORDS;

  const plans: ChapterPlan[] = parsed.chapters.map((chapter, index) => ({
    index,
    title: chapter.title,
    summary: digest(chapter.text),
    pov: "",
    setting: "",
    beats: deriveScenes ? chapter.scenes : [],
    foreshadowing: [],
  }));

  const manuscript: ChapterContent[] = parsed.chapters.map((chapter, index) => ({
    index,
    title: chapter.title,
    draft: chapter.text,
    expanded: "",
    targetWords: importedTargetWords(chapter.words),
    characterIds: [],
    beatCharacters: plans[index]?.beats.map(() => []) ?? [],
  }));

  const storyboard: Storyboard = {
    title: parsed.title,
    subtitle: parsed.subtitle,
    genre: parsed.genre || "Roman",
    logline: "",
    synopsis: parsed.synopsis,
    themes: parsed.tags.slice(0, 5),
    tone: "",
    pov: "",
    characters: [],
    chapters: plans,
  };

  // Zählwerte und „hat Text" lesen denselben Vorrang wie Exporte und Pässe: expanded vor draft.
  const words = manuscript.reduce(
    (sum, chapter) => sum + countWords(chapter.expanded || chapter.draft),
    0,
  );
  const goalWords = manuscript.reduce(
    (sum, chapter) => sum + (chapter.targetWords ?? defaultTargetWords),
    0,
  );
  const chaptersDone = manuscript.filter(
    (chapter) => (chapter.expanded || chapter.draft).trim().length > 0,
  ).length;
  const palette =
    COVER_PALETTE[Math.abs(options.paletteIndex ?? 0) % COVER_PALETTE.length] ?? FALLBACK_COVER;

  return {
    id: `${slugify(parsed.title)}-${Date.now().toString(36)}`,
    title: parsed.title,
    subtitle: parsed.subtitle || "Roman",
    genre: storyboard.genre,
    status: chaptersDone === manuscript.length && manuscript.length > 0 ? "editing" : "draft",
    words,
    goalWords: goalWords || manuscript.length * defaultTargetWords,
    chapters: manuscript.length,
    chaptersDone,
    updatedAt: new Date().toISOString(),
    coverFrom: palette[0],
    coverTo: palette[1],
    tags: parsed.tags.slice(0, 5),
    synopsis: parsed.synopsis,
    defaultTargetWords,
    storyboard,
    manuscript,
  };
}

/** Bequemer Ein-Schritt-Weg für Aufrufer (Datei/Text → Buch). */
export function importMarkdownAsBook(
  raw: string,
  options: ImportBookOptions & ImportParseOptions = {},
): { book: Book; parsed: ParsedManuscript } {
  const parsed = parseManuscriptMarkdown(raw, { fallbackTitle: options.fallbackTitle });
  return { book: buildImportedBook(parsed, options), parsed };
}