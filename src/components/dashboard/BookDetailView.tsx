import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUp,
  BookOpen,
  BookText,
  Copy,
  Download,
  FileText,
  GripVertical,
  Hourglass,
  Image as ImageIcon,
  Layers,
  ListTree,
  Loader2,
  Pencil,
  Plus,
  Printer,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Save,
  Trash2,
  Type,
  Users,
  Wand2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { Book } from "@/data/author";
import { STATUS_META, progressOf, timeAgo } from "@/data/author";
import type { Character } from "@/data/characters";
import {
  canonBlock,
  factsForBook,
  relationsForBook,
} from "@/data/continuity";
import type { CanonFact, CharacterRelation } from "@/data/continuity";
import type { WorldEntry } from "@/data/world";
import type { Series } from "@/data/series";
import { canonVolumeIds, seriesOfBook, volumeLabel } from "@/data/series";
import {
  EXPAND_DEFAULT_WORDS,
  EXPAND_MAX_WORDS,
  EXPAND_MIN_WORDS,
  chapterTargetWords,
  countWords,
  manuscriptWordCount,
  sceneConstraints,
  toParagraphs,
} from "@/data/story";
import type {
  ChapterContent,
  ChapterPlan,
  ChapterVersion,
  SceneConstraint,
  SceneMeta,
} from "@/data/story";
import { MODEL_STAGE_LABELS, readCanonWarn, readLanguage, readStageModel, readStyleProfileHint } from "@/lib/generationSettings";
import { manuscriptOf } from "@/lib/bookManuscript";
import { copyText } from "@/lib/clipboard";
import { looksTruncated } from "@/lib/prose";
import { characterNamesMatch, findMatchingCharacter } from "@/lib/characterMatch";
import { textHash } from "@/lib/textHash";
import { createJob, createJobStreamReporter, finishJob, isCancelled, updateJob } from "@/lib/jobs";
import { streamJson } from "@/services/stream";
import { showToast } from "@/lib/toast";
import { buildDocx } from "@/lib/docx";
import { buildEpub } from "@/lib/epub";
import { buildMarkdown } from "@/lib/markdown";
import { buildPdf } from "@/lib/pdf";
import { buildCoverPrompt, deleteCover, generateCover } from "@/services/cover";
import {
  streamDeriveScenes,
  streamDeriveStoryboard,
  streamPass,
  streamTimelineCheck,
  streamTimelineRepair,
} from "@/services/story";
import type {
  DerivedScene,
  PassResult,
  TimelineFinding,
  TimelineRepairFix,
  TimelineResult,
} from "@/services/story";
import { checkCanon, streamCanonCheck, streamCanonRepair } from "@/services/continuity";
import type {
  CanonCheckResult,
  CanonRepairResultEvent,
  CanonStreamHandlers,
  CanonViolation,
} from "@/services/continuity";

import { SCENE_TEMPLATES } from "@/data/sceneTemplates";
import type { CoverTextLayer, SavedCoverPreset } from "@/data/cover";

import { CoverEditorDialog } from "./CoverEditorDialog";
import type { CoverTarget } from "./CoverEditorDialog";
import { CoverVariantsDialog } from "./CoverVariantsDialog";
import { CanonCheckDialog } from "./CanonCheckDialog";
import type {
  CanonFactOption,
  CanonScopeOption,
  CanonScopeSelection,
} from "./CanonCheckDialog";
import type { CanonRepairChange } from "./CanonRepairPreviewDialog";
import { BookWizard } from "./BookWizard";
import { VersionDiffDialog } from "./VersionDiffDialog";
import { DerivePreviewDialog } from "./DerivePreviewDialog";
import type { DeriveMode, DerivePreview } from "./DerivePreviewDialog";
import { SeriesDialog } from "./SeriesDialog";
import { TimelineDialog } from "./TimelineDialog";
import type { TimelineEntry } from "./TimelineDialog";
import type { TimelineRepairChange, TimelineSceneChange } from "./TimelineRepairPreviewDialog";
import { Panel, ProgressBar } from "./primitives";
import { StreamPreview } from "./StreamPreview";

type Mode = "edit" | "read";

function chapterStatus(chapter: ChapterContent): { label: string; className: string } {
  if (chapter.expanded.trim().length > 0) {
    return {
      label: "Ausgebaut",
      className: "border-brand-emerald/30 bg-brand-emerald/10 text-brand-emerald",
    };
  }
  if (chapter.draft.trim().length > 0) {
    return {
      label: "Rohentwurf",
      className: "border-brand-cyan/30 bg-brand-cyan/10 text-brand-cyan",
    };
  }
  return {
    label: "Leer",
    className: "border-brand-amber/30 bg-brand-amber/10 text-brand-amber",
  };
}

/**
 * Grenzen der Versionshistorie.
 *
 * Gemessen: 13 Kapitel × 8.000 Wörter mit **fünf** Volltext-Versionen je Kapitel sind ~8,8 MB —
 * allein ein Buch sprengt damit das ~5-MB-Limit von `localStorage`. Dann schlägt das Speichern
 * fehl und Änderungen sind nach einem Reload weg (siehe `lib/persistence.ts`). Deshalb ist die
 * Historie je Buch **budgetiert**: höchstens 5 Einträge je Kapitel **und** ~1,2 MB je Buch,
 * wobei zuerst die ältesten Versionen fallen.
 */
const HISTORY_MAX_ENTRIES = 5;
const HISTORY_MAX_CHARS = 600_000;

/** Kürzt die Historie eines Buchs auf das Zeichen-Budget (älteste Versionen zuerst). */
function trimHistoryToBudget(chapters: ChapterContent[]): ChapterContent[] {
  const total = () =>
    chapters.reduce(
      (sum, chapter) =>
        sum + (chapter.history ?? []).reduce((inner, version) => inner + version.expanded.length, 0),
      0,
    );
  if (total() <= HISTORY_MAX_CHARS) return chapters;

  let next = chapters.map((chapter) => ({ ...chapter, history: [...(chapter.history ?? [])] }));
  while (total() > HISTORY_MAX_CHARS) {
    // Älteste Version im ganzen Buch finden und entfernen.
    let target: { chapter: number; at: string } | null = null;
    next.forEach((chapter, chapterIndex) => {
      for (const version of chapter.history ?? []) {
        if (!target || version.at < target.at) target = { chapter: chapterIndex, at: version.at };
      }
    });
    if (!target) break;
    const { chapter: chapterIndex, at } = target;
    next = next.map((chapter, index) =>
      index === chapterIndex
        ? { ...chapter, history: (chapter.history ?? []).filter((version) => version.at !== at) }
        : chapter,
    );
  }
  return next;
}

