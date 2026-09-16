import type { ChapterContent, Storyboard } from "./story";

export type BookStatus = "idea" | "draft" | "editing" | "published";

export interface Book {
  id: string;
  title: string;
  subtitle: string;
  genre: string;
  status: BookStatus;
  words: number;
  goalWords: number;
  chapters: number;
  chaptersDone: number;
  updatedAt: string;
  coverFrom: string;
  coverTo: string;
  tags: string[];
  synopsis: string;
  coverUrl?: string;
  /** Weitere Cover-Entwürfe zum Vergleichen (A/B-Auswahl). */
  coverVariants?: string[];
  /** Optionales Back-/Rückseiten-Cover. */
  coverBackUrl?: string;
  /** Persistierte Text-Layer (erneut editierbar statt nur eingebrannt). */
  coverLayers?: import("./cover").CoverTextLayer[];
  coverBackLayers?: import("./cover").CoverTextLayer[];
  /** Projekt-Vorgabe für Ziel-Wörter pro Kapitel (Kapitel können sie überschreiben). */
  defaultTargetWords?: number;
  /**
   * Das Storyboard dieses Buchs wurde **einmalig** in die Sammlungen gespiegelt (Figuren,
   * Weltenbau, Plot-Karten) — die Shell leitet daraus nur noch bei Büchern ohne diesen Merker ab.
   * Ohne ihn würde „Alle löschen" beim nächsten App-Start rückgängig gemacht.
   */
  storyboardImported?: boolean;
  storyboard?: Storyboard;
  manuscript?: ChapterContent[];
}

export interface ActivityItem {
  id: string;
  type: "chapter" | "edit" | "idea" | "research" | "publish" | "goal";
  text: string;
  timestamp: string;
  words?: number;
}

export interface Idea {
  id: string;
  text: string;
  tag: string;
}

export const STATUS_ORDER: BookStatus[] = ["idea", "draft", "editing", "published"];

export const STATUS_META: Record<
  BookStatus,
  { label: string; text: string; dot: string; chip: string }
> = {
  idea: {
    label: "Idee",
    text: "text-brand-amber",
    dot: "bg-brand-amber",
    chip: "border-brand-amber/30 bg-brand-amber/10 text-brand-amber",
  },
  draft: {
    label: "Entwurf",
    text: "text-brand-cyan",
    dot: "bg-brand-cyan",
    chip: "border-brand-cyan/30 bg-brand-cyan/10 text-brand-cyan",
  },
  editing: {
    label: "Lektorat",
    text: "text-brand-violet",
    dot: "bg-brand-violet",
    chip: "border-brand-violet/30 bg-brand-violet/10 text-brand-violet",
  },
  published: {
    label: "Veröffentlicht",
    text: "text-brand-emerald",
    dot: "bg-brand-emerald",
    chip: "border-brand-emerald/30 bg-brand-emerald/10 text-brand-emerald",
  },
};

const NOW = Date.now();
const hoursAgo = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();

export const BOOKS: Book[] = [
  {
    id: "aschenkoenigin",
    title: "Die Chronik der Aschenkönigin",
    subtitle: "Band I der Aschenthron-Saga",
    genre: "Dark Fantasy",
    status: "editing",
    words: 84_200,
    goalWords: 120_000,
    chapters: 32,
    chaptersDone: 24,
    updatedAt: hoursAgo(2),
    coverFrom: "hsl(258 90% 62%)",
    coverTo: "hsl(342 90% 58%)",
    tags: ["Episch", "Magie", "Intrigen"],
    coverUrl: "/covers/cover-mtwzhp7w-7dity5.png",
    synopsis:
      "Eine verbannte Königin kehrt zurück, um den Thron aus Asche zurückzuerobern — und muss erkennen, dass die Krone längst ihren eigenen Willen hat.",
  },
  {
    id: "neon-requiem",
    title: "Neon Requiem",
    subtitle: "Ein Cyberpunk-Thriller",
    genre: "Science-Fiction",
    status: "draft",
    words: 41_200,
    goalWords: 90_000,
    chapters: 18,
    chaptersDone: 9,
    updatedAt: hoursAgo(9),
    coverFrom: "hsl(186 100% 52%)",
    coverTo: "hsl(232 85% 60%)",
    tags: ["Cyberpunk", "Noir"],
    coverUrl: "/covers/cover-mtwzhtfg-amc3sd.png",
    synopsis:
      "Im Schatten von Neo-Kyoto jagt eine Söldnerin ihren eigenen gelöschten Speicher — und die Wahrheit, die jemand teuer bezahlt hat.",
  },
  {
    id: "sankt-kalt",
    title: "Das Labyrinth von Sankt Kalt",
    subtitle: "Psychothriller",
    genre: "Thriller",
    status: "draft",
    words: 12_400,
    goalWords: 80_000,
    chapters: 12,
    chaptersDone: 3,
    updatedAt: hoursAgo(28),
    coverFrom: "hsl(38 95% 58%)",
    coverTo: "hsl(342 90% 58%)",
    tags: ["Psycho", "Krimi"],
    coverUrl: "/covers/cover-mtwzhwl7-3wk5d2.png",
    synopsis:
      "Ein Dorf unter dem Eis, ein Pfarrer ohne Gedächtnis und eine Reihe von Geständnissen, die niemand geschrieben haben will.",
  },
  {
    id: "sternen-asche",
    title: "Sternenasche",
    subtitle: "Roman",
    genre: "Sci-Fi",
    status: "idea",
    words: 0,
    goalWords: 100_000,
    chapters: 0,
    chaptersDone: 0,
    updatedAt: hoursAgo(72),
    coverFrom: "hsl(232 85% 62%)",
    coverTo: "hsl(186 100% 50%)",
    tags: ["Space Opera"],
    coverUrl: "/covers/cover-mtwzi0hn-d2pd37.png",
    synopsis:
      "Nach dem Kollaps der Sonne sammelt eine Archäologin die letzten Geschichten der Menschheit in einem Schiff aus Sternenstaub.",
  },
  {
    id: "buchhaendler-lissabon",
    title: "Der letzte Buchhändler von Lissabon",
    subtitle: "Roman",
    genre: "Historisch",
    status: "published",
    words: 132_400,
    goalWords: 130_000,
    chapters: 41,
    chaptersDone: 41,
    updatedAt: hoursAgo(120),
    coverFrom: "hsl(158 84% 42%)",
    coverTo: "hsl(186 100% 50%)",
    tags: ["Historisch", "Liebe"],
    coverUrl: "/covers/cover-mtwzi373-13gufc.png",
    synopsis:
      "1943: Ein Buchhändler versteckt in seinen Regalen weit mehr als Bücher — und eine Liebe, die den Krieg überdauern soll.",
  },
  {
    id: "kraehenmaedchen",
    title: "Krähenmädchen",
    subtitle: "Kriminalroman",
    genre: "Mystery",
    status: "editing",
    words: 67_800,
    goalWords: 75_000,
    chapters: 26,
    chaptersDone: 22,
    updatedAt: hoursAgo(50),
    coverFrom: "hsl(258 80% 58%)",
    coverTo: "hsl(232 80% 52%)",
    tags: ["Mystery", "Kleinstadt"],
    coverUrl: "/covers/cover-mtwzi6qp-bqvik7.png",
    synopsis:
      "Als in einem Dorf die erste Krähe fällt, beginnt eine Ermittlerin zu verstehen, dass jeder hier ein Motiv hat — auch sie.",
  },
];

