export interface StoryCharacter {
  name: string;
  role: string;
  description: string;
}

export interface WorldItem {
  name: string;
  description: string;
}

export interface StoryWorld {
  locations: WorldItem[];
  factions: WorldItem[];
  magic: WorldItem[];
  artifacts: WorldItem[];
  lore: WorldItem[];
}

export const EMPTY_WORLD: StoryWorld = {
  locations: [],
  factions: [],
  magic: [],
  artifacts: [],
  lore: [],
};

export interface ChapterPlan {
  index: number;
  title: string;
  summary: string;
  pov: string;
  setting: string;
  beats: string[];
  foreshadowing: string[];
}

export interface Storyboard {
  title: string;
  subtitle: string;
  genre: string;
  logline: string;
  synopsis: string;
  themes: string[];
  tone: string;
  pov: string;
  characters: StoryCharacter[];
  world?: StoryWorld;
  chapters: ChapterPlan[];
}

export interface ChapterContent {
  index: number;
  title: string;
  draft: string;
  expanded: string;
  /** Per-chapter word target for the expansion pass. */
  targetWords?: number;
  /** Characters that appear in this chapter. */
  characterIds?: string[];
  /** Characters attached to each beat (parallel to the storyboard chapter's beats). */
  beatCharacters?: string[][];
  /** Report from the coherence/logic pass (newline-separated bullet points). */
  consistencyNotes?: string;
  /** Whether the coherence/logic pass has run (independent of whether it found issues). */
  consistencyChecked?: boolean;
  /** Report from the style/language pass (newline-separated bullet points). */
  styleNotes?: string;
  /** Whether the style/language pass has run. */
  styleChecked?: boolean;
}

export type WizardStep = "idea" | "storyboard" | "draft" | "expand" | "consistency" | "style";

export const DRAFT_TARGET_WORDS = 500;
export const EXPAND_MIN_WORDS = 3000;
export const EXPAND_MAX_WORDS = 5000;
export const EXPAND_DEFAULT_WORDS = 4000;
export const MIN_CHAPTERS = 5;
export const MAX_CHAPTERS = 55;

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

export function manuscriptWordCount(manuscript: ChapterContent[]): number {
  return manuscript.reduce(
    (sum, chapter) => sum + countWords(chapter.expanded || chapter.draft),
    0,
  );
}

export function chapterTargetWords(chapter: ChapterContent): number {
  return chapter.targetWords && chapter.targetWords > 0
    ? chapter.targetWords
    : EXPAND_DEFAULT_WORDS;
}

/** Splits prose into paragraphs (blank-line first, then single newlines). */
export function toParagraphs(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  return trimmed
    .split(/\n\s*\n/)
    .flatMap((block) => block.split(/\n/))
    .map((line) => line.trim())
    .filter(Boolean);
}