export function BookDetailView({
  book,
  characters,
  authorName,
  coverPresets = [],
  onSaveCoverPreset,
  facts = [],
  relations = [],
  worlds = [],
  series = [],
  onSeriesChange,
  books = [],
  initialChapterIndex = 0,
  onBack,
  onUpdate,
  onDelete,
  onWordsWritten,
  onStoryboardDerived,
}: {
  book: Book;
  characters: Character[];
  authorName: string;
  coverPresets?: SavedCoverPreset[];
  onSaveCoverPreset?: (label: string, layers: CoverTextLayer[]) => void;
  /** Kanon: Fakten und Beziehungen des Projekts (werden allen Prüf-Pässen mitgegeben). */
  facts?: CanonFact[];
  relations?: CharacterRelation[];
  worlds?: WorldEntry[];
  /** Reihen: Bände einer Reihe teilen Welt, Figuren-Historie und Kanon. */
  series?: Series[];
  onSeriesChange?: (series: Series[]) => void;
  /** Alle Bücher (Auswahl weiterer Bände im Reihen-Dialog). */
  books?: Book[];
  initialChapterIndex?: number;
  onBack: () => void;
  onUpdate: (book: Book) => void;
  onDelete: (id: string) => void;
  onWordsWritten: (count: number) => void;
  /**
   * Ein abgeleitetes Storyboard (Figuren/Welt/Handlungs-Karten) sauber übernehmen — die Shell
   * legt daraus fehlende Charaktere, Welteneinträge und Plot-Karten an, wie beim Anlegen eines
   * Buchs. Ohne diesen Weg bliebe abgeleitetes Personal bis zum nächsten Profilstart unsichtbar.
   */
  onStoryboardDerived?: (book: Book) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(initialChapterIndex);
  const [mode, setMode] = useState<Mode>("edit");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coverEditorOpen, setCoverEditorOpen] = useState(false);
  const [coverTarget, setCoverTarget] = useState<CoverTarget>("front");
  const [coverVariantsOpen, setCoverVariantsOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [canonCheckOpen, setCanonCheckOpen] = useState(false);
  /**
   * Eine Ableitung, die auf Bestätigung wartet. Sie liegt **im Speicher**, nicht im State des
   * Buchs: Verwerfen darf die Daten nicht anfassen — der bezahlte Modellaufruf ist dann einfach weg.
   */
  const [derivePreview, setDerivePreview] = useState<DerivePreview | null>(null);
  const pendingDeriveRef = useRef<{
    storyboard?: Awaited<ReturnType<typeof streamDeriveStoryboard>>;
    scenes: { index: number; scenes: DerivedScene[]; title: string }[];
  }>({ scenes: [] });
  /** null = alle Kapitel prüfen · Zahl = nur dieses Kapitel (Einzelkapitel-Button). */
  const [canonOnly, setCanonOnly] = useState<number | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [versionDiffOpen, setVersionDiffOpen] = useState(false);
  /** Nicht blockierende Kanon-Warnung nach einem Kapitelwechsel (null = keine). */
  const [canonWarn, setCanonWarn] = useState<{
    chapterIndex: number;
    violations: CanonViolation[];
    scope: string;
  } | null>(null);
  /** Live-Vorschau während eines gestreamten Laufs (null = keine Vorschau). */
  const [streamText, setStreamText] = useState<string | null>(null);
  /** Zusatzinfo in der Vorschau (z. B. „Teil 2/5"). */
  const [streamLabel, setStreamLabel] = useState<string | null>(null);
  /**
   * Zu welchem Kapitel der laufende Stream gehört. Nötig, weil eine Queue („alles ausbauen")
   * weiterläuft, während der Nutzer ein anderes Kapitel ansieht — ohne diese Zuordnung stünde im
   * Kapitel-Kopf der Wortstand eines fremden Kapitels.
   */
  const [streamChapter, setStreamChapter] = useState<number | null>(null);

  /**
   * Überarbeitung (Kohärenz/Stil) mit Live-Vorschau: Der Server chunkt das Kapitel und schickt
   * Teil-Ereignisse — die Vorschau wächst mit, die Teile werden mit Leerzeile verbunden.
   *
   * Mit `jobId` meldet der Lauf zusätzlich Teil und Wortstand ins Job-Center (gedrosselt).
   */
  const runPassStreamed = async (
    kind: "consistency" | "style",
    chapterIndex: number,
    request: Parameters<typeof streamPass>[1],
    jobId?: string,
  ): Promise<PassResult> => {
    setStreamText("");
    setStreamLabel(`${MODEL_STAGE_LABELS[kind]}-Prüfung · Kapitel ${chapterIndex + 1}`);
    setStreamChapter(chapterIndex);
    let part = 1;
    let parts = 1;
    const reporter = jobId
      ? createJobStreamReporter(
          jobId,
          (words) => `Teil ${part}/${parts} · ${words.toLocaleString("de-DE")} Wörter`,
        )
      : null;
    try {
      return await streamPass(kind, request, {
        onPartStart: (nextPart, nextParts) => {
          part = nextPart;
          parts = nextParts;
          setStreamLabel(`${MODEL_STAGE_LABELS[kind]} · Teil ${part}/${parts}`);
          // Teile werden serverseitig mit Leerzeile verbunden — in der Vorschau genauso.
          if (part > 1) setStreamText((prev) => `${prev ?? ""}\n\n`);
          reporter?.flush();
        },
        onPartDelta: (delta) => {
          setStreamText((prev) => `${prev ?? ""}${delta}`);
          reporter?.add(delta);
        },
        onPartDone: () => reporter?.flush(),
      });
    } finally {
      reporter?.flush();
    }
  };
  const [seriesOpen, setSeriesOpen] = useState(false);
  const [epubCover, setEpubCover] = useState<"front" | "back" | "none">("front");
  const [exportScope, setExportScope] = useState("all");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useEffect(() => {
    setSelectedIndex(initialChapterIndex);
  }, [initialChapterIndex, book.id]);

  // Druck-Scope: nur im Reader wird der Inhalt gedruckt (siehe index.css).
  useEffect(() => {
    document.body.dataset.printArea = mode === "read" ? "on" : "off";
    return () => {
      delete document.body.dataset.printArea;
    };
  }, [mode]);

  const manuscript = useMemo(() => manuscriptOf(book), [book.manuscript, book.storyboard]);

  const mySeries = useMemo(() => seriesOfBook(series ?? [], book.id), [series, book.id]);

  /**
   * Kanon-Block für alle Generierungs-/Prüf-Pässe: nur Entitäten dieses Projekts
   * (Figuren des Buchs bzw. aus seinem Storyboard, Welteneinträge mit dieser bookId).
   */
  const canonData = useMemo(() => {
    const allFacts = facts ?? [];
    const allRelations = relations ?? [];

    // In einer Reihe zählt der Kanon **aller Bände** (gemeinsame Welt und Figuren-Historie).
    const scopeBookIds = new Set(canonVolumeIds(series ?? [], book.id));
    const storyboardNames = new Set(
      (book.storyboard?.characters ?? []).map((entry) => entry.name.trim().toLowerCase()),
    );
    const scopedCharacters = characters.filter(
      (character) =>
        scopeBookIds.has(character.bookId ?? "") ||
        storyboardNames.has(character.name.trim().toLowerCase()),
    );
    const characterIds = new Set(scopedCharacters.map((character) => character.id));
    const scopedWorlds = (worlds ?? []).filter((entry) => scopeBookIds.has(entry.bookId ?? ""));
    const worldIds = new Set(scopedWorlds.map((entry) => entry.id));

    const nameOf = (id: string) =>
      scopedCharacters.find((character) => character.id === id)?.name ??
      scopedWorlds.find((entry) => entry.id === id)?.title ??
      "";

    const scopedFacts = factsForBook(allFacts, characterIds, worldIds);
    const scopedRelations = relationsForBook(allRelations, characterIds);
    const block = canonBlock({ facts: scopedFacts, relations: scopedRelations, nameOf });
    return {
      nameOf,
      scopedCharacters,
      scopedWorlds,
      facts: scopedFacts,
      relations: scopedRelations,
      all: block.trim().length > 0 ? block : undefined,
    };
  }, [facts, relations, characters, worlds, series, book.id, book.storyboard]);

  /** Kanon-Block für alle Generierungs-/Prüf-Pässe (gesamter Scope des Projekts). */
  const canon = canonData.all;

  /** Wählbare Umfänge für den gezielten Fakten-Check (Gesamt, eine Figur/Welt, freie Auswahl). */
  const canonScopes = useMemo<CanonScopeOption[]>(() => {
    const options: CanonScopeOption[] = [
      { id: "all", label: `Gesamter Kanon (${canonData.facts.length} Fakten)` },
    ];
    for (const character of canonData.scopedCharacters) {
      const count =
        canonData.facts.filter((fact) => fact.entityId === character.id).length +
        canonData.relations.filter(
          (relation) => relation.fromId === character.id || relation.toId === character.id,
        ).length;
      if (count > 0) {
        options.push({ id: `c:${character.id}`, label: `Nur ${character.name} (${count})` });
      }
    }
    for (const entry of canonData.scopedWorlds) {
      const count = canonData.facts.filter((fact) => fact.entityId === entry.id).length;
      if (count > 0) options.push({ id: `w:${entry.id}`, label: `Nur ${entry.title} (${count})` });
    }
    return options;
  }, [canonData]);

  const canonFacts = useMemo<CanonFactOption[]>(
    () =>
      canonData.facts
        .filter((fact) => fact.statement.trim().length > 0)
        .map((fact) => ({
          id: fact.id,
          label: `${canonData.nameOf(fact.entityId) || "?"}: ${fact.statement}`,
        })),
    [canonData],
  );

  /** Baut den Kanon-Block für einen gewählten Umfang (ohne Serveränderung — nur kürzerer Block). */
  const canonForScope = (scope: CanonScopeSelection): string | undefined => {
    if (scope.scopeId === "all") return canonData.all;
    if (scope.scopeId === "facts") {
      const chosen = canonData.facts.filter((fact) => scope.factIds.includes(fact.id));
      const block = canonBlock({ facts: chosen, relations: [], nameOf: canonData.nameOf });
      return block.trim().length > 0 ? block : undefined;
    }
    const [kind, id = ""] = scope.scopeId.split(":");
    if (kind === "c") {
      const block = canonBlock({
        facts: canonData.facts.filter((fact) => fact.entityId === id),
        relations: canonData.relations.filter(
          (relation) => relation.fromId === id || relation.toId === id,
        ),
        nameOf: canonData.nameOf,
      });
      return block.trim().length > 0 ? block : undefined;
    }
    if (kind === "w") {
      const block = canonBlock({
        facts: canonData.facts.filter((fact) => fact.entityId === id),
        relations: [],
        nameOf: canonData.nameOf,
      });
      return block.trim().length > 0 ? block : undefined;
    }
    return canonData.all;
  };
  const plans = useMemo<ChapterPlan[]>(() => book.storyboard?.chapters ?? [], [book.storyboard]);
  const status = STATUS_META[book.status];
  const progress = progressOf(book);
  const language = readLanguage() ?? "German";

  const safeIndex = Math.min(selectedIndex, Math.max(0, manuscript.length - 1));
  const selected = manuscript[safeIndex];
  const plan = plans[safeIndex];
  const totalWords = useMemo(() => manuscriptWordCount(manuscript), [manuscript]);
  const pendingExpandCount = useMemo(
    () => manuscript.filter((chapter) => chapter.expanded.trim().length === 0).length,
    [manuscript],
  );
  /** Gibt es überhaupt Text, aus dem sich Struktur ableiten lässt? */
  const hasManuscriptText = useMemo(
    () =>
      manuscript.some((chapter) => (chapter.expanded || chapter.draft).trim().length > 0),
    [manuscript],
  );
  const pendingConsistency = useMemo(
    () =>
      manuscript.filter(
        (chapter) => chapter.expanded.trim().length > 0 && !chapter.consistencyChecked,
      ).length,
    [manuscript],
  );
  const pendingStyle = useMemo(
    () =>
      manuscript.filter((chapter) => chapter.expanded.trim().length > 0 && !chapter.styleChecked)
        .length,
    [manuscript],
  );

  /* ── Autosave: lokale Puffer, debounced persistiert ─────────────────── */

  const [expandedBuffer, setExpandedBuffer] = useState(selected?.expanded ?? "");
  const [draftBuffer, setDraftBuffer] = useState(selected?.draft ?? "");
  const bufferIndexRef = useRef(safeIndex);
  const commitRef = useRef<(index: number, patch: Partial<ChapterContent>) => void>(() => {});
  const expandedBufferRef = useRef(expandedBuffer);
  const draftBufferRef = useRef(draftBuffer);
  const manuscriptRef = useRef(manuscript);
  expandedBufferRef.current = expandedBuffer;
  draftBufferRef.current = draftBuffer;
  manuscriptRef.current = manuscript;

  /** Ausstehende Puffer-Änderungen eines Kapitels sofort sichern. */
  const flushBuffer = (index: number) => {
    const chapter = manuscriptRef.current[index];
    if (!chapter) return;
    const patch: Partial<ChapterContent> = {};
    if (expandedBufferRef.current !== (chapter.expanded ?? "")) {
      patch.expanded = expandedBufferRef.current;
    }
    if (draftBufferRef.current !== (chapter.draft ?? "")) {
      patch.draft = draftBufferRef.current;
    }
    if (Object.keys(patch).length > 0) commitRef.current(index, patch);
  };

  useEffect(() => {
    const previousIndex = bufferIndexRef.current;
    if (previousIndex !== safeIndex) flushBuffer(previousIndex);

    bufferIndexRef.current = safeIndex;
    setExpandedBuffer(selected?.expanded ?? "");
    setDraftBuffer(selected?.draft ?? "");
  }, [safeIndex, selected?.expanded, selected?.draft, manuscript]);

  // Beim Verlassen des Editors ausstehende Änderungen sichern.
  useEffect(
    () => () => {
      flushBuffer(bufferIndexRef.current);
    },
    [],
  );

  useEffect(() => {
    if (expandedBuffer === (selected?.expanded ?? "")) return;
    const timer = setTimeout(() => {
      if (bufferIndexRef.current === safeIndex) {
        commitRef.current(safeIndex, { expanded: expandedBuffer });
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [expandedBuffer, safeIndex, selected?.expanded]);

  useEffect(() => {
    if (draftBuffer === (selected?.draft ?? "")) return;
    const timer = setTimeout(() => {
      if (bufferIndexRef.current === safeIndex) {
        commitRef.current(safeIndex, { draft: draftBuffer });
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [draftBuffer, safeIndex, selected?.draft]);

  const isDirty =
    expandedBuffer !== (selected?.expanded ?? "") || draftBuffer !== (selected?.draft ?? "");

  /** Verbindliche Szenen-Vorgaben (Beats + Figuren + Metadaten) für den Server. */
  const scenesFor = (index: number): SceneConstraint[] => {
    const chapter = manuscript[index];
    if (!chapter) return [];
    return sceneConstraints(
      chapter,
      plans[index],
      (id) => characters.find((character) => character.id === id)?.name ?? "",
    );
  };

  const commit = (nextManuscript: ChapterContent[], nextPlans?: ChapterPlan[]) => {
    const reindexed = nextManuscript.map((chapter, index) => ({ ...chapter, index }));
    const expandedDone = reindexed.filter((chapter) => chapter.expanded.trim().length > 0).length;
    const touched = reindexed.filter(
      (chapter) => chapter.expanded.trim().length > 0 || chapter.draft.trim().length > 0,
    ).length;
    const goalWords = reindexed.reduce((sum, chapter) => sum + chapterTargetWords(chapter), 0);
    const nextStoryboard =
      book.storyboard && nextPlans
        ? { ...book.storyboard, chapters: nextPlans.map((item, index) => ({ ...item, index })) }
        : book.storyboard;

    onUpdate({
      ...book,
      manuscript: reindexed,
      storyboard: nextStoryboard,
      chapters: reindexed.length || book.chapters,
      chaptersDone: touched,
      words: manuscriptWordCount(reindexed),
      goalWords: goalWords || book.goalWords,
      status:
        book.status === "published"
          ? "published"
          : expandedDone === reindexed.length && reindexed.length > 0
            ? "editing"
            : "draft",
      updatedAt: new Date().toISOString(),
    });
  };

  const updateChapter = (index: number, patch: Partial<ChapterContent>) => {
    commit(
      manuscript.map((chapter, i) => (i === index ? { ...chapter, ...patch } : chapter)),
      plans,
    );
  };

  /**
   * Mehrere Kapitel in **einem** Commit ändern. Nötig für schnelle Folgen (z. B. ein
   * Prüfergebnis je Kapitel): `updateChapter` arbeitet auf dem `manuscript`-Closure und würde
   * sich sonst gegenseitig überschreiben. Der Ref wird synchron mitgezogen.
   */
  const patchChapters = (patches: Map<number, Partial<ChapterContent>>) => {
    if (patches.size === 0) return;
    const next = manuscriptRef.current.map((chapter, index) =>
      patches.has(index) ? { ...chapter, ...(patches.get(index) as Partial<ChapterContent>) } : chapter,
    );
    manuscriptRef.current = next;
    commit(next, plans);
  };
  commitRef.current = updateChapter;

  const addChapter = () => {
    const index = manuscript.length;
    const nextPlan: ChapterPlan = {
      index,
      title: `Kapitel ${index + 1}`,
      summary: "",
      pov: "",
      setting: "",
      beats: [],
      foreshadowing: [],
    };
    const nextContent: ChapterContent = {
      index,
      title: nextPlan.title,
      draft: "",
      expanded: "",
      targetWords: EXPAND_DEFAULT_WORDS,
      characterIds: [],
      beatCharacters: [],
    };
    commit([...manuscript, nextContent], [...plans, nextPlan]);
    setSelectedIndex(index);
  };

  const removeChapter = (index: number) => {
    commit(
      manuscript.filter((_, i) => i !== index),
      plans.filter((_, i) => i !== index),
    );
    setSelectedIndex((prev) => Math.max(0, prev > index ? prev - 1 : prev));
  };

  /** Verschiebt ein Kapitel per Drag & Drop an die Zielposition. */
  const reorderChapter = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    if (from >= manuscript.length || to >= manuscript.length) return;

    const nextManuscript = [...manuscript];
    const nextPlans = [...plans];
    const [movedContent] = nextManuscript.splice(from, 1);
    const [movedPlan] = nextPlans.splice(from, 1);
    if (!movedContent) return;

    nextManuscript.splice(to, 0, movedContent);
    if (movedPlan) nextPlans.splice(to, 0, movedPlan);

    commit(nextManuscript, plans.length > 0 ? nextPlans : undefined);
    setSelectedIndex(to);
  };

  const toggleChapterCharacter = (index: number, characterId: string) => {
    const chapter = manuscript[index];
    if (!chapter) return;
    const current = chapter.characterIds ?? [];
    const next = current.includes(characterId)
      ? current.filter((id) => id !== characterId)
      : [...current, characterId];
    updateChapter(index, { characterIds: next });
  };

  /**
   * Schaltet eine **ganze Figurengruppe** (gleicher Name, z. B. Dubletten) gemeinsam.
   * Ist irgendeine davon gesetzt, gelten alle als ausgewählt und werden zusammen entfernt.
   */
  const toggleChapterCharacterGroup = (index: number, ids: string[]) => {
    const chapter = manuscript[index];
    if (!chapter) return;
    const current = chapter.characterIds ?? [];
    const allSelected = ids.every((id) => current.includes(id));
    const next = allSelected
      ? current.filter((id) => !ids.includes(id))
      : [...new Set([...current, ...ids])];
    updateChapter(index, { characterIds: next });
  };

  /**
   * Figuren-Chips: **eine** Schaltfläche je Figur. Im Register liegen leicht unterschiedliche
   * Namen („Lysara" / „Prinzessin Lysara", „Morwen" / „Schattenkönigin Morwen") — die Chips
   * fassen sie über den Namensabgleich zusammen und schalten alle zugehörigen IDs gemeinsam.
   */
  const sceneCharacters = useMemo(() => {
    const groups: { ids: string[]; name: string }[] = [];
    for (const character of characters) {
      const existing = groups.find((group) => characterNamesMatch(group.name, character.name));
      if (existing) existing.ids.push(character.id);
      else groups.push({ ids: [character.id], name: character.name });
    }
    return groups;
  }, [characters]);

  /* ── Szenen (Beats als editierbare Untereinheiten) ───────────────────── */

  const scenes = plan?.beats ?? [];
  const sceneChars: string[][] = scenes.map((_, index) => selected?.beatCharacters?.[index] ?? []);
  const sceneMetas: SceneMeta[] = scenes.map((_, index) => selected?.sceneMeta?.[index] ?? {});

  const writeScenes = (nextScenes: string[], nextChars: string[][], nextMetas: SceneMeta[]) => {
    const nextPlans = plans.map((item, index) =>
      index === safeIndex ? { ...item, beats: nextScenes } : item,
    );
    const nextManuscript = manuscript.map((chapter, index) =>
      index === safeIndex
        ? { ...chapter, beatCharacters: nextChars, sceneMeta: nextMetas }
        : chapter,
    );
    commit(nextManuscript, plans.length > 0 ? nextPlans : undefined);
  };

  const setSceneText = (index: number, text: string) =>
    writeScenes(
      scenes.map((scene, i) => (i === index ? text : scene)),
      sceneChars,
      sceneMetas,
    );

  const setSceneMeta = (index: number, patch: SceneMeta) =>
    writeScenes(
      scenes,
      sceneChars,
      sceneMetas.map((meta, i) => (i === index ? { ...meta, ...patch } : meta)),
    );

  const addScene = () => writeScenes([...scenes, ""], [...sceneChars, []], [...sceneMetas, {}]);

  const removeScene = (index: number) =>
    writeScenes(
      scenes.filter((_, i) => i !== index),
      sceneChars.filter((_, i) => i !== index),
      sceneMetas.filter((_, i) => i !== index),
    );

  const moveScene = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= scenes.length) return;

    const nextScenes = [...scenes];
    const nextChars = [...sceneChars];
    const nextMetas = [...sceneMetas];
    const sceneA = nextScenes[index];
    const sceneB = nextScenes[target];
    if (sceneA === undefined || sceneB === undefined) return;

    nextScenes[index] = sceneB;
    nextScenes[target] = sceneA;
    nextChars[index] = sceneChars[target] ?? [];
    nextChars[target] = sceneChars[index] ?? [];
    nextMetas[index] = sceneMetas[target] ?? {};
    nextMetas[target] = sceneMetas[index] ?? {};

    writeScenes(nextScenes, nextChars, nextMetas);
  };

  const toggleSceneCharacter = (index: number, characterId: string) => {
    const current = sceneChars[index] ?? [];
    const nextChars = sceneChars.map((list, i) => {
      if (i !== index) return list;
      return current.includes(characterId)
        ? current.filter((id) => id !== characterId)
        : [...current, characterId];
    });
    writeScenes(scenes, nextChars, sceneMetas);
  };

  const runAllPasses = async (kind: "consistency" | "style") => {
    if (!book.storyboard) {
      setError("Kein Storyboard vorhanden — dieses Buch wurde ohne Pipeline angelegt.");
      return;
    }
    const model = readStageModel(kind);
    if (!model.trim()) {
      setError(`Bitte eine Model-ID für „${MODEL_STAGE_LABELS[kind]}“ in den Einstellungen eintragen.`);
      return;
    }

    const pending = manuscript
      .map((chapter, index) => ({ chapter, index }))
      .filter(
        (item) =>
          item.chapter.expanded.trim().length > 0 &&
          !(kind === "consistency" ? item.chapter.consistencyChecked : item.chapter.styleChecked),
      )
      .map((item) => item.index);

    if (pending.length === 0) {
      setError("Keine offenen Kapitel für diesen Schritt.");
      return;
    }

    setError(null);
    let current = manuscript;
    let failure: string | null = null;
    let aborted = false;
    const jobId = createJob({
      title: `${MODEL_STAGE_LABELS[kind]}-Prüfung · ${book.title}`,
      kind: "pass",
      total: pending.length,
    });

    for (let position = 0; position < pending.length; position += 1) {
      const chapterIndex = pending[position] ?? 0;
      if (isCancelled(jobId)) {
        aborted = true;
        break;
      }
      updateJob(jobId, { done: position, label: `Kapitel ${chapterIndex + 1}` });
      setBusy(
        `${MODEL_STAGE_LABELS[kind]}-Prüfung ${position + 1}/${pending.length} · Kapitel ${chapterIndex + 1}…`,
      );
      try {
        const request = {
          storyboard: book.storyboard,
          chapterIndex,
          model,
          language,
          text: current[chapterIndex]?.expanded ?? "",
          scenes: scenesFor(chapterIndex),
          canon,
          styleProfile: readStyleProfileHint(),
        };
        // Gestreamt: der Text wächst live mit (Teil für Teil) — inklusive Wortstand im Job-Center.
        const result = await runPassStreamed(kind, chapterIndex, request, jobId);
        current = current.map((chapter, i) =>
          i === chapterIndex
            ? {
                ...chapter,
                expanded: result.text,
                ...(kind === "consistency"
                  ? { consistencyNotes: result.notes.join("\n"), consistencyChecked: true }
                  : { styleNotes: result.notes.join("\n"), styleChecked: true }),
              }
            : chapter,
        );
        // Persist after every chapter so the queue survives a reload/interruption.
        commit(current, plans);
      } catch (err) {
        failure = err instanceof Error ? err.message : "Unbekannter Fehler.";
        setError(`${failure} (abgebrochen bei Kapitel ${chapterIndex + 1})`);
        break;
      }
    }

    if (aborted) {
      finishJob(jobId, "cancelled", `${book.title}: Prüfung abgebrochen`);
    } else if (failure) {
      finishJob(jobId, "error", failure);
    } else {
      updateJob(jobId, { done: pending.length });
      finishJob(jobId, "done", `${pending.length} Kapitel · ${MODEL_STAGE_LABELS[kind]}`);
    }
    setStreamText(null);
    setStreamLabel(null);
    setStreamChapter(null);
    setBusy(null);
  };

  const runDraft = async (index: number) => {
    if (!book.storyboard) {
      setError("Kein Storyboard vorhanden — dieses Buch wurde ohne Pipeline angelegt.");
      return;
    }
    const model = readStageModel("draft");
    if (!model.trim()) {
      setError("Bitte eine Model-ID für „Rohentwurf“ in den Einstellungen eintragen.");
      return;
    }
    setError(null);
    setBusy(`Rohentwurf Kapitel ${index + 1}…`);
    setStreamText("");
      setStreamLabel(`Rohentwurf · Kapitel ${index + 1}`);
      setStreamChapter(index);
    try {
      // Streaming: Der Text wächst live mit (Fallback im Server, falls kein SSE).
      const draft = await streamJson(
        "/api/chapter/draft/stream",
        {
          storyboard: book.storyboard,
          chapterIndex: index,
          model,
          language,
          scenes: scenesFor(index),
          canon,
        },
        { onDelta: (delta) => setStreamText((prev) => `${prev ?? ""}${delta}`) },
      );
      updateChapter(index, { draft });
      onWordsWritten(countWords(draft));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setStreamText(null);
      setStreamLabel(null);
    setStreamChapter(null);
      setBusy(null);
    }
  };

  const targetFor = (chapter: ChapterContent | undefined): number =>
    chapter
      ? chapterTargetWords(chapter, book.defaultTargetWords)
      : (book.defaultTargetWords ?? EXPAND_DEFAULT_WORDS);

  const runPass = async (kind: "consistency" | "style", index: number) => {
    if (!book.storyboard) {
      setError("Kein Storyboard vorhanden — dieses Buch wurde ohne Pipeline angelegt.");
      return;
    }
    const model = readStageModel(kind);
    if (!model.trim()) {
      setError(`Bitte eine Model-ID für „${MODEL_STAGE_LABELS[kind]}“ in den Einstellungen eintragen.`);
      return;
    }
    const source = (manuscript[index]?.expanded ?? "").trim();
    if (!source) {
      setError("Dieses Kapitel muss zuerst ausgebaut werden.");
      return;
    }
    setError(null);
    setBusy(`${MODEL_STAGE_LABELS[kind]}-Prüfung Kapitel ${index + 1}…`);
    setStreamText("");
    setStreamLabel(`${MODEL_STAGE_LABELS[kind]}-Prüfung · Kapitel ${index + 1}`);
    setStreamChapter(index);
    if ((manuscript[index]?.expanded ?? "").trim()) pushSnapshot(index, `vor ${MODEL_STAGE_LABELS[kind]}-Prüfung`);
    try {
      const request = {
        storyboard: book.storyboard,
        chapterIndex: index,
        model,
        language,
        text: source,
        scenes: scenesFor(index),
        canon,
        styleProfile: readStyleProfileHint(),
      };
      // Gestreamt: der Text wächst live mit (Teil für Teil).
      const result = await runPassStreamed(kind, index, request);
      updateChapter(index, {
        expanded: result.text,
        ...(kind === "consistency"
          ? { consistencyNotes: result.notes.join("\n"), consistencyChecked: true }
          : { styleNotes: result.notes.join("\n"), styleChecked: true }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setStreamText(null);
      setStreamLabel(null);
    setStreamChapter(null);
      setBusy(null);
    }
  };

  const runExpand = async (index: number) => {
    if (!book.storyboard) {
      setError("Kein Storyboard vorhanden — dieses Buch wurde ohne Pipeline angelegt.");
      return;
    }
    const model = readStageModel("expand");
    if (!model.trim()) {
      setError("Bitte eine Model-ID für „Ausbau“ in den Einstellungen eintragen.");
      return;
    }
    setError(null);
    setBusy(`Ausbau Kapitel ${index + 1}…`);
    setStreamText("");
    setStreamLabel(`Ausbau · Kapitel ${index + 1}`);
    setStreamChapter(index);
    if ((manuscript[index]?.expanded ?? "").trim()) pushSnapshot(index, "vor Ausbau");
    try {
      // Streaming: Der Ausbau ist die längste Einzelantwort — hier lohnt die Live-Vorschau.
      const expanded = await streamJson(
        "/api/chapter/expand/stream",
        {
          storyboard: book.storyboard,
          chapterIndex: index,
          model,
          language,
          draft: manuscript[index]?.draft ?? "",
          targetWords: targetFor(manuscript[index]),
          scenes: scenesFor(index),
          canon,
        },
        { onDelta: (delta) => setStreamText((prev) => `${prev ?? ""}${delta}`) },
      );
      updateChapter(index, { expanded });
      onWordsWritten(countWords(expanded));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setStreamText(null);
      setStreamLabel(null);
    setStreamChapter(null);
      setBusy(null);
    }
  };

  const runAllExpand = async () => {
    if (!book.storyboard) {
      setError("Kein Storyboard vorhanden — dieses Buch wurde ohne Pipeline angelegt.");
      return;
    }
    const model = readStageModel("expand");
    if (!model.trim()) {
      setError("Bitte eine Model-ID für „Ausbau“ in den Einstellungen eintragen.");
      return;
    }

    const pending = manuscript
      .map((chapter, index) => ({ chapter, index }))
      .filter((item) => item.chapter.expanded.trim().length === 0)
      .map((item) => item.index);

    if (pending.length === 0) {
      setError("Alle Kapitel sind bereits ausgebaut.");
      return;
    }

    setError(null);
    let current = manuscript;
    let failure: string | null = null;
    let aborted = false;
    const jobId = createJob({
      title: `Ausbau · ${book.title}`,
      kind: "expand",
      total: pending.length,
    });

    for (let position = 0; position < pending.length; position += 1) {
      const chapterIndex = pending[position] ?? 0;
      if (isCancelled(jobId)) {
        aborted = true;
        break;
      }
      updateJob(jobId, { done: position, label: `Kapitel ${chapterIndex + 1}` });
      setBusy(`Ausbau ${position + 1}/${pending.length} · Kapitel ${chapterIndex + 1}…`);
      setStreamText("");
      setStreamLabel(`Ausbau · Kapitel ${chapterIndex + 1}/${pending.length}`);
      setStreamChapter(chapterIndex);
      const reporter = createJobStreamReporter(
        jobId,
        (words) => `Ausbau · ${words.toLocaleString("de-DE")} Wörter`,
      );
      try {
        // Gestreamt: dasselbe wie beim Einzel-Ausbau — der Text wächst live mit, die
        // Fortsetzungen (Continuation-Loop) ebenfalls.
        const expanded = await streamJson(
          "/api/chapter/expand/stream",
          {
            storyboard: book.storyboard,
            chapterIndex,
            model,
            language,
            draft: current[chapterIndex]?.draft ?? "",
            targetWords: targetFor(current[chapterIndex]),
            scenes: scenesFor(chapterIndex),
            canon,
          },
          {
            onDelta: (delta) => {
              setStreamText((prev) => `${prev ?? ""}${delta}`);
              reporter.add(delta);
            },
          },
        );
        current = current.map((chapter, i) =>
          i === chapterIndex ? { ...chapter, expanded } : chapter,
        );
        // Persist after every chapter so the queue survives a reload/interruption.
        commit(current, plans);
        onWordsWritten(countWords(expanded));
      } catch (err) {
        failure = err instanceof Error ? err.message : "Unbekannter Fehler.";
        setError(`${failure} (abgebrochen bei Kapitel ${chapterIndex + 1})`);
        break;
      } finally {
        reporter.flush();
      }
    }

    if (aborted) {
      finishJob(jobId, "cancelled", `${book.title}: Ausbau abgebrochen`);
    } else if (failure) {
      finishJob(jobId, "error", failure);
    } else {
      updateJob(jobId, { done: pending.length });
      finishJob(jobId, "done", `${pending.length} Kapitel ausgebaut`);
    }
    setStreamText(null);
    setStreamLabel(null);
    setStreamChapter(null);
    setBusy(null);
  };

  const regenerateCover = async () => {
    if (!book.storyboard) {
      setError("Kein Storyboard vorhanden — Cover benötigt Storyboard-Daten.");
      return;
    }
    setError(null);
    setBusy("Cover wird generiert…");
    try {
      const url = await generateCover({ prompt: buildCoverPrompt(book.storyboard) });
      onUpdate({ ...book, coverUrl: url });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setBusy(null);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const fileSafe = (value: string) =>
    value
      .replace(/[^\p{L}\p{N}\-_. ]+/gu, "")
      .trim()
      .replace(/\s+/g, "_") || "buch";

  /** Manuskript mit den noch nicht persistierten Editor-Puffern (Autosave ist verzögert). */
  const liveManuscript = (): ChapterContent[] =>
    manuscript.map((chapter, index) =>
      index === safeIndex ? { ...chapter, expanded: expandedBuffer, draft: draftBuffer } : chapter,
    );

  const buildManuscriptText = (): string => {
    const chapters = liveManuscript().map(
      (chapter, index) =>
        `Kapitel ${index + 1}: ${chapter.title}\n\n${chapter.expanded || chapter.draft}`,
    );
    return `${book.title}\n${book.subtitle}\n\n${chapters.join("\n\n— — —\n\n")}`;
  };

  const copyManuscript = async () => {
    if (isDirty) flushBuffer(safeIndex);
    const chapters = liveManuscript();
    const ok = await copyText(buildManuscriptText());
    if (!ok) {
      showToast("Kopieren fehlgeschlagen — bitte .txt exportieren", "error");
      return;
    }

    // Ehrliche Rückmeldung: unvollständig generierte Kapitel beim Namen nennen.
    const broken = chapters
      .map((chapter, index) => ({ index, text: chapter.expanded || chapter.draft }))
      .filter((chapter) => looksTruncated(chapter.text))
      .map((chapter) => chapter.index + 1);
    if (broken.length > 0) {
      showToast(
        `Kopiert — aber Kapitel ${broken.join(", ")} endet mitten im Satz (unvollständig generiert).`,
        "error",
      );
      return;
    }

    const words = chapters.reduce(
      (sum, chapter) => sum + (chapter.expanded || chapter.draft).split(/\s+/).filter(Boolean).length,
      0,
    );
    showToast(`Manuskript kopiert — ${chapters.length} Kapitel, ~${words} Wörter`);
  };

  const actOf = (index: number, total: number) => {
    const ratio = total > 0 ? index / total : 0;
    if (ratio < 0.25) return 1;
    if (ratio < 0.75) return 2;
    return 3;
  };

  /** Auswahl für Teil-Export (Gesamtbuch, Akt oder aktuelles Kapitel). */
  const scopedSelection = (): { book: Book; suffix: string } => {
    const source = liveManuscript();
    if (exportScope === "all") return { book: { ...book, manuscript: source }, suffix: "" };

    if (exportScope === "chapter") {
      const chapter = source[safeIndex];
      if (!chapter) return { book, suffix: "" };
      const plan = plans[safeIndex];
      return {
        book: {
          ...book,
          manuscript: [chapter],
          storyboard: book.storyboard && plan ? { ...book.storyboard, chapters: [plan] } : undefined,
        },
        suffix: `-kapitel-${safeIndex + 1}`,
      };
    }

    const act = Number.parseInt(exportScope.replace("act:", ""), 10);
    const indexes = source
      .map((_, index) => index)
      .filter((index) => actOf(index, source.length) === act);
    if (indexes.length === 0) return { book, suffix: "" };

    const subsetManuscript = indexes
      .map((index) => source[index])
      .filter((chapter): chapter is ChapterContent => Boolean(chapter));
    const subsetPlans = indexes
      .map((index) => plans[index])
      .filter((plan): plan is ChapterPlan => Boolean(plan));

    return {
      book: {
        ...book,
        manuscript: subsetManuscript,
        storyboard: book.storyboard ? { ...book.storyboard, chapters: subsetPlans } : undefined,
      },
      suffix: `-akt-${act}`,
    };
  };

  const exportMarkdown = () => {
    const { book: scoped, suffix } = scopedSelection();
    if (isDirty) flushBuffer(safeIndex);
    downloadBlob(
      new Blob([buildMarkdown(scoped)], { type: "text/markdown" }),
      `${fileSafe(scoped.title)}${suffix}.md`,
    );
    showToast("Markdown exportiert");
  };

  const exportEpub = async () => {
    const { book: scoped, suffix } = scopedSelection();
    if (!scoped.storyboard && scoped.manuscript?.length === 0) {
      setError("Dieses Buch hat noch keine Kapitel.");
      return;
    }
    setError(null);
    setBusy("EPUB wird erstellt…");
    try {
      const blob = await buildEpub(scoped, { author: authorName, language, cover: epubCover });
      downloadBlob(blob, `${fileSafe(scoped.title)}${suffix}.epub`);
      showToast("EPUB exportiert");
    } catch (err) {
      setError(err instanceof Error ? err.message : "EPUB-Export fehlgeschlagen.");
    } finally {
      setBusy(null);
    }
  };

  const exportDocx = () => {
    const { book: scoped, suffix } = scopedSelection();
    if (isDirty) flushBuffer(safeIndex);
    downloadBlob(buildDocx(scoped, { author: authorName }), `${fileSafe(scoped.title)}${suffix}.docx`);
    showToast("DOCX exportiert");
  };

  const exportPdf = () => {
    const { book: scoped, suffix } = scopedSelection();
    if (isDirty) flushBuffer(safeIndex);
    downloadBlob(buildPdf(scoped, { author: authorName }), `${fileSafe(scoped.title)}${suffix}.pdf`);
    showToast("PDF exportiert");
  };

  /* ── Kapitel-Versionierung ──────────────────────────────────────────── */

  const pushSnapshot = (index: number, note: string) => {
    const chapter = manuscript[index];
    if (!chapter) return;
    const snapshot: ChapterVersion = {
      at: new Date().toISOString(),
      title: chapter.title,
      draft: chapter.draft,
      expanded: chapter.expanded,
      note,
    };
    const history = [snapshot, ...(chapter.history ?? [])].slice(0, HISTORY_MAX_ENTRIES);
    commit(
      trimHistoryToBudget(
        manuscript.map((item, i) => (i === index ? { ...item, history } : item)),
      ),
      plans,
    );
  };

  const restoreVersion = (index: number, at: string) => {
    const chapter = manuscript[index];
    const version = chapter?.history?.find((item) => item.at === at);
    if (!chapter || !version) return;
    const history: ChapterVersion[] = [
      {
        at: new Date().toISOString(),
        title: chapter.title,
        draft: chapter.draft,
        expanded: chapter.expanded,
        note: "vor Wiederherstellung",
      },
      ...(chapter.history ?? []),
    ].slice(0, HISTORY_MAX_ENTRIES);

    commit(
      trimHistoryToBudget(
        manuscript.map((item, i) =>
          i === index
            ? {
                ...item,
                title: version.title,
                draft: version.draft,
                expanded: version.expanded,
                history,
              }
            : item,
        ),
      ),
      plans,
    );
    setExpandedBuffer(version.expanded);
    setDraftBuffer(version.draft);
  };

  /** Modell der Kohärenz-Stufe — Timeline-Prüfung und Quick Fix nutzen es. */
  const timelineModel = (): string => {
    const model = readStageModel("consistency");
    if (!model.trim()) {
      throw new Error(
        "Bitte eine Model-ID für „Kohärenz“ in den Einstellungen eintragen (die Timeline nutzt sie).",
      );
    }
    return model;
  };

  /* ── Struktur aus dem Manuskript ableiten (Storyboard & Szenen) ───────── */

  /** Live-Liste der laufenden Ableitung (Storyboard-Zeilen bzw. Szenen-Beats). */
  const [deriveText, setDeriveText] = useState<string | null>(null);
  const [deriveLabel, setDeriveLabel] = useState<string | null>(null);

  /** Hängt eine Zeile an die Live-Liste der Ableitung. */
  const pushDeriveLine = (line: string) =>
    setDeriveText((prev) => (prev ? `${prev}\n${line}` : line));

  const resetDerive = () => {
    setDeriveText(null);
    setDeriveLabel(null);
  };

  /** Modell der Storyboard-Stufe — Ableitung von Storyboard und Szenen nutzen es. */
  const structureModel = (): string => {
    const model = readStageModel("storyboard");
    if (!model.trim()) {
      throw new Error(
        "Bitte eine Model-ID für „Storyboard“ in den Einstellungen eintragen (die Ableitung nutzt sie).",
      );
    }
    return model;
  };

  /**
   * Kapitelpläne für die Struktur-Arbeit. Fehlt dem Buch ein Storyboard-Plan (Manuskript ohne
   * Storyboard), entsteht er hier aus dem Manuskript — sonst hätten Szenen keinen Platz.
   */
  const structurePlans = (): ChapterPlan[] =>
    plans.length > 0
      ? plans
      : manuscriptRef.current.map((chapter, index) => ({
          index,
          title: chapter.title || `Kapitel ${index + 1}`,
          summary: "",
          pov: "",
          setting: "",
          beats: [],
          foreshadowing: [],
        }));

  /**
   * Storyboard aus dem Manuskript ableiten: Meta-Angaben, Figurenliste und je Kapitel
   * Kurzfassung/POV/Schauplatz/Foreshadowing.
   *
   * Vorhandene Angaben werden nur nach Rückfrage überschrieben — der Import setzt z. B. eine
   * Kurzfassung aus dem Textanfang, und die soll die Modell-Fassung ersetzen dürfen.
   */
  const runDeriveStoryboard = async () => {
    const chapters = manuscriptRef.current
      .map((chapter) => ({
        title: chapter.title,
        text: (chapter.expanded || chapter.draft).trim(),
      }))
      .filter((chapter) => chapter.text.length > 0);
    if (chapters.length === 0) {
      setError("Kein Manuskript-Text vorhanden — es gibt nichts abzuleiten.");
      return;
    }
    if (!book.storyboard) {
      setError("Ohne Storyboard lässt sich nichts ableiten.");
      return;
    }

    let model: string;
    try {
      model = structureModel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
      return;
    }

    const existing = book.storyboard;
    // Kein Vorab-Dialog mehr („überschreiben? — abbrechen = nur leere Felder füllen"): Der Lauf
    // wird **immer** gemacht und danach am Diff entschieden. Vorher zu raten hieß, den bereits
    // bezahlten Aufruf wegzuwerfen oder blind zu überschreiben.

    setError(null);
    setDeriveText("");
    setDeriveLabel("Storyboard · Meta und Figuren");
    setBusy("Storyboard wird abgeleitet…");
    const jobId = createJob({ title: `${book.title}: Storyboard ableiten`, kind: "derive", total: 2 });
    try {
      const result = await streamDeriveStoryboard(
        {
          title: book.title,
          genre: book.storyboard.genre,
          chapters,
          model,
          language,
        },
        {
          onStart: ({ batches }) => updateJob(jobId, { total: 1 + batches }),
          onPhase: (phase) => {
            setDeriveLabel(
              phase === "meta" ? "Storyboard · Meta und Figuren" : "Storyboard · Kapitel-Batches",
            );
          },
          onMeta: (meta) => {
            pushDeriveLine(
              meta.genre
                ? `Genre: ${meta.genre}${meta.tone ? ` · ${meta.tone}` : ""}`
                : "Meta: (keine Angaben im Text)",
            );
            if (meta.synopsis) pushDeriveLine(`Synopsis: ${meta.synopsis}`);
          },
          onCharacter: (character) => {
            pushDeriveLine(`Figur: ${character.name}${character.role ? ` — ${character.role}` : ""}`);
          },
          onChapter: (plan) => {
            if (plan.summary) pushDeriveLine(`Kapitel ${plan.index + 1}: ${plan.summary}`);
          },
          onBatch: (done, total) => {
            updateJob(jobId, { done: 1 + done, label: `Kapitel-Batch ${done}/${total}` });
          },
        },
      );

      pendingDeriveRef.current = { storyboard: result, scenes: [] };
      setDerivePreview({
        kind: "storyboard",
        plan: {
          rows: [
            { label: "Untertitel", before: existing.subtitle, after: result.meta.subtitle },
            { label: "Genre", before: existing.genre, after: result.meta.genre },
            { label: "Logline", before: existing.logline, after: result.meta.logline },
            { label: "Synopsis", before: existing.synopsis, after: result.meta.synopsis },
            { label: "Ton", before: existing.tone, after: result.meta.tone },
            { label: "POV", before: existing.pov, after: result.meta.pov },
          ],
          chapters: result.chapters.map((chapter) => {
            const current = existing.chapters.find((plan) => plan.index === chapter.index);
            return {
              index: chapter.index,
              title: current?.title ?? "",
              before: current?.summary ?? "",
              after: chapter.summary,
            };
          }),
          characters: result.characters.map((character) => character.name),
          themes: result.meta.themes,
        },
      });
      updateJob(jobId, { done: 1 + (result.chapters.length > 0 ? 1 : 0) });
      finishJob(jobId, "done", "Storyboard abgeleitet — Vorschau offen");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler.";
      setError(message);
      finishJob(jobId, "error", message);
    } finally {
      resetDerive();
      setBusy(null);
    }
  };

  /** Der aktuelle Szenen-Stand eines Kapitels — Grundlage für den Vorher-Nachher-Vergleich. */
  const currentSceneState = (index: number) => {
    const chapter = manuscriptRef.current[index];
    return {
      beats: [...(structurePlans()[index]?.beats ?? [])],
      metas: [...(chapter?.sceneMeta ?? [])],
      characters: [...(chapter?.beatCharacters ?? [])],
    };
  };

  /**
   * Schreibt ein abgeleitetes Storyboard ins Buch — **erst nach** der Vorschau.
   * `mode` entscheidet, ob vorhandene Angaben ersetzt oder nur leere Felder gefüllt werden.
   */
  const applyStoryboardDerive = (
    result: Awaited<ReturnType<typeof streamDeriveStoryboard>>,
    mode: DeriveMode,
  ) => {
    const overwrite = mode === "overwrite";
    const existing = book.storyboard;
    const pick = (derived: string, current: string) =>
      overwrite ? derived || current : current || derived;

    const plans = existing.chapters.map((plan) => {
      const derived = result.chapters.find((entry) => entry.index === plan.index);
      if (!derived) return plan;
      return {
        ...plan,
        summary: pick(derived.summary, plan.summary),
        pov: pick(derived.pov, plan.pov),
        setting: pick(derived.setting, plan.setting),
        foreshadowing:
          overwrite && derived.foreshadowing.length > 0
            ? derived.foreshadowing
            : plan.foreshadowing.length > 0
              ? plan.foreshadowing
              : derived.foreshadowing,
      };
    });

    // Figuren zusammenführen: vorhandene zuerst, neue nach Namen ergänzt (keine Dubletten).
    const names = new Set(existing.characters.map((entry) => entry.name.trim().toLowerCase()));
    const characters = [...existing.characters];
    for (const candidate of result.characters) {
      const key = candidate.name.trim().toLowerCase();
      if (!key || names.has(key)) continue;
      names.add(key);
      characters.push(candidate);
    }

    const next: Book = {
      ...book,
      storyboard: {
        ...existing,
        title: existing.title || result.meta.title,
        subtitle: pick(result.meta.subtitle, existing.subtitle),
        genre: pick(result.meta.genre, existing.genre) || "Roman",
        logline: pick(result.meta.logline, existing.logline),
        synopsis: pick(result.meta.synopsis, existing.synopsis),
        tone: pick(result.meta.tone, existing.tone),
        pov: pick(result.meta.pov, existing.pov),
        themes: overwrite && result.meta.themes.length > 0 ? result.meta.themes : existing.themes,
        characters,
        chapters: plans,
      },
      updatedAt: new Date().toISOString(),
    };

    if (onStoryboardDerived) onStoryboardDerived(next);
    else onUpdate(next);
    showToast(
      result.characters.length > 0
        ? `Storyboard übernommen · ${result.characters.length} Figuren erkannt`
        : "Storyboard übernommen",
      "ok",
    );
  };

  /**
   * Wendet eine **bestätigte** Ableitung an: Szenen je ausgewähltem Kapitel oder das Storyboard im
   * gewählten Modus. Bis hierher hat nichts geschrieben — Verwerfen ist deshalb folgenlos.
   */
  const applyDerivePreview = (mode: DeriveMode, chapterIndices: number[]) => {
    const pending = pendingDeriveRef.current;
    pendingDeriveRef.current = { scenes: [] };
    setDerivePreview(null);

    if (pending.storyboard) {
      applyStoryboardDerive(pending.storyboard, mode);
      return;
    }

    const chosen = pending.scenes.filter((entry) => chapterIndices.includes(entry.index));
    if (chosen.length === 0) return;

    let manuscript = manuscriptRef.current;
    let plans = structurePlans();
    for (const entry of chosen) {
      const next = applyDerivedScenes(entry.index, entry.scenes, manuscript, plans);
      manuscript = next.manuscript;
      plans = next.plans;
    }
    manuscriptRef.current = manuscript;
    commit(manuscript, plans.length > 0 ? plans : undefined);

    if (chosen.length === 1) {
      showToast(`Kapitel ${(chosen[0]?.index ?? 0) + 1}: Szenen übernommen`, "ok");
    } else {
      showToast(`${chosen.length} Kapitel: Szenen übernommen`, "ok");
    }
  };

  /** Übernimmt abgeleitete Szenen in Beat-Liste und Szenen-Metadaten eines Kapitels. */
  const applyDerivedScenes = (
    index: number,
    scenes: DerivedScene[],
    baseManuscript: ChapterContent[],
    basePlans: ChapterPlan[],
  ): { manuscript: ChapterContent[]; plans: ChapterPlan[] } => {
    // Namen → IDs: Die Ableitung liefert nur **Namen** (der Server kennt keine Figurenliste), und
    // ein Name ohne passende Figur wird NICHT als neue Figur erfunden — er fällt weg und wird
    // gezählt, damit niemand rätselt, warum ein Chip fehlt.
    const unmatched = new Set<string>();
    const charactersPerScene = scenes.map((scene) => {
      const ids: string[] = [];
      for (const name of scene.characters) {
        const character = findMatchingCharacter({ name, bookId: book.id }, characters);
        if (!character) {
          unmatched.add(name);
          continue;
        }
        if (!ids.includes(character.id)) ids.push(character.id);
      }
      return ids;
    });
    if (unmatched.size > 0) {
      const names = [...unmatched].join(", ");
      showToast(
        unmatched.size === 1
          ? `„${names}" ist keiner Figur zugeordnet — dort bleibt der Chip leer`
          : `${unmatched.size} Namen ohne Figur: ${names}`,
        "info",
      );
    }

    const nextPlans = basePlans.map((plan, i) =>
      i === index ? { ...plan, beats: scenes.map((scene) => scene.text) } : plan,
    );
    const nextManuscript = baseManuscript.map((chapter, i) =>
      i === index
        ? {
            ...chapter,
            sceneMeta: scenes.map((scene) => ({
              time: scene.time || undefined,
              setting: scene.setting || undefined,
              pov: scene.pov || undefined,
            })),
            // Gleiche Länge und Reihenfolge wie `beats` und `sceneMeta` — darauf verlassen sich
            // Pipeline-Vorgabe und Timeline-Prüfung.
            beatCharacters: charactersPerScene,
          }
        : chapter,
    );
    return { manuscript: nextManuscript, plans: nextPlans };
  };

  /** Szenen eines einzelnen Kapitels ableiten und direkt übernehmen. */
  const runDeriveScenes = async (index: number) => {
    const chapter = manuscriptRef.current[index];
    const text = (chapter?.expanded || chapter?.draft || "").trim();
    if (!text) {
      setError(`Kapitel ${index + 1} hat keinen Text, aus dem sich Szenen ableiten ließen.`);
      return;
    }

    let model: string;
    try {
      model = structureModel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
      return;
    }

    setError(null);
    setDeriveText("");
    setDeriveLabel(`Szenen · Kapitel ${index + 1}`);
    setBusy(`Szenen Kapitel ${index + 1}…`);
    try {
      const scenes = await streamDeriveScenes(
        {
          chapterTitle: chapter?.title ?? `Kapitel ${index + 1}`,
          text,
          hint: plans[index]?.summary,
          model,
          language,
        },
        {
          onScene: (scene) => pushDeriveLine(scene.text),
          onPart: (done, total) => {
            if (total > 1) setDeriveLabel(`Szenen · Kapitel ${index + 1} · Teil ${done}/${total}`);
          },
        },
      );
      pendingDeriveRef.current = {
        scenes: [{ index, scenes, title: chapter?.title ?? `Kapitel ${index + 1}` }],
      };
      setDerivePreview({
        kind: "scenes",
        entries: [
          {
            index,
            title: chapter?.title ?? `Kapitel ${index + 1}`,
            scenes,
            before: currentSceneState(index),
          },
        ],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      resetDerive();
      setBusy(null);
    }
  };

  /** Szenen für **alle** Kapitel ableiten — als Job im Job-Center (Abbruch zwischen Kapiteln). */
  const runDeriveAllScenes = async () => {
    const targets = manuscriptRef.current
      .map((chapter, index) => ({ index, chapter }))
      .filter(({ chapter }) => (chapter.expanded || chapter.draft).trim().length > 0);
    if (targets.length === 0) {
      setError("Kein Manuskript-Text vorhanden — es gibt nichts abzuleiten.");
      return;
    }

    let model: string;
    try {
      model = structureModel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
      return;
    }

    setError(null);
    const jobId = createJob({
      title: `${book.title}: Szenen ableiten`,
      kind: "scenes",
      total: targets.length,
    });
    // Nur noch gelesen (Kapiteltext und Hinweis) — geschrieben wird erst nach der Vorschau.
    const currentManuscript = manuscriptRef.current;
    const currentPlans = structurePlans();
    let failure: string | null = null;
    /** Alle Kapitel-Ergebnisse sammeln — geschrieben wird erst nach der gemeinsamen Vorschau. */
    const collected: { index: number; scenes: DerivedScene[]; title: string }[] = [];

    for (const [position, { index }] of targets.entries()) {
      if (isCancelled(jobId)) break;
      const chapter = currentManuscript[index];
      updateJob(jobId, { done: position, label: `Kapitel ${index + 1}` });
      setBusy(`Szenen ${position + 1}/${targets.length} · Kapitel ${index + 1}…`);
      setDeriveText("");
      setDeriveLabel(`Szenen · Kapitel ${index + 1}/${targets.length}`);
      try {
        const scenes = await streamDeriveScenes(
          {
            chapterTitle: chapter?.title ?? `Kapitel ${index + 1}`,
            text: (chapter?.expanded || chapter?.draft || "").trim(),
            hint: currentPlans[index]?.summary,
            model,
            language,
          },
          {
            onScene: (scene) => pushDeriveLine(scene.text),
            onPart: (done, total) => {
              if (total > 1) {
                setDeriveLabel(`Szenen · Kapitel ${index + 1} · Teil ${done}/${total}`);
              }
            },
          },
        );
        collected.push({ index, scenes, title: chapter?.title ?? `Kapitel ${index + 1}` });
        updateJob(jobId, { done: position + 1, detail: `${scenes.length} Szenen` });
      } catch (err) {
        failure = err instanceof Error ? err.message : "Unbekannter Fehler.";
        setError(`${failure} (abgebrochen bei Kapitel ${index + 1})`);
        break;
      }
    }

    resetDerive();
    if (isCancelled(jobId)) {
      finishJob(jobId, "cancelled", `${book.title}: Szenen-Ableitung abgebrochen`);
    } else if (failure) {
      finishJob(jobId, "error", failure);
    } else {
      updateJob(jobId, { done: targets.length });
      finishJob(jobId, "done", `${targets.length} Kapitel in Szenen gegliedert — Vorschau offen`);
      // Erst jetzt die gemeinsame Vorschau: Was gefunden wurde, bleibt auch dann erhalten, wenn
      // der Nutzer nur einen Teil übernehmen will.
      pendingDeriveRef.current = { scenes: collected };
      setDerivePreview({
        kind: "scenes",
        entries: collected.map((entry) => ({
          ...entry,
          before: currentSceneState(entry.index),
        })),
      });
    }
    setBusy(null);
  };

  /**
   * Timeline-Prüfung, gestreamt: Befunde erscheinen live im Dialog. `onFinding` reicht sie
   * sofort hoch; das zurückgegebene (normalisierte) Ergebnis ersetzt am Ende die Live-Liste.
   */
  const runTimelineCheck = async (handlers: {
    onFinding: (finding: TimelineFinding) => void;
  }): Promise<TimelineResult> => {
    if (!book.storyboard) {
      throw new Error("Kein Storyboard vorhanden — Timeline-Prüfung nicht möglich.");
    }
    return streamTimelineCheck(
      {
        storyboard: book.storyboard,
        scenesByChapter: manuscript.map((_, index) => scenesFor(index)),
        model: timelineModel(),
        language,
        canon,
      },
      { onFinding: handlers.onFinding },
    );
  };

  /** Baut aus einem (validierten **oder** live eingetroffenen) Fix die Vorschau-Änderung. */
  const toTimelineChanges = (
    fixes: TimelineRepairFix[],
    scenesByChapter: SceneConstraint[][],
  ): TimelineRepairChange[] => {
    const changes: TimelineRepairChange[] = [];
    for (const fix of fixes) {
      const chapterIndex = fix.chapter - 1;
      const chapter = manuscriptRef.current[chapterIndex];
      if (!chapter) continue;
      const scenes: TimelineSceneChange[] = [];
      for (const sceneFix of fix.scenes) {
        const sceneIndex = sceneFix.scene - 1;
        const current = scenesByChapter[chapterIndex]?.[sceneIndex];
        if (!current) continue;
        const change: TimelineSceneChange = { sceneIndex };
        if (sceneFix.time !== undefined) {
          change.timeBefore = current.time;
          change.timeAfter = sceneFix.time;
        }
        if (sceneFix.setting !== undefined) {
          change.settingBefore = current.setting;
          change.settingAfter = sceneFix.setting;
        }
        if (sceneFix.text !== undefined) {
          change.textBefore = current.text;
          change.textAfter = sceneFix.text;
        }
        scenes.push(change);
      }
      if (scenes.length > 0) {
        changes.push({
          chapterIndex,
          title: chapter.title || `Kapitel ${chapterIndex + 1}`,
          note: fix.note,
          scenes,
        });
      }
    }
    return changes;
  };

  /**
   * Timeline-Quick-Fix: Der Server korrigiert die **Struktur** (Szenen-Zeit/Schauplatz/Text) —
   * genau die Daten, die die Prüfung liest. Hier wird **nichts** geschrieben: der Dialog zeigt
   * daraus die Vorschau (live füllend); erst `applyTimelineRepairs` übernimmt bestätigte Kapitel.
   */
  const runTimelineRepair = async (
    findings: TimelineFinding[],
    handlers: { onChapter: (change: TimelineRepairChange) => void },
  ): Promise<TimelineRepairChange[]> => {
    if (!book.storyboard) {
      throw new Error("Kein Storyboard vorhanden — Timeline-Korrektur nicht möglich.");
    }
    const scenesByChapter = manuscriptRef.current.map((_, index) => scenesFor(index));
    const result = await streamTimelineRepair(
      {
        storyboard: book.storyboard,
        scenesByChapter,
        findings,
        model: timelineModel(),
        language,
        canon,
      },
      {
        onChapter: (fix) => {
          const [change] = toTimelineChanges([fix], scenesByChapter);
          if (change) handlers.onChapter(change);
        },
      },
    );

    if (result.notes.length > 0) showToast(result.notes[0]!, "info");
    return toTimelineChanges(result.fixes, scenesByChapter);
  };

  /**
   * Übernimmt die bestätigten Korrekturen: Szenen-Zeiten/Schauplätze landen in `sceneMeta`,
   * geänderte Szenen-Texte ersetzen den Beat im Storyboard. Beides in **einem** Commit.
   *
   * Bewusst **kein** Versions-Snapshot: `ChapterVersion` speichert nur `draft`/`expanded`, hier
   * ändert sich aber die Struktur (`sceneMeta`, Beats) — ein Eintrag „vor Timeline-Korrektur"
   * würde nichts von der Änderung enthalten und eine Rückholbarkeit vortäuschen, die es nicht
   * gibt. Die Sicherung ist die Diff-Vorschau vor dem Übernehmen.
   */
  const applyTimelineRepairs = (changes: TimelineRepairChange[]) => {
    if (changes.length === 0) return;
    const nextManuscript = manuscriptRef.current.map((chapter) => ({ ...chapter }));
    const nextPlans = plans.map((plan) => ({ ...plan, beats: [...plan.beats] }));
    let touched = 0;

    for (const change of changes) {
      const chapter = nextManuscript[change.chapterIndex];
      const plan = nextPlans[change.chapterIndex];
      if (!chapter || !plan) continue;
      const sceneMeta = [...(chapter.sceneMeta ?? [])];

      for (const scene of change.scenes) {
        // sceneMeta ist parallel zur Beat-Liste — fehlende Slots defensiv auffüllen.
        while (sceneMeta.length <= scene.sceneIndex) sceneMeta.push({});
        const meta = { ...sceneMeta[scene.sceneIndex] };
        if (scene.timeAfter !== undefined) meta.time = scene.timeAfter;
        if (scene.settingAfter !== undefined) meta.setting = scene.settingAfter;
        sceneMeta[scene.sceneIndex] = meta;
        if (scene.textAfter !== undefined) plan.beats[scene.sceneIndex] = scene.textAfter;
      }

      nextManuscript[change.chapterIndex] = { ...chapter, sceneMeta };
      touched += 1;
    }

    if (touched === 0) return;
    manuscriptRef.current = nextManuscript;
    commit(nextManuscript, nextPlans);
  };

  /** Kapitel mit Text — nur die lohnt der Fakten-Check. */
  const canonChapters = useMemo(
    () =>
      manuscript
        .map((chapter, index) => ({
          index,
          title: chapter.title || `Kapitel ${index + 1}`,
          text: (chapter.expanded || chapter.draft || "").trim(),
        }))
        .filter((entry) => entry.text.length > 0),
    [manuscript],
  );
  /** Ziel des Checks: alle Kapitel oder nur eines (Einzelkapitel-Button). */
  const checkChapters = useMemo(
    () =>
      canonOnly === null
        ? canonChapters
        : canonChapters.filter((entry) => entry.index === canonOnly),
    [canonChapters, canonOnly],
  );
  const canonCheckChapters = useMemo(
    () => checkChapters.map(({ index, title }) => ({ index, title })),
    [checkChapters],
  );

  /** Modell der Kohärenz-Stufe (wird auch für Check und Korrektur genutzt). */
  const canonModel = (): string => {
    const model = readStageModel("consistency");
    if (!model.trim()) {
      throw new Error(
        "Bitte eine Model-ID für „Kohärenz“ in den Einstellungen eintragen (der Fakten-Check nutzt sie).",
      );
    }
    return model;
  };

  /** Gestreamter Check über alle Kapitel für den gewählten Umfang: Ergebnisse kommen live zurück. */
  const runCanonCheckStream = async (
    handlers: CanonStreamHandlers,
    scope: CanonScopeSelection,
  ): Promise<void> => {
    if (!book.storyboard) {
      throw new Error("Kein Storyboard vorhanden — Fakten-Check nicht möglich.");
    }
    const block = canonForScope(scope);
    if (!block) throw new Error("Der gewählte Umfang enthält keine prüfbaren Fakten.");
    await streamCanonCheck(
      {
        storyboard: book.storyboard,
        chapters: checkChapters.map(({ index, text }) => ({ index, text })),
        canon: block,
        model: canonModel(),
        language,
      },
      handlers,
    );
  };

  /**
   * Quick Fix (gestreamt): korrigiert die markierten Widersprüche und liefert die **Änderungen**
   * zurück, statt sie sofort zu schreiben — der Dialog zeigt daraus die Diff-Vorschau. Die
   * **Nachprüfung** macht der Server im selben Lauf und liefert das frische Ergebnis mit zurück.
   */
  const runCanonRepairMany = async (
    targets: { chapterIndex: number; violations: CanonViolation[] }[],
    callbacks: {
      onStarted: (chapterIndex: number) => void;
      onResult: (event: CanonRepairResultEvent) => void;
    },
    scope: CanonScopeSelection,
  ): Promise<CanonRepairChange[]> => {
    if (!book.storyboard) {
      throw new Error("Kein Storyboard vorhanden — Fakten-Check nicht möglich.");
    }
    const block = canonForScope(scope) ?? canon;
    if (!block) {
      throw new Error("Kein Kanon vorhanden — bitte zuerst Fakten oder Beziehungen erfassen.");
    }
    const model = canonModel();

    const chapters = targets.map((target) => {
      const text = (
        manuscript[target.chapterIndex]?.expanded ||
        manuscript[target.chapterIndex]?.draft ||
        ""
      ).trim();
      if (!text) throw new Error(`Kapitel ${target.chapterIndex + 1} hat keinen Text.`);
      return { index: target.chapterIndex, text, violations: target.violations };
    });

    const changes: CanonRepairChange[] = [];
    await streamCanonRepair(
      { storyboard: book.storyboard, canon: block, model, language, chapters },
      {
        onStarted: callbacks.onStarted,
        onResult: (event) => {
          if (event.text && event.changed) {
            const chapter = manuscriptRef.current[event.chapterIndex];
            changes.push({
              chapterIndex: event.chapterIndex,
              title: chapter?.title ?? "",
              before: (chapter?.expanded || chapter?.draft || "").trim(),
              after: event.text,
              applied: event.applied ?? 0,
              unassigned: event.unassigned ?? 0,
            });
          }
          if (event.unassigned && event.unassigned > 0) {
            showToast(
              `Kapitel ${event.chapterIndex + 1}: ${event.unassigned} Stelle(n) konnten nicht sicher zugeordnet werden`,
              "info",
            );
          }
          callbacks.onResult(event);
        },
      },
    );
    return changes;
  };

  /** Schreibt die bestätigten Korrekturen (Snapshot je Kapitel) in **einem** Commit ins Buch. */
  const applyCanonRepairs = (changes: CanonRepairChange[]) => {
    if (changes.length === 0) return;
    const patches = new Map<number, Partial<ChapterContent>>();
    for (const change of changes) {
      const chapter = manuscriptRef.current[change.chapterIndex];
      if (!chapter) continue;
      const history: ChapterVersion[] = [
        {
          at: new Date().toISOString(),
          title: chapter.title,
          draft: chapter.draft,
          expanded: chapter.expanded,
          note: "vor Fakten-Korrektur",
        },
        ...(chapter.history ?? []),
      ].slice(0, HISTORY_MAX_ENTRIES);
      patches.set(change.chapterIndex, { expanded: change.after, history });
    }
    patchChapters(patches);
  };

  /** Schreibt das Ergebnis eines Checks in die Prüf-Historie des Kapitels. */
  const recordCanonCheck = (chapterIndex: number, result: CanonCheckResult, scope: string) => {
    const chapter = manuscriptRef.current[chapterIndex];
    if (!chapter) return;
    const text = (chapter.expanded || chapter.draft || "").trim();
    patchChapters(
      new Map([
        [
          chapterIndex,
          {
            canonCheck: {
              at: new Date().toISOString(),
              ok: result.ok && result.violations.length === 0,
              count: result.violations.length,
              summary: result.summary,
              scope,
              hash: textHash(text),
            },
          },
        ],
      ]),
    );
  };

  /**
   * Kanon-Warnung beim Kapitelwechsel: prüft das **verlassene** Kapitel still gegen den Kanon
   * und warnt bei Widersprüchen. Bewusst **nicht blockierend** — ein blockierendes Autosave
   * würde offenen Text verlieren (stiller Datenverlust wäre schlimmer). Unveränderte Kapitel
   * kosten nichts (Hash-Vergleich + Antwort-Cache).
   */
  const prevIndexRef = useRef(safeIndex);
  useEffect(() => {
    const previous = prevIndexRef.current;
    prevIndexRef.current = safeIndex;
    if (previous === safeIndex) return;
    if (!readCanonWarn() || !canon || !book.storyboard) return;
    const model = readStageModel("consistency");
    if (!model.trim()) return;

    const chapter = manuscriptRef.current[previous];
    if (!chapter) return;
    const buffered =
      previous === bufferIndexRef.current
        ? expandedBufferRef.current || draftBufferRef.current
        : chapter.expanded || chapter.draft || "";
    const text = buffered.trim();
    if (!text || chapter.canonCheck?.hash === textHash(text)) return;

    let cancelled = false;
    void (async () => {
      try {
        const result = await checkCanon({
          storyboard: book.storyboard as NonNullable<typeof book.storyboard>,
          chapterIndex: previous,
          text,
          canon,
          model,
          language,
        });
        if (cancelled) return;
        recordCanonCheck(previous, result, "Gesamter Kanon");
        if (!result.ok && result.violations.length > 0) {
          setCanonWarn({
            chapterIndex: previous,
            violations: result.violations,
            scope: "Gesamter Kanon",
          });
        }
      } catch {
        // Die Warnung ist ein Bonus, kein Blocker — Fehler bewusst still.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeIndex]);

  const timelineEntries: TimelineEntry[] = manuscript.map((chapter, index) => ({    chapter: index + 1,
    title: chapter.title || `Kapitel ${index + 1}`,
    scenes: (plans[index]?.beats ?? []).map((text, sceneIndex) => ({
      text,
      time: chapter.sceneMeta?.[sceneIndex]?.time,
      setting: chapter.sceneMeta?.[sceneIndex]?.setting,
      pov: chapter.sceneMeta?.[sceneIndex]?.pov,
    })),
  }));

  const openBackCover = async () => {
    setCoverTarget("back");
    if (book.coverBackUrl || !book.storyboard) {
      setCoverEditorOpen(true);
      return;
    }
    setError(null);
    setBusy("Back-Cover wird generiert…");
    try {
      const url = await generateCover({
        prompt: `${buildCoverPrompt(book.storyboard)}, minimalist back cover composition, single focal element, no text`,
      });
      onUpdate({ ...book, coverBackUrl: url });
      setCoverEditorOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Back-Cover fehlgeschlagen.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Zurück zur Bibliothek
        </button>

        <div className="flex items-center gap-2">
          {onSeriesChange ? (
            <button
              type="button"
              onClick={() => setSeriesOpen(true)}
              title={
                mySeries
                  ? `Reihe „${mySeries.name}" — ${mySeries.volumeIds.length} Bände`
                  : "Als Band einer Reihe führen"
              }
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors",
                mySeries
                  ? "border-brand-indigo/40 bg-brand-indigo/10 text-brand-indigo"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground",
              )}
            >
              <Layers className="size-3.5" />
              {mySeries ? `${mySeries.name} · ${volumeLabel(mySeries, book.id)}` : "Reihe"}
            </button>
          ) : null}

          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => setMode("edit")}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                mode === "edit" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Pencil className="size-3.5" />
              Editor
            </button>
            <button
              type="button"
              onClick={() => setMode("read")}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                mode === "read" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <BookText className="size-3.5" />
              Reader
            </button>
          </div>
        </div>
      </div>

      <Panel className="mb-6 overflow-hidden p-0">
        <div className="grid gap-0 md:grid-cols-[200px_minmax(0,1fr)]">
          <div
            className="relative hidden min-h-[180px] items-end bg-cover bg-center p-5 md:flex"
            style={{
              backgroundImage: book.coverUrl
                ? `url(${book.coverUrl})`
                : `linear-gradient(150deg, ${book.coverFrom}, ${book.coverTo})`,
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
            <span className="absolute -bottom-6 left-5 select-none text-[110px] font-black leading-none text-white/20">
              {book.title.charAt(0)}
            </span>
            <span className="relative z-10 rounded-lg bg-black/30 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur">
              {book.genre}
            </span>
          </div>

          <div className="p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                  status.chip,
                )}
              >
                <span className={cn("size-1.5 rounded-full", status.dot)} />
                {status.label}
              </span>
              <span className="text-[11px] text-muted-foreground">
                bearbeitet {timeAgo(book.updatedAt)}
              </span>
            </div>

            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{book.title}</h1>
            <p className="text-sm text-muted-foreground">{book.subtitle}</p>

            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Wörter</p>
                <p className="text-lg font-bold">{totalWords.toLocaleString("de-DE")}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Kapitel</p>
                <p className="text-lg font-bold">
                  {book.chaptersDone}/{manuscript.length || book.chapters}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Ziel</p>
                <p className="text-lg font-bold">{book.goalWords.toLocaleString("de-DE")}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Fortschritt
                </p>
                <p className="text-lg font-bold text-brand-cyan">{progress} %</p>
              </div>
            </div>

            <div className="mt-4">
              <ProgressBar value={progress} tone={book.status === "published" ? "emerald" : "cyan"} />
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-4">
              <div className="w-44">
                <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                  Ziel-Wörter pro Kapitel (Projekt)
                </label>
                <Input
                  type="number"
                  min={EXPAND_MIN_WORDS}
                  max={EXPAND_MAX_WORDS}
                  step={250}
                  value={book.defaultTargetWords ?? EXPAND_DEFAULT_WORDS}
                  onChange={(event) =>
                    onUpdate({
                      ...book,
                      defaultTargetWords: Math.max(
                        EXPAND_MIN_WORDS,
                        Math.min(
                          EXPAND_MAX_WORDS,
                          Number.parseInt(event.target.value, 10) || EXPAND_DEFAULT_WORDS,
                        ),
                      ),
                      updatedAt: new Date().toISOString(),
                    })
                  }
                  className="glass h-9 rounded-lg border-white/10 text-sm"
                />
              </div>
              <p className="pb-2 text-[11px] text-muted-foreground">
                Vorgabe für alle Kapitel ohne eigene Ziel-Wörter.
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {book.storyboard ? (
                <Button
                  variant="outline"
                  className="glass rounded-xl border-white/10"
                  onClick={() => void regenerateCover()}
                  disabled={Boolean(busy)}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ImageIcon className="size-4" />
                  )}
                  {book.coverUrl ? "Cover neu" : "Cover generieren"}
                </Button>
              ) : null}
              {book.coverUrl ? (
                <Button
                  variant="outline"
                  className="glass rounded-xl border-white/10"
                  onClick={() => {
                    setCoverTarget("front");
                    setCoverEditorOpen(true);
                  }}
                  disabled={Boolean(busy)}
                >
                  <Type className="size-4" />
                  Cover-Text
                </Button>
              ) : null}
              {book.storyboard ? (
                <Button
                  variant="outline"
                  className="glass rounded-xl border-white/10"
                  onClick={() => setCoverVariantsOpen(true)}
                  disabled={Boolean(busy)}
                  title="Mehrere Cover-Entwürfe generieren und auswählen"
                >
                  <Layers className="size-4" />
                  Varianten
                </Button>
              ) : null}
              {book.storyboard ? (
                <Button
                  variant="outline"
                  className="glass rounded-xl border-white/10"
                  onClick={() => void openBackCover()}
                  disabled={Boolean(busy)}
                  title="Back-Cover generieren und beschriften"
                >
                  <ImageIcon className="size-4" />
                  Back-Cover
                  {book.coverBackUrl ? (
                    <img
                      src={book.coverBackUrl}
                      alt="Back-Cover"
                      className="ml-1 h-6 w-4 rounded object-cover"
                    />
                  ) : null}
                </Button>
              ) : null}
              <Button
                variant="outline"
                className="glass rounded-xl border-white/10"
                onClick={() => void runDeriveStoryboard()}
                disabled={Boolean(busy) || !hasManuscriptText}
                title="Titel, Genre, Logline, Synopsis, Figuren und Kapitel-Kurzfassungen aus dem Manuskript ableiten (für importierte Bücher)"
              >
                <Sparkles className="size-4" />
                Storyboard ableiten
              </Button>
              <Button
                variant="outline"
                className="glass rounded-xl border-white/10"
                onClick={() => void runDeriveAllScenes()}
                disabled={Boolean(busy) || !hasManuscriptText}
                title="Alle Kapitel in Szenen gliedern (Beats mit Zeit, Schauplatz und POV) — läuft als Job im Job-Center"
              >
                <ListTree className="size-4" />
                Szenen ableiten
              </Button>
              <Button
                variant="outline"
                className="glass rounded-xl border-white/10"
                onClick={() => setTimelineOpen(true)}
                disabled={Boolean(busy) || !book.storyboard}
                title="Zeitangaben der Szenen gegen die Kapitelreihenfolge prüfen"
              >
                <Hourglass className="size-4" />
                Timeline prüfen
              </Button>
              <Button
                variant="outline"
                className="glass rounded-xl border-white/10"
                onClick={() => {
                  setCanonOnly(null);
                  setCanonCheckOpen(true);
                }}
                disabled={Boolean(busy) || !book.storyboard}
                title="Alle Kapitel nur gegen den Kanon prüfen (Fakten und Beziehungen)"
              >
                <ShieldCheck className="size-4" />
                Fakten-Check
              </Button>
              <Button
                variant="outline"
                className="glass rounded-xl border-white/10"
                onClick={() => setAssistantOpen(true)}
                disabled={Boolean(busy) || !book.storyboard}
                title="Assistent öffnen — Pipeline-Schritte erneut durchlaufen und speichern"
              >
                <Wand2 className="size-4" />
                Assistent
              </Button>
              <Button
                variant="outline"
                className="glass rounded-xl border-white/10"
                onClick={() => void copyManuscript()}
              >
                <Copy className="size-4" />
                Manuskript kopieren
              </Button>
              <Button
                variant="outline"
                className="glass rounded-xl border-white/10"
                onClick={() => {
                  if (isDirty) flushBuffer(safeIndex);
                  downloadBlob(
                    new Blob([buildManuscriptText()], { type: "text/plain" }),
                    `${fileSafe(book.title)}_manuskript.txt`,
                  );
                  showToast(".txt exportiert");
                }}
              >
                <Download className="size-4" />
                .txt exportieren
              </Button>
              <Select value={exportScope} onValueChange={setExportScope}>
                <SelectTrigger size="sm" className="glass w-44 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="glass-strong border-white/10">
                  <SelectItem value="all">Export: Gesamtbuch</SelectItem>
                  <SelectItem value="act:1">Export: Akt I</SelectItem>
                  <SelectItem value="act:2">Export: Akt II</SelectItem>
                  <SelectItem value="act:3">Export: Akt III</SelectItem>
                  <SelectItem value="chapter">Export: Dieses Kapitel</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                className="glass rounded-xl border-white/10"
                onClick={exportMarkdown}
              >
                <FileText className="size-4" />
                Markdown
              </Button>
              <Button
                variant="outline"
                className="glass rounded-xl border-white/10"
                onClick={() => void exportEpub()}
                disabled={Boolean(busy)}
              >
                <BookText className="size-4" />
                EPUB
              </Button>
              <Button
                variant="outline"
                className="glass rounded-xl border-white/10"
                onClick={exportDocx}
              >
                <FileText className="size-4" />
                DOCX
              </Button>
              <Button
                variant="outline"
                className="glass rounded-xl border-white/10"
                onClick={exportPdf}
              >
                <FileText className="size-4" />
                PDF
              </Button>
              <Select
                value={epubCover}
                onValueChange={(value) => setEpubCover(value as "front" | "back" | "none")}
              >
                <SelectTrigger size="sm" className="glass w-40 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="glass-strong border-white/10">
                  <SelectItem value="front">EPUB-Cover: Front</SelectItem>
                  <SelectItem value="back">EPUB-Cover: Back</SelectItem>
                  <SelectItem value="none">EPUB-Cover: keins</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                className="glass rounded-xl border-white/10 text-brand-rose hover:text-brand-rose"
                onClick={() => {
                  if (window.confirm(`„${book.title}“ inkl. Manuskript löschen?`)) onDelete(book.id);
                }}
              >
                <Trash2 className="size-4" />
                Löschen
              </Button>
            </div>

            {(book.coverVariants?.length ?? 0) > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Cover-Kandidaten ({book.coverVariants?.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {(book.coverVariants ?? []).map((url) => (
                    <div
                      key={url}
                      className="group relative overflow-hidden rounded-lg border border-white/10"
                    >
                      <img src={url} alt="Cover-Kandidat" className="block h-24 w-auto" />
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/65 px-1.5 py-1 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdate({
                              ...book,
                              coverUrl: url,
                              coverVariants: (book.coverVariants ?? []).filter((item) => item !== url),
                            })
                          }
                          className="rounded bg-brand-cyan/90 px-1.5 py-0.5 text-[10px] font-semibold text-black"
                        >
                          Als Cover
                        </button>
                        <button
                          type="button"
                          title="Kandidat löschen"
                          onClick={() => {
                            void deleteCover(url);
                            onUpdate({
                              ...book,
                              coverVariants: (book.coverVariants ?? []).filter((item) => item !== url),
                            });
                          }}
                          className="rounded p-0.5 text-white transition-colors hover:text-brand-rose"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </Panel>

      {error ? (
        <div className="mb-4 rounded-xl border border-brand-rose/30 bg-brand-rose/10 px-3 py-2 text-sm text-brand-rose">
          {error}
        </div>
      ) : null}

      {busy ? (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-brand-cyan/20 bg-brand-cyan/5 px-4 py-3 text-sm text-brand-cyan">
          <Loader2 className="size-4 animate-spin" />
          {busy}
        </div>
      ) : null}

      {/* Live-Vorschau der Struktur-Ableitung (Storyboard/Szenen treffen einzeln ein). */}
      <StreamPreview
        text={deriveText}
        label={deriveLabel}
        showWords={false}
        className="mb-4"
        render={(text) => (
          <ul className="space-y-0.5">
            {text
              .split("\n")
              .filter(Boolean)
              .map((line, index) => (
                <li key={index} className="truncate">
                  • {line}
                </li>
              ))}
          </ul>
        )}
      />

      {timelineOpen ? (
        <TimelineDialog
          open={timelineOpen}
          entries={timelineEntries}
          onCheck={runTimelineCheck}
          onRepair={runTimelineRepair}
          onApplyRepairs={applyTimelineRepairs}
          onClose={() => setTimelineOpen(false)}
        />
      ) : null}

      {canonCheckOpen ? (
        <CanonCheckDialog
          open={canonCheckOpen}
          chapters={canonCheckChapters}
          canonAvailable={Boolean(canon)}
          scopes={canonScopes}
          facts={canonFacts}
          onStreamCheck={runCanonCheckStream}
          onRepairMany={runCanonRepairMany}
          onApplyRepairs={applyCanonRepairs}
          onRecordCheck={recordCanonCheck}
          onClose={() => {
            setCanonCheckOpen(false);
            setCanonOnly(null);
          }}
        />
      ) : null}

      {versionDiffOpen && selected ? (
        <VersionDiffDialog
          open={versionDiffOpen}
          chapter={selected}
          onClose={() => setVersionDiffOpen(false)}
        />
      ) : null}

      {assistantOpen && book.storyboard ? (
        <BookWizard
          open={assistantOpen}
          editing={book}
          existingCount={(books ?? []).length}
          series={series ?? []}
          books={books ?? []}
          characters={characters}
          worlds={worlds ?? []}
          facts={facts ?? []}
          relations={relations ?? []}
          onClose={() => setAssistantOpen(false)}
          onCreate={(updated) => onUpdate(updated)}
          onWordsWritten={onWordsWritten}
        />
      ) : null}

      {canonWarn ? (
        <div
          className="fixed inset-0 z-[65] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
          onClick={() => setCanonWarn(null)}
        >
          <div
            className="glass-strong float-in flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3 border-b border-white/10 p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-amber to-brand-rose text-white">
                <ShieldAlert className="size-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight">Kanon-Warnung</h2>
                <p className="text-xs text-muted-foreground">
                  Kapitel {canonWarn.chapterIndex + 1} widerspricht dem Kanon ·{" "}
                  {canonWarn.scope}. Der Text wurde gespeichert — du entscheidest, ob du das
                  behebst.
                </p>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-5">
              {canonWarn.violations.map((violation, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-brand-amber/25 bg-brand-amber/5 p-2.5"
                >
                  <p className="text-[11px] font-semibold text-brand-amber">{violation.fact}</p>
                  <p className="mt-1 text-xs italic text-foreground/85">„{violation.quote}“</p>
                  {violation.fix ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">{violation.fix}</p>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-white/10 p-4">
              <Button
                variant="outline"
                className="glass rounded-lg border-white/10"
                onClick={() => setCanonWarn(null)}
              >
                Ausblenden
              </Button>
              <Button
                className="rounded-lg bg-gradient-to-r from-brand-emerald to-brand-cyan font-semibold text-white"
                onClick={() => {
                  setCanonWarn(null);
                  setCanonOnly(canonWarn.chapterIndex);
                  setCanonCheckOpen(true);
                }}
              >
                <ShieldCheck className="size-3.5" />
                Fakten-Check öffnen
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {onSeriesChange ? (
        <SeriesDialog
          open={seriesOpen}
          book={book}
          series={series ?? []}
          books={books ?? []}
          onSeriesChange={onSeriesChange}
          onClose={() => setSeriesOpen(false)}
        />
      ) : null}

      {manuscript.length === 0 && mode === "edit" ? (
        <Panel className="p-5">
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <BookOpen className="size-6 text-muted-foreground" />
            <p className="font-medium">Noch keine Kapitel</p>
            <p className="text-sm text-muted-foreground">
              Lege ein Kapitel an oder erstelle ein Buch über den Wizard.
            </p>
            <Button
              onClick={addChapter}
              className="rounded-xl bg-gradient-to-r from-brand-violet to-brand-indigo px-5 font-semibold text-white"
            >
              <Plus className="size-4" />
              Kapitel hinzufügen
            </Button>
          </div>
        </Panel>
      ) : mode === "read" ? (
        <Panel className="p-6 sm:p-10">
          <div className="mb-4 flex justify-end">
            <Button
              variant="outline"
              className="glass rounded-xl border-white/10"
              onClick={() => window.print()}
            >
              <Printer className="size-4" />
              Drucken
            </Button>
          </div>
          <article className="print-area mx-auto max-w-2xl">
            <header className="mb-12 text-center">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{book.title}</h1>
              <p className="mt-2 text-muted-foreground">{book.subtitle}</p>
              <p className="mt-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {totalWords.toLocaleString("de-DE")} Wörter · {manuscript.length} Kapitel
              </p>
            </header>

            {manuscript.map((chapter, index) => {
              const text = chapter.expanded || chapter.draft;
              const paragraphs = toParagraphs(text);
              return (
                <section key={index} className="mb-14">
                  <h2 className="mb-6 font-serif text-xl font-semibold sm:text-2xl">
                    Kapitel {index + 1}
                    {chapter.title && chapter.title !== `Kapitel ${index + 1}`
                      ? `: ${chapter.title}`
                      : ""}
                  </h2>
                  {paragraphs.length > 0 ? (
                    paragraphs.map((paragraph, pIndex) => (
                      <p
                        key={pIndex}
                        className="mb-4 font-serif text-lg leading-relaxed text-foreground/90"
                      >
                        {paragraph}
                      </p>
                    ))
                  ) : (
                    <p className="font-serif italic text-muted-foreground">
                      Dieses Kapitel ist noch leer.
                    </p>
                  )}
                </section>
              );
            })}
          </article>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Panel className="h-fit p-4 xl:sticky xl:top-6">
            <div className="mb-3 flex items-center justify-between">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <FileText className="size-3.5" />
                {manuscript.length} Kapitel
              </p>
              <button
                type="button"
                onClick={addChapter}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                <Plus className="size-3" />
                Neu
              </button>
            </div>
            <div className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
              {manuscript.map((chapter, index) => {
                const statusMeta = chapterStatus(chapter);
                const words = countWords(chapter.expanded || chapter.draft);
                const isActive = index === safeIndex;
                return (
                  <div
                    key={index}
                    onDragOver={(event) => {
                      if (dragIndex === null) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDragOver(index);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const raw = event.dataTransfer.getData("text/plain");
                      const from = Number.parseInt(raw, 10);
                      if (Number.isFinite(from)) reorderChapter(from, index);
                      setDragIndex(null);
                      setDragOver(null);
                    }}
                    onDragLeave={() => setDragOver((prev) => (prev === index ? null : prev))}
                    className={cn(
                      "group rounded-lg px-2 py-2 transition-colors",
                      isActive ? "bg-white/10" : "hover:bg-white/5",
                      dragIndex === index && "opacity-50",
                      dragOver === index && dragIndex !== null && dragIndex !== index &&
                        "ring-1 ring-brand-cyan/60",
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        draggable
                        onDragStart={(event) => {
                          setDragIndex(index);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", String(index));
                        }}
                        onDragEnd={() => {
                          setDragIndex(null);
                          setDragOver(null);
                        }}
                        title="Ziehen zum Sortieren"
                        className="shrink-0 cursor-grab rounded p-1 text-muted-foreground/50 transition-colors hover:text-foreground active:cursor-grabbing"
                      >
                        <GripVertical className="size-3.5" />
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedIndex(index)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span
                          className={cn(
                            "flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold",
                            isActive
                              ? "bg-gradient-to-br from-brand-violet to-brand-cyan text-white"
                              : "bg-white/10 text-foreground/70",
                          )}
                        >
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{chapter.title}</span>
                          <span className="block text-[10px] text-muted-foreground">
                            {words > 0 ? `${words} Wörter` : "leer"}
                            {(plans[index]?.beats.length ?? 0) > 0
                              ? ` · ${plans[index]?.beats.length} Szenen`
                              : ""}
                          </span>
                        </span>
                      </button>
                      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <button
                          type="button"
                          onClick={() => removeChapter(index)}
                          className="rounded p-1 text-muted-foreground transition-colors hover:text-brand-rose"
                          title="Löschen"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-8">
                      <span
                        className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold",
                          statusMeta.className,
                        )}
                      >
                        {statusMeta.label}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold",
                          chapter.consistencyChecked
                            ? "border-brand-violet/30 bg-brand-violet/10 text-brand-violet"
                            : "border-white/10 bg-white/5 text-muted-foreground/40",
                        )}
                      >
                        Kohärenz
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold",
                          chapter.styleChecked
                            ? "border-brand-rose/30 bg-brand-rose/10 text-brand-rose"
                            : "border-white/10 bg-white/5 text-muted-foreground/40",
                        )}
                      >
                        Stil
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold",
                          chapter.canonCheck
                            ? chapter.canonCheck.ok
                              ? "border-brand-emerald/30 bg-brand-emerald/10 text-brand-emerald"
                              : "border-brand-amber/30 bg-brand-amber/10 text-brand-amber"
                            : "border-white/10 bg-white/5 text-muted-foreground/40",
                        )}
                        title={
                          chapter.canonCheck
                            ? `Fakten-Check: ${chapter.canonCheck.summary || "geprüft"} (${new Date(
                                chapter.canonCheck.at,
                              ).toLocaleString("de-DE")})`
                            : "Noch kein Fakten-Check"
                        }
                      >
                        {chapter.canonCheck
                          ? chapter.canonCheck.ok
                            ? "Fakten ✓"
                            : `Fakten ${chapter.canonCheck.count}`
                          : "Fakten"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <div className="min-w-0 space-y-4">
            {selected ? (
              <Panel className="p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-violet to-brand-cyan text-xs font-bold text-white">
                      {safeIndex + 1}
                    </span>
                    <Input
                      value={selected.title}
                      onChange={(event) => updateChapter(safeIndex, { title: event.target.value })}
                      className="glass h-9 w-64 rounded-lg border-white/10"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="glass rounded-lg border-white/10"
                      onClick={() => void runDraft(safeIndex)}
                      disabled={Boolean(busy)}
                    >
                      <Sparkles className="size-3.5" />
                      Rohentwurf
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="glass rounded-lg border-white/10"
                      onClick={() => void runExpand(safeIndex)}
                      disabled={Boolean(busy)}
                    >
                      <ScrollText className="size-3.5" />
                      Ausbauen
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="glass rounded-lg border-white/10"
                      onClick={() => void runPass("consistency", safeIndex)}
                      disabled={Boolean(busy) || !selected.expanded.trim()}
                      title="Logik & Kontinuität prüfen und korrigieren"
                    >
                      <ShieldCheck className="size-3.5" />
                      Kohärenz
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="glass rounded-lg border-white/10"
                      onClick={() => void runPass("style", safeIndex)}
                      disabled={Boolean(busy) || !selected.expanded.trim()}
                      title="Satzbau & Sprachgebrauch polieren"
                    >
                      <Sparkles className="size-3.5" />
                      Stil
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="glass rounded-lg border-white/10"
                      onClick={() => {
                        setCanonOnly(safeIndex);
                        setCanonCheckOpen(true);
                      }}
                      disabled={Boolean(busy) || !canon || !selected.expanded.trim()}
                      title="Dieses Kapitel nur gegen den Kanon prüfen (Fakten und Beziehungen)"
                    >
                      <ShieldCheck className="size-3.5" />
                      Fakten-Check
                    </Button>

                    <span className="hidden h-6 w-px self-center bg-white/10 sm:block" />

                    <Button
                      size="sm"
                      variant="outline"
                      className="glass rounded-lg border-white/10"
                      onClick={() => void runAllExpand()}
                      disabled={Boolean(busy) || pendingExpandCount === 0}
                      title={
                        pendingExpandCount === 0
                          ? "Alle Kapitel sind bereits ausgebaut"
                          : `${pendingExpandCount} offene Kapitel ausbauen`
                      }
                    >
                      <Layers className="size-3.5" />
                      Alles ausbauen{pendingExpandCount > 0 ? ` (${pendingExpandCount})` : ""}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="glass rounded-lg border-white/10"
                      onClick={() => void runAllPasses("consistency")}
                      disabled={Boolean(busy) || pendingConsistency === 0}
                      title={
                        pendingConsistency === 0
                          ? "Alle Kapitel sind kohärenzgeprüft"
                          : `${pendingConsistency} offene Kapitel prüfen`
                      }
                    >
                      <ShieldCheck className="size-3.5" />
                      Alle Kohärenz{pendingConsistency > 0 ? ` (${pendingConsistency})` : ""}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="glass rounded-lg border-white/10"
                      onClick={() => void runAllPasses("style")}
                      disabled={Boolean(busy) || pendingStyle === 0}
                      title={
                        pendingStyle === 0
                          ? "Alle Kapitel sind stilgeprüft"
                          : `${pendingStyle} offene Kapitel prüfen`
                      }
                    >
                      <Sparkles className="size-3.5" />
                      Alle Stil{pendingStyle > 0 ? ` (${pendingStyle})` : ""}
                    </Button>
                  </div>
                </div>

                <div className="mb-4 flex flex-wrap items-end gap-4">
                  <div className="w-40">
                    <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                      Ziel-Wörter
                    </label>
                    <Input
                      type="number"
                      min={EXPAND_MIN_WORDS}
                      max={EXPAND_MAX_WORDS}
                      step={250}
                      value={chapterTargetWords(selected, book.defaultTargetWords)}
                      onChange={(event) =>
                        updateChapter(safeIndex, {
                          targetWords: Math.max(
                            EXPAND_MIN_WORDS,
                            Math.min(
                              EXPAND_MAX_WORDS,
                              Number.parseInt(event.target.value, 10) || EXPAND_DEFAULT_WORDS,
                            ),
                          ),
                        })
                      }
                      className="glass h-9 rounded-lg border-white/10 text-sm"
                    />
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Ist: {(countWords(selected.expanded) || 0).toLocaleString("de-DE")} Wörter ·{" "}
                    {Math.round(
                      ((countWords(selected.expanded) || 0) /
                        chapterTargetWords(selected, book.defaultTargetWords)) *
                        100,
                    )}{" "}
                    %
                  </div>
                </div>

                <div className="mb-4">
                  <label className="mb-1.5 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                    <Users className="size-3.5" />
                    Figuren in diesem Kapitel
                  </label>
                  {sceneCharacters.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {sceneCharacters.map((group) => {
                        const active = group.ids.some((id) =>
                          (selected.characterIds ?? []).includes(id),
                        );
                        return (
                          <button
                            key={group.ids[0] ?? group.name}
                            type="button"
                            onClick={() => toggleChapterCharacterGroup(safeIndex, group.ids)}
                            title={
                              group.ids.length > 1
                                ? `${group.ids.length} gleichnamige Einträge im Register werden gemeinsam geschaltet`
                                : undefined
                            }
                            className={cn(
                              "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                              active
                                ? "border-brand-cyan/40 bg-brand-cyan/10 text-brand-cyan"
                                : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {group.name}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Noch keine Charaktere angelegt.
                    </p>
                  )}
                </div>

                {streamText !== null ? (
                  <StreamPreview text={streamText} label={streamLabel} className="mt-3" />
                ) : null}

                <details open className="mt-1 rounded-xl border border-white/10 bg-white/5 p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                    Kapiteltext (ausgebaut) —{" "}
                    {/* Läuft der Stream zu **diesem** Kapitel, zählt der Kopf schon mit — sonst
                        (Queue im Hintergrund, anderes Kapitel offen) gilt weiter der Buchwert. */}
                    {countWords(
                      streamText !== null && streamChapter === safeIndex ? streamText : expandedBuffer,
                    ).toLocaleString("de-DE")}{" "}
                    Wörter
                    {streamText !== null && streamChapter === safeIndex ? (
                      <span className="ml-2 font-normal text-brand-cyan">live</span>
                    ) : null}
                    {isDirty ? (
                      <span className="ml-2 font-normal text-brand-amber">speichert…</span>
                    ) : (
                      <span className="ml-2 inline-flex items-center gap-1 font-normal opacity-70">
                        <Save className="size-3" />
                        automatisch gespeichert
                      </span>
                    )}
                  </summary>
                  <Textarea
                    rows={18}
                    value={expandedBuffer}
                    onChange={(event) => setExpandedBuffer(event.target.value)}
                    placeholder="Noch nicht ausgebaut …"
                    className="glass mt-3 rounded-xl border-white/10 text-sm leading-relaxed"
                  />
                </details>

                <details className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                    Rohentwurf ({countWords(draftBuffer).toLocaleString("de-DE")} Wörter)
                  </summary>
                  <Textarea
                    rows={5}
                    value={draftBuffer}
                    onChange={(event) => setDraftBuffer(event.target.value)}
                    placeholder="Kein Rohentwurf vorhanden …"
                    className="glass mt-3 rounded-lg border-white/10 text-sm"
                  />
                </details>

                <details className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                    Versionen ({selected.history?.length ?? 0})
                  </summary>
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="glass rounded-lg border-white/10"
                        onClick={() => pushSnapshot(safeIndex, "manuell gespeichert")}
                      >
                        <Save className="size-3.5" />
                        Version speichern
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="glass rounded-lg border-white/10"
                        onClick={() => setVersionDiffOpen(true)}
                        disabled={(selected.history?.length ?? 0) === 0}
                        title="Zwei Fassungen Wort für Wort vergleichen"
                      >
                        <ArrowLeftRight className="size-3.5" />
                        Vergleichen
                      </Button>
                    </div>

                    {(selected.history ?? []).length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">
                        Noch keine Versionen — vor jeder Generierung wird automatisch eine angelegt.
                      </p>
                    ) : (
                      (selected.history ?? []).map((version) => (
                        <div
                          key={version.at}
                          className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[11px] text-foreground/85">
                              {version.note ?? "Version"}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {new Date(version.at).toLocaleString("de-DE")} ·{" "}
                              {countWords(version.expanded || version.draft)} Wörter
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => restoreVersion(safeIndex, version.at)}
                            className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                          >
                            Wiederherstellen
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </details>

                {plan ? (
                  <details className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                      Kapitel-Plan &amp; Foreshadowing
                    </summary>
                    <div className="mt-3 space-y-2 text-sm text-foreground/80">
                      {plan.summary ? (
                        <p>{plan.summary}</p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">Keine Zusammenfassung.</p>
                      )}
                      {plan.foreshadowing.length > 0 ? (
                        <p className="text-[11px] text-brand-violet">
                          Foreshadowing: {plan.foreshadowing.join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  </details>
                ) : null}

                {plan ? (
                  <details open className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                      Szenen ({scenes.length})
                    </summary>
                    <div className="mt-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value=""
                          onValueChange={(value) => {
                            const template = SCENE_TEMPLATES.find((item) => item.id === value);
                            if (!template) return;
                            writeScenes(
                              [...scenes, ...template.scenes],
                              [...sceneChars, ...template.scenes.map(() => [])],
                              [...sceneMetas, ...template.scenes.map(() => ({}))],
                            );
                          }}
                        >
                          <SelectTrigger size="sm" className="glass w-44 border-white/10">
                            <SelectValue placeholder="Vorlage einfügen…" />
                          </SelectTrigger>
                          <SelectContent className="glass-strong border-white/10">
                            {SCENE_TEMPLATES.map((template) => (
                              <SelectItem key={template.id} value={template.id}>
                                {template.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          className="glass h-8 rounded-lg border-white/10 text-xs"
                          onClick={() => void runDeriveScenes(safeIndex)}
                          disabled={
                            Boolean(busy) ||
                            (selected?.expanded || selected?.draft || "").trim().length === 0
                          }
                          title="Szenen dieses Kapitels aus dem Text ableiten (ersetzt die Beat-Liste)"
                        >
                          <Sparkles className="size-3.5" />
                          Szenen ableiten
                        </Button>
                      </div>

                      {scenes.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">
                          Noch keine Szenen — gliedere das Kapitel in Beats.
                        </p>
                      ) : null}

                      {scenes.map((scene, sceneIndex) => (
                        <div
                          key={sceneIndex}
                          className="rounded-lg border border-white/10 bg-white/5 p-2"
                        >
                          <div className="flex items-start gap-2">
                            <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded bg-white/10 text-[10px] font-bold">
                              {sceneIndex + 1}
                            </span>
                            <Textarea
                              rows={2}
                              value={scene}
                              onChange={(event) => setSceneText(sceneIndex, event.target.value)}
                              placeholder="Szene / Beat …"
                              className="glass rounded-lg border-white/10 text-sm"
                            />
                            <div className="flex shrink-0 flex-col gap-0.5">
                              <button
                                type="button"
                                onClick={() => moveScene(sceneIndex, -1)}
                                disabled={sceneIndex === 0}
                                className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                                title="Nach oben"
                              >
                                <ArrowUp className="size-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveScene(sceneIndex, 1)}
                                disabled={sceneIndex === scenes.length - 1}
                                className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                                title="Nach unten"
                              >
                                <ArrowDown className="size-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeScene(sceneIndex)}
                                className="rounded p-1 text-muted-foreground transition-colors hover:text-brand-rose"
                                title="Szene löschen"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                          </div>

                          <div className="mt-1.5 grid grid-cols-2 gap-1.5 pl-7 sm:grid-cols-4">
                            <Input
                              value={sceneMetas[sceneIndex]?.pov ?? ""}
                              onChange={(event) =>
                                setSceneMeta(sceneIndex, { pov: event.target.value })
                              }
                              placeholder="POV"
                              className="glass h-7 rounded-md border-white/10 text-[11px]"
                            />
                            <Input
                              value={sceneMetas[sceneIndex]?.setting ?? ""}
                              onChange={(event) =>
                                setSceneMeta(sceneIndex, { setting: event.target.value })
                              }
                              placeholder="Schauplatz"
                              className="glass h-7 rounded-md border-white/10 text-[11px]"
                            />
                            <Input
                              value={sceneMetas[sceneIndex]?.time ?? ""}
                              onChange={(event) =>
                                setSceneMeta(sceneIndex, { time: event.target.value })
                              }
                              placeholder="Zeit"
                              className="glass h-7 rounded-md border-white/10 text-[11px]"
                            />
                            <Input
                              type="number"
                              min={100}
                              step={100}
                              value={sceneMetas[sceneIndex]?.words ?? ""}
                              onChange={(event) =>
                                setSceneMeta(sceneIndex, {
                                  words: event.target.value
                                    ? Math.max(0, Number.parseInt(event.target.value, 10) || 0)
                                    : undefined,
                                })
                              }
                              placeholder="Wörter"
                              className="glass h-7 rounded-md border-white/10 text-[11px]"
                            />
                          </div>

                          {characters.length > 0 ? (
                            <div className="mt-1.5 flex flex-wrap gap-1 pl-7">
                              {characters.map((character) => {
                                const active = (sceneChars[sceneIndex] ?? []).includes(character.id);
                                return (
                                  <button
                                    key={character.id}
                                    type="button"
                                    onClick={() => toggleSceneCharacter(sceneIndex, character.id)}
                                    className={cn(
                                      "rounded-full border px-1.5 py-0.5 text-[10px] transition-colors",
                                      active
                                        ? "border-brand-violet/40 bg-brand-violet/10 text-brand-violet"
                                        : "border-white/10 bg-white/5 text-muted-foreground/70 hover:text-foreground",
                                    )}
                                  >
                                    {character.name}
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      ))}

                      <Button
                        size="sm"
                        variant="outline"
                        className="glass rounded-lg border-white/10"
                        onClick={addScene}
                      >
                        <Plus className="size-3.5" />
                        Szene hinzufügen
                      </Button>
                    </div>
                  </details>
                ) : null}

                {selected.consistencyChecked || selected.styleChecked || selected.canonCheck ? (
                  <details className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                      Prüfberichte
                    </summary>
                    <div className="mt-3 space-y-3 text-[11px]">
                      {selected.consistencyChecked ? (
                        <div>
                          <p className="mb-1 font-semibold text-brand-violet">Kohärenz &amp; Logik</p>
                          {selected.consistencyNotes ? (
                            <ul className="space-y-0.5">
                              {selected.consistencyNotes
                                .split("\n")
                                .filter(Boolean)
                                .map((note, noteIndex) => (
                                  <li key={noteIndex} className="text-muted-foreground">
                                    • {note}
                                  </li>
                                ))}
                            </ul>
                          ) : (
                            <p className="text-muted-foreground">Keine Auffälligkeiten.</p>
                          )}
                        </div>
                      ) : null}
                      {selected.styleChecked ? (
                        <div>
                          <p className="mb-1 font-semibold text-brand-cyan">Stil &amp; Sprache</p>
                          {selected.styleNotes ? (
                            <ul className="space-y-0.5">
                              {selected.styleNotes
                                .split("\n")
                                .filter(Boolean)
                                .map((note, noteIndex) => (
                                  <li key={noteIndex} className="text-muted-foreground">
                                    • {note}
                                  </li>
                                ))}
                            </ul>
                          ) : (
                            <p className="text-muted-foreground">Keine Auffälligkeiten.</p>
                          )}
                        </div>
                      ) : null}
                      {selected.canonCheck ? (
                        <div>
                          <p className="mb-1 font-semibold text-brand-emerald">
                            Fakten-Check
                            {selected.canonCheck.ok
                              ? ""
                              : ` · ${selected.canonCheck.count} offen`}
                          </p>
                          <p className="text-muted-foreground">
                            {new Date(selected.canonCheck.at).toLocaleString("de-DE")}
                            {selected.canonCheck.scope ? ` · ${selected.canonCheck.scope}` : ""}
                          </p>
                          <p className="mt-0.5 text-muted-foreground">
                            {selected.canonCheck.summary ||
                              (selected.canonCheck.ok
                                ? "Keine Widersprüche zum Kanon."
                                : "Widersprüche zum Kanon offen.")}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </details>
                ) : null}
              </Panel>
            ) : null}

            {book.storyboard ? (
              <Panel className="p-5">
                <p className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <BookOpen className="size-3.5" />
                  Storyboard
                </p>
                <p className="text-sm text-foreground/80">{book.storyboard.logline}</p>
                <p className="mt-2 text-sm text-muted-foreground">{book.storyboard.synopsis}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {book.storyboard.themes.map((theme) => (
                    <span
                      key={theme}
                      className="rounded-full border border-brand-violet/30 bg-brand-violet/10 px-2.5 py-0.5 text-[11px] font-medium text-brand-violet"
                    >
                      {theme}
                    </span>
                  ))}
                </div>
                {book.storyboard.characters.length > 0 ? (
                  <div className="mt-4 space-y-1.5">
                    {book.storyboard.characters.map((character) => (
                      <p key={character.name} className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground/80">{character.name}</span>
                        {character.role ? ` · ${character.role}` : ""}
                      </p>
                    ))}
                  </div>
                ) : null}
              </Panel>
            ) : null}
          </div>
        </div>
      )}

      <CoverEditorDialog
        open={coverEditorOpen}
        imageUrl={coverTarget === "front" ? book.coverUrl : book.coverBackUrl}
        target={coverTarget}
        initialLayers={coverTarget === "front" ? book.coverLayers : book.coverBackLayers}
        defaultTitle={book.title}
        defaultAuthor={authorName}
        onTargetChange={setCoverTarget}
        onClose={() => setCoverEditorOpen(false)}
        onSaved={(url) =>
          onUpdate({
            ...book,
            ...(coverTarget === "front" ? { coverUrl: url } : { coverBackUrl: url }),
          })
        }
        onSaveLayers={(layers) =>
          onUpdate({
            ...book,
            ...(coverTarget === "front" ? { coverLayers: layers } : { coverBackLayers: layers }),
          })
        }
        customPresets={coverPresets}
        onSavePreset={onSaveCoverPreset}
      />

      <CoverVariantsDialog
        open={coverVariantsOpen}
        storyboard={book.storyboard}
        onClose={() => setCoverVariantsOpen(false)}
        onGenerated={(urls) => {
          onUpdate({ ...book, coverVariants: [...urls, ...(book.coverVariants ?? [])] });
          setCoverVariantsOpen(false);
        }}
      />

      <DerivePreviewDialog
        preview={derivePreview}
        onApply={applyDerivePreview}
        onDiscard={() => {
          pendingDeriveRef.current = { scenes: [] };
          setDerivePreview(null);
        }}
      />
    </div>
  );
}