export const ACTIVITY: ActivityItem[] = [
  {
    id: "a1",
    type: "chapter",
    text: "Kapitel 24 in „Die Chronik der Aschenkönigin“ fertiggestellt",
    timestamp: hoursAgo(2),
    words: 1_840,
  },
  {
    id: "a2",
    type: "edit",
    text: "Lektorat: Kapitel 22–23 in „Krähenmädchen“ überarbeitet",
    timestamp: hoursAgo(6),
  },
  {
    id: "a3",
    type: "chapter",
    text: "Kapitel 9 in „Neon Requiem“ entworfen",
    timestamp: hoursAgo(9),
    words: 1_260,
  },
  {
    id: "a4",
    type: "idea",
    text: "Neue Plot-Idee im Plot-Board gespeichert",
    timestamp: hoursAgo(20),
  },
  {
    id: "a5",
    type: "goal",
    text: "Tagesziel erreicht — 1.500 Wörter",
    timestamp: hoursAgo(26),
  },
  {
    id: "a6",
    type: "research",
    text: "Recherche: mittelalterliche Belagerungstechnik",
    timestamp: hoursAgo(30),
  },
  {
    id: "a7",
    type: "publish",
    text: "„Der letzte Buchhändler von Lissabon“ veröffentlicht",
    timestamp: hoursAgo(120),
  },
];

export const IDEAS: Idea[] = [
  { id: "i1", text: "Was, wenn die Krone selbst erwacht und ihren Träger wählt?", tag: "Aschenkönigin" },
  { id: "i2", text: "Der Detektiv ist der Täter — hat es aber selbst vergessen.", tag: "Krähenmädchen" },
  { id: "i3", text: "Lissabon 1943: Ein Buchladen als Zentrale eines Spionagenetzes.", tag: "Historisch" },
  { id: "i4", text: "Eine KI schreibt Romane und verliebt sich in ihre eigene Figur.", tag: "Sternenasche" },
];

/** Words written per day for the current week (Mo–So). */
export const WEEKLY_WORDS = [820, 1_450, 980, 1_720, 0, 1_650, 1_120];

export const DAILY_GOAL = 1_500;

export function progressOf(book: Book): number {
  if (book.goalWords <= 0) return 0;
  return Math.min(100, Math.round((book.words / book.goalWords) * 100));
}

const numberFormat = new Intl.NumberFormat("de-DE");
const compactFormat = new Intl.NumberFormat("de-DE", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function formatCompact(value: number): string {
  if (value < 1_000) return String(value);
  return compactFormat.format(value);
}

export function formatPercent(value: number): string {
  return `${Math.round(value)} %`;
}

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "gestern";
  if (days < 7) return `vor ${days} Tagen`;

  return new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short" }).format(
    new Date(iso),
  );
}

export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return "Gute Nacht";
  if (hour < 11) return "Guten Morgen";
  if (hour < 17) return "Guten Tag";
  if (hour < 22) return "Guten Abend";
  return "Gute Nacht";
}

/** Per-profile dashboard metrics (start empty; fill from real usage). */
export interface DashboardMeta {
  version: number;
  streakCurrent: number;
  streakBest: number;
  weeklyWords: number[];
  todayWords: number;
  goal: number;
  /** ISO dates (YYYY-MM-DD) on which something was written. */
  writingDays: string[];
  /** ISO date of the Monday that `weeklyWords` belongs to. */
  weekStart: string;
  /** ISO date that `todayWords` belongs to. */
  todayDate: string;
}

export const META_VERSION = 3;

export const DEFAULT_META: DashboardMeta = {
  version: META_VERSION,
  streakCurrent: 0,
  streakBest: 0,
  weeklyWords: WEEKLY_WORDS.map(() => 0),
  todayWords: 0,
  goal: DAILY_GOAL,
  writingDays: [],
  weekStart: "",
  todayDate: "",
};

export const EMPTY_META: DashboardMeta = { ...DEFAULT_META };
