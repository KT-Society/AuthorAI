import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Check,
  Cpu,
  Loader2,
  RefreshCw,
  Ruler,
  Save,
  ScrollText,
  Sparkles,
  Type,
  Wand2,
  X,
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
import {
  FALLBACK_LANGUAGES,
  MODEL_STAGE_LABELS,
  readLanguage,
  readStageModel,
  readStyleProfileHint,
  writeLanguage,
  writeStageModel,
} from "@/lib/generationSettings";
import type { ModelStage } from "@/lib/generationSettings";

import type { Book } from "@/data/author";
import type { Character } from "@/data/characters";
import type { CanonFact, CharacterRelation } from "@/data/continuity";
import type { Series } from "@/data/series";
import { seriesOfBook, volumeLabel } from "@/data/series";
import type { WorldEntry } from "@/data/world";
import { buildSeriesContext } from "@/lib/seriesContext";
import {
  EXPAND_DEFAULT_WORDS,
  EXPAND_MAX_WORDS,
  EXPAND_MIN_WORDS,
  MAX_CHAPTERS,
  MIN_CHAPTERS,
  countWords,
  manuscriptWordCount,
} from "@/data/story";
import type { ChapterContent, Storyboard, WizardStep } from "@/data/story";
import { fetchConfig } from "@/services/generate";
import type { AppConfig } from "@/services/generate";
import { buildCoverPrompt, generateCover } from "@/services/cover";
import { draftChapter, expandChapter, generateStoryboard } from "@/services/story";
import { checkConsistency, refineStyle } from "@/services/story";

import { ProgressBar } from "./primitives";
import { CoverEditorDialog } from "./CoverEditorDialog";

const COVER_PALETTE: [string, string][] = [
  ["hsl(258 90% 62%)", "hsl(342 90% 58%)"],
  ["hsl(186 100% 52%)", "hsl(232 85% 60%)"],
  ["hsl(38 95% 58%)", "hsl(342 90% 58%)"],
  ["hsl(158 84% 42%)", "hsl(186 100% 50%)"],
  ["hsl(232 85% 62%)", "hsl(186 100% 50%)"],
];
const FALLBACK_COVER: [string, string] = ["hsl(258 90% 62%)", "hsl(342 90% 58%)"];

const STEPS: { id: WizardStep; label: string }[] = [
  { id: "idea", label: "Idee" },
  { id: "storyboard", label: "Storyboard" },
  { id: "draft", label: "Rohentwurf" },
  { id: "expand", label: "Ausbau" },
  { id: "consistency", label: "Kohärenz" },
  { id: "style", label: "Stil" },
];

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[äöüß]/g, (char) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" })[char] ?? char)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "buch"
  );
}

export function BookWizard({
  open,
  existingCount,
  series = [],
  books = [],
  characters = [],
  worlds = [],
  facts = [],
  relations = [],
  onClose,
  onCreate,
  onWordsWritten,
}: {
  open: boolean;
  existingCount: number;
  /** Reihen zur Auswahl — ein neuer Band berücksichtigt seine Vorbände. */
  series?: Series[];
  books?: Book[];
  characters?: Character[];
  worlds?: WorldEntry[];
  facts?: CanonFact[];
  relations?: CharacterRelation[];
  onClose: () => void;
  onCreate: (book: Book, seriesId?: string) => void;
  onWordsWritten: (count: number) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [idea, setIdea] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [chapterCount, setChapterCount] = useState("12");
  const [models, setModels] = useState<Record<ModelStage, string>>({
    storyboard: "",
    draft: "",
    expand: "",
  });
  const [language, setLanguage] = useState("German");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [consistencyNotes, setConsistencyNotes] = useState<string[]>([]);
  const [styleNotes, setStyleNotes] = useState<string[]>([]);
  const [consistencyDone, setConsistencyDone] = useState<boolean[]>([]);
  const [styleDone, setStyleDone] = useState<boolean[]>([]);
  const [coverUrl, setCoverUrl] = useState<string | undefined>(undefined);
  const [coverEditorOpen, setCoverEditorOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [targetWords, setTargetWords] = useState(EXPAND_DEFAULT_WORDS);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    setIdea("");
    setSeriesId("");
    setChapterCount("12");
    setStoryboard(null);
    setDrafts([]);
    setExpanded([]);
    setConsistencyNotes([]);
    setStyleNotes([]);
    setConsistencyDone([]);
    setStyleDone([]);
    setCoverUrl(undefined);
    setCoverEditorOpen(false);
    setSaved(false);
    setTargetWords(EXPAND_DEFAULT_WORDS);
    setBusy(null);
    setProgress(null);
    setError(null);
    setModels({
      storyboard: readStageModel("storyboard"),
      draft: readStageModel("draft"),
      expand: readStageModel("expand"),
    });

    fetchConfig().then((data) => {
      if (!data) return;
      setConfig(data);
      setLanguage(readLanguage() ?? data.defaultLanguage ?? "German");
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return;
      if (!saved && storyboard) {
        if (!window.confirm("Ohne Speichern schließen? Änderungen gehen verloren.")) return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, saved, storyboard, onClose]);

  const draftWordCounts = useMemo(() => drafts.map((text) => countWords(text)), [drafts]);
  const expandedWordCounts = useMemo(() => expanded.map((text) => countWords(text)), [expanded]);
  const totalExpandedWords = useMemo(() => expandedWordCounts.reduce((a, b) => a + b, 0), [expandedWordCounts]);

  /**
   * Vorbände der gewählten Reihe: Prosa-Kontext fürs Storyboard und der **Kanon**
   * (Fakten aus der Kontinuitäts-DB + Beziehungen aus dem Beziehungsgraph) für alle Stufen.
   */
  const seriesData = useMemo(() => {
    const entry = series.find((item) => item.id === seriesId);
    if (!entry) return { context: undefined, canon: undefined, bandLabel: "" };
    const built = buildSeriesContext({ series: entry, books, characters, worlds, facts, relations });
    return {
      context: [built.context, built.canon].filter(Boolean).join("\n\n") || undefined,
      canon: built.canon,
      // Das neue Buch wird der nächste Band.
      bandLabel: `Band ${entry.volumeIds.length + 1}`,
    };
  }, [series, seriesId, books, characters, worlds, facts, relations]);

  if (!open) return null;

  const languages = config?.languages?.length ? config.languages : FALLBACK_LANGUAGES;
  const languageOptions = languages.includes(language) ? languages : [language, ...languages];
  const chapters = storyboard?.chapters ?? [];

  const stage: ModelStage =
    stepIndex <= 1
      ? "storyboard"
      : stepIndex === 2
        ? "draft"
        : stepIndex === 3
          ? "expand"
          : stepIndex === 4
            ? "consistency"
            : "style";
  const currentModel = models[stage];

  const requestClose = () => {
    if (!saved && storyboard) {
      if (!window.confirm("Ohne Speichern schließen? Änderungen gehen verloren.")) return;
    }
    onClose();
  };

  const ensureModel = (stageId: ModelStage): string | null => {
    const id = models[stageId].trim();
    if (!id) {
      setError(`Bitte eine Model-ID für „${MODEL_STAGE_LABELS[stageId]}“ eintragen.`);
      return null;
    }
    return id;
  };

  const runStoryboard = async () => {
    const id = ensureModel("storyboard");
    if (!id) return;
    const trimmedIdea = idea.trim();
    if (!trimmedIdea) {
      setError("Bitte eine Buchidee eingeben.");
      return;
    }

    setError(null);
    setBusy("Storyboard wird entworfen…");
    try {
      writeStageModel("storyboard", id);
      writeLanguage(language);
      const count = Math.max(
        MIN_CHAPTERS,
        Math.min(MAX_CHAPTERS, Number.parseInt(chapterCount, 10) || 12),
      );
      const result = await generateStoryboard({
        idea: trimmedIdea,
        model: id,
        language,
        chapters: count,
        seriesContext: seriesData.context,
      });
      setStoryboard(result);
      setDrafts(Array(result.chapters.length).fill(""));
      setExpanded(Array(result.chapters.length).fill(""));
      setConsistencyNotes(Array(result.chapters.length).fill(""));
      setStyleNotes(Array(result.chapters.length).fill(""));
      setConsistencyDone(Array(result.chapters.length).fill(false));
      setStyleDone(Array(result.chapters.length).fill(false));
      setCoverUrl(undefined);
      setStepIndex(1);

      setBusy("Cover wird generiert…");
      try {
        setCoverUrl(await generateCover({ prompt: buildCoverPrompt(result) }));
      } catch (coverErr) {
        console.error("[cover]", coverErr);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setBusy(null);
    }
  };

  const runCover = async () => {
    if (!storyboard) return;
    setError(null);
    setBusy("Cover wird generiert…");
    try {
      setCoverUrl(await generateCover({ prompt: buildCoverPrompt(storyboard) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setBusy(null);
    }
  };

  const runDraft = async (index: number) => {
    const id = ensureModel("draft");
    if (!id || !storyboard) return;
    setError(null);
    setBusy(`Rohentwurf Kapitel ${index + 1}/${chapters.length}…`);
    try {
      const draft = await draftChapter({ storyboard, chapterIndex: index, model: id, language, canon: seriesData.canon });
      setDrafts((prev) => {
        const next = [...prev];
        next[index] = draft;
        return next;
      });
      onWordsWritten(countWords(draft));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setBusy(null);
    }
  };

  const runAllDrafts = async () => {
    const id = ensureModel("draft");
    if (!id || !storyboard) return;
    setError(null);
    const total = chapters.length;
    setProgress({ done: 0, total });
    for (let index = 0; index < total; index += 1) {
      if ((drafts[index] ?? "").trim()) {
        setProgress({ done: index + 1, total });
        continue;
      }
      setBusy(`Rohentwurf ${index + 1}/${total}…`);
      try {
        const draft = await draftChapter({ storyboard, chapterIndex: index, model: id, language, canon: seriesData.canon });
        setDrafts((prev) => {
          const next = [...prev];
          next[index] = draft;
          return next;
        });
        onWordsWritten(countWords(draft));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
        break;
      }
      setProgress({ done: index + 1, total });
    }
    setBusy(null);
    setProgress(null);
  };

  const runExpand = async (index: number) => {
    const id = ensureModel("expand");
    if (!id || !storyboard) return;
    setError(null);
    setBusy(`Ausbau Kapitel ${index + 1}/${chapters.length}…`);
    try {
      const result = await expandChapter({
        storyboard,
        chapterIndex: index,
        model: id,
        language,
        draft: drafts[index] ?? "",
        targetWords,
        canon: seriesData.canon,
      });
      setExpanded((prev) => {
        const next = [...prev];
        next[index] = result;
        return next;
      });
      onWordsWritten(countWords(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setBusy(null);
    }
  };

  const runAllExpand = async () => {
    const id = ensureModel("expand");
    if (!id || !storyboard) return;
    setError(null);
    const total = chapters.length;
    setProgress({ done: 0, total });
    for (let index = 0; index < total; index += 1) {
      if ((expanded[index] ?? "").trim()) {
        setProgress({ done: index + 1, total });
        continue;
      }
      setBusy(`Ausbau ${index + 1}/${total}…`);
      try {
        const result = await expandChapter({
          storyboard,
          chapterIndex: index,
          model: id,
          language,
          draft: drafts[index] ?? "",
          targetWords,
        });
        setExpanded((prev) => {
          const next = [...prev];
          next[index] = result;
          return next;
        });
        onWordsWritten(countWords(result));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
        break;
      }
      setProgress({ done: index + 1, total });
    }
    setBusy(null);
    setProgress(null);
  };

  const runPass = async (kind: "consistency" | "style", index: number) => {
    if (!storyboard) return;
    const id = ensureModel(kind);
    if (!id) return;
    const source = (expanded[index] ?? "").trim();
    if (!source) {
      setError("Dieses Kapitel muss zuerst ausgebaut werden.");
      return;
    }
    setError(null);
    setBusy(`${MODEL_STAGE_LABELS[kind]}-Prüfung Kapitel ${index + 1}…`);
    try {
      const request = { storyboard, chapterIndex: index, model: id, language, text: source, canon: seriesData.canon, styleProfile: readStyleProfileHint() };
      const result = kind === "consistency" ? await checkConsistency(request) : await refineStyle(request);
      setExpanded((prev) => {
        const next = [...prev];
        next[index] = result.text;
        return next;
      });
      const notes = result.notes.join("\n");
      if (kind === "consistency") {
        setConsistencyNotes((prev) => {
          const next = [...prev];
          next[index] = notes;
          return next;
        });
        setConsistencyDone((prev) => {
          const next = [...prev];
          next[index] = true;
          return next;
        });
      } else {
        setStyleNotes((prev) => {
          const next = [...prev];
          next[index] = notes;
          return next;
        });
        setStyleDone((prev) => {
          const next = [...prev];
          next[index] = true;
          return next;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setBusy(null);
    }
  };

  const runAllPasses = async (kind: "consistency" | "style") => {
    if (!storyboard) return;
    const id = ensureModel(kind);
    if (!id) return;
    const doneArray = kind === "consistency" ? consistencyDone : styleDone;
    const pending = storyboard.chapters
      .map((_, index) => index)
      .filter((index) => (expanded[index] ?? "").trim().length > 0 && !doneArray[index]);

    if (pending.length === 0) {
      setError("Keine offenen Kapitel für diesen Schritt.");
      return;
    }

    setError(null);
    const total = pending.length;
    setProgress({ done: 0, total });
    let current = expanded;

    for (let position = 0; position < total; position += 1) {
      const index = pending[position] ?? 0;
      const source = (current[index] ?? "").trim();
      setBusy(`${MODEL_STAGE_LABELS[kind]}-Prüfung ${position + 1}/${total} · Kapitel ${index + 1}…`);
      try {
        const request = { storyboard, chapterIndex: index, model: id, language, text: source, canon: seriesData.canon, styleProfile: readStyleProfileHint() };
        const result =
          kind === "consistency" ? await checkConsistency(request) : await refineStyle(request);
        current = current.map((text, i) => (i === index ? result.text : text));
        setExpanded(current);
        const notes = result.notes.join("\n");
        if (kind === "consistency") {
          setConsistencyNotes((prev) => {
            const next = [...prev];
            next[index] = notes;
            return next;
          });
          setConsistencyDone((prev) => {
            const next = [...prev];
            next[index] = true;
            return next;
          });
        } else {
          setStyleNotes((prev) => {
            const next = [...prev];
            next[index] = notes;
            return next;
          });
          setStyleDone((prev) => {
            const next = [...prev];
            next[index] = true;
            return next;
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
        break;
      }
      setProgress({ done: position + 1, total });
    }

    setBusy(null);
    setProgress(null);
  };

  const renderPassStep = (kind: "consistency" | "style") => {
    if (!storyboard) return null;
    const notesArray = kind === "consistency" ? consistencyNotes : styleNotes;
    const doneArray = kind === "consistency" ? consistencyDone : styleDone;
    const pendingCount = storyboard.chapters.filter(
      (_, index) => (expanded[index] ?? "").trim().length > 0 && !doneArray[index],
    ).length;

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="size-3.5" />
            {kind === "consistency"
              ? "Logik, Kontinuität & Foreshadowing prüfen und korrigieren"
              : "Satzbau, Rhythmus & Sprachgebrauch polieren"}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="glass rounded-lg border-white/10"
            onClick={() => void runAllPasses(kind)}
            disabled={Boolean(busy) || pendingCount === 0}
          >
            <Sparkles className="size-3.5" />
            Alle prüfen{pendingCount > 0 ? ` (${pendingCount})` : ""}
          </Button>
        </div>

        {storyboard.chapters.map((chapter, index) => {
          const words = expandedWordCounts[index] ?? 0;
          const notes = (notesArray[index] ?? "").split("\n").filter(Boolean);
          const done = doneArray[index] ?? false;
          return (
            <div key={index} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="truncate text-sm font-semibold">
                  {index + 1}. {chapter.title}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {words > 0 ? `${words} Wörter` : "leer"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="glass rounded-lg border-white/10"
                    onClick={() => void runPass(kind, index)}
                    disabled={Boolean(busy) || words === 0}
                  >
                    <Sparkles className="size-3.5" />
                    {done ? "Erneut" : "Prüfen"}
                  </Button>
                </div>
              </div>

              {notes.length > 0 ? (
                <ul className="mb-2 space-y-0.5">
                  {notes.map((note, noteIndex) => (
                    <li key={noteIndex} className="text-[11px] text-brand-emerald">
                      • {note}
                    </li>
                  ))}
                </ul>
              ) : done ? (
                <p className="mb-2 text-[11px] text-brand-emerald">Keine Auffälligkeiten.</p>
              ) : (
                <p className="mb-2 text-[11px] text-muted-foreground">
                  {words === 0 ? "Zuerst im Ausbau generieren." : "Noch nicht geprüft."}
                </p>
              )}

              <details className="rounded-lg border border-white/10 bg-white/5 p-2">
                <summary className="cursor-pointer text-[11px] font-semibold text-muted-foreground">
                  Text ansehen &amp; bearbeiten
                </summary>
                <Textarea
                  rows={6}
                  value={expanded[index] ?? ""}
                  onChange={(event) =>
                    setExpanded((prev) => {
                      const next = [...prev];
                      next[index] = event.target.value;
                      return next;
                    })
                  }
                  className="glass mt-2 rounded-lg border-white/10 text-sm"
                />
              </details>
            </div>
          );
        })}
      </div>
    );
  };

  const saveBook = async (mode: "storyboard" | "draft" | "final") => {
    if (!storyboard) return;
    setError(null);
    const gradient = COVER_PALETTE[existingCount % COVER_PALETTE.length] ?? FALLBACK_COVER;
    const manuscript: ChapterContent[] = storyboard.chapters.map((chapter, index) => ({
      index,
      title: chapter.title,
      draft: (drafts[index] ?? "").trim(),
      expanded: (expanded[index] ?? "").trim(),
      consistencyNotes: (consistencyNotes[index] ?? "").trim() || undefined,
      consistencyChecked: consistencyDone[index] ?? false,
      styleNotes: (styleNotes[index] ?? "").trim() || undefined,
      styleChecked: styleDone[index] ?? false,
    }));

    const total = manuscript.length;
    const expandedDone = manuscript.filter((chapter) => chapter.expanded.length > 0).length;
    const draftedDone = manuscript.filter((chapter) => chapter.draft.length > 0).length;

    let finalCover = coverUrl;
    if (!finalCover) {
      setBusy("Cover wird generiert…");
      try {
        finalCover = await generateCover({ prompt: buildCoverPrompt(storyboard) });
        setCoverUrl(finalCover);
      } catch (err) {
        console.error("[cover]", err);
      } finally {
        setBusy(null);
      }
    }

    onCreate({
      id: `${slugify(storyboard.title)}-${Date.now().toString(36)}`,
      title: storyboard.title,
      subtitle: storyboard.subtitle || "Roman",
      genre: storyboard.genre || "Roman",
      status: mode === "final" && total > 0 && expandedDone === total ? "editing" : "draft",
      words: mode === "storyboard" ? 0 : manuscriptWordCount(manuscript),
      goalWords: total * targetWords,
      defaultTargetWords: targetWords,
      chapters: total,
      chaptersDone: mode === "storyboard" ? 0 : expandedDone || draftedDone,
      updatedAt: new Date().toISOString(),
      coverFrom: gradient[0],
      coverTo: gradient[1],
      tags: storyboard.themes.slice(0, 3),
      synopsis: storyboard.synopsis || storyboard.logline,
      coverUrl: finalCover,
      storyboard,
      manuscript,
    }, seriesId || undefined);
    setSaved(true);
    onClose();
  };

  const updateChapter = (index: number, patch: Partial<{ title: string; summary: string }>) => {
    setStoryboard((prev) => {
      if (!prev) return prev;
      const nextChapters = prev.chapters.map((chapter, i) =>
        i === index ? { ...chapter, ...patch } : chapter,
      );
      return { ...prev, chapters: nextChapters };
    });
  };

  const canGoBack = stepIndex > 0 && !busy;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6">
      <div className="glass-strong float-in flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-violet to-brand-cyan text-white">
              <BookOpenCheck className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Buch erstellen</h2>
              <p className="text-xs text-muted-foreground">
                Idee → Storyboard → Rohentwurf → Ausbau
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-lg text-muted-foreground hover:text-foreground"
            onClick={requestClose}
            disabled={Boolean(busy)}
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Generation settings — always visible during the whole wizard */}
        <div className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-white/5 px-5 py-2.5">
          <label className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <Cpu className="size-3.5" />
            Model · {MODEL_STAGE_LABELS[stage]} (OpenRouter)
          </label>
          <Input
            value={currentModel}
            onChange={(event) => {
              const value = event.target.value;
              setModels((prev) => ({ ...prev, [stage]: value }));
              writeStageModel(stage, value);
            }}
            placeholder="OpenRouter Model-ID"
            className="glass h-8 min-w-[200px] flex-1 rounded-lg border-white/10 text-xs"
          />
          <Select
            value={language}
            onValueChange={(value) => {
              setLanguage(value);
              writeLanguage(value);
            }}
          >
            <SelectTrigger size="sm" className="glass w-40 rounded-lg border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass-strong border-white/10">
              {languageOptions.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
          {STEPS.map((step, index) => {
            const done = index < stepIndex;
            const active = index === stepIndex;
            const reachable = index < stepIndex && storyboard !== null && !busy;
            return (
              <button
                key={step.id}
                type="button"
                disabled={!reachable}
                onClick={() => reachable && setStepIndex(index)}
                className={cn(
                  "flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                  active && "bg-white/10 text-foreground",
                  done && "text-brand-emerald",
                  !active && !done && "text-muted-foreground/60",
                  reachable && "hover:bg-white/5",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full border text-[10px]",
                    active && "border-brand-cyan text-brand-cyan",
                    done && "border-brand-emerald/50 bg-brand-emerald/10",
                    !active && !done && "border-white/15",
                  )}
                >
                  {done ? <Check className="size-3" /> : index + 1}
                </span>
                {step.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {busy ? (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-brand-cyan/20 bg-brand-cyan/5 px-4 py-3 text-sm text-brand-cyan">
              <Loader2 className="size-4 animate-spin" />
              {busy}
            </div>
          ) : null}

          {progress ? (
            <div className="mb-4">
              <div className="mb-1.5 flex justify-between text-[11px] text-muted-foreground">
                <span>Fortschritt</span>
                <span>
                  {progress.done}/{progress.total}
                </span>
              </div>
              <ProgressBar value={(progress.done / Math.max(1, progress.total)) * 100} tone="cyan" />
            </div>
          ) : null}

          {error ? (
            <div className="mb-4 rounded-xl border border-brand-rose/30 bg-brand-rose/10 px-3 py-2 text-sm text-brand-rose">
              {error}
            </div>
          ) : null}

          {stepIndex === 0 ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Buchidee *
                </label>
                <Textarea
                  autoFocus
                  rows={6}
                  value={idea}
                  onChange={(event) => setIdea(event.target.value)}
                  placeholder="Beschreibe deine Idee: Prämisse, Hauptfigur, Konflikt, Setting, Ton …"
                  className="glass rounded-xl border-white/10"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Kapitel ({MIN_CHAPTERS}–{MAX_CHAPTERS})
                  </label>
                  <Input
                    type="number"
                    min={MIN_CHAPTERS}
                    max={MAX_CHAPTERS}
                    value={chapterCount}
                    onChange={(event) => setChapterCount(event.target.value)}
                    className="glass h-10 rounded-xl border-white/10"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Reihe (optional)
                  </label>
                  <Select value={seriesId || "none"} onValueChange={(value) => setSeriesId(value === "none" ? "" : value)}>
                    <SelectTrigger className="glass h-10 w-full rounded-xl border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-strong border-white/10">
                      <SelectItem value="none">Keine Reihe — eigenständiges Buch</SelectItem>
                      {series.map((entry) => (
                        <SelectItem key={entry.id} value={entry.id}>
                          {entry.name} · neuer Band {entry.volumeIds.length + 1}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {seriesId ? (
                <div className="rounded-xl border border-brand-indigo/30 bg-brand-indigo/10 px-3 py-2 text-[11px] text-brand-indigo">
                  {seriesData.context ? (
                    <>
                      <strong>{seriesData.bandLabel}</strong> der Reihe „
                      {series.find((entry) => entry.id === seriesId)?.name}" — Storyboard und alle
                      weiteren Stufen berücksichtigen die Vorbände: Handlung, Figuren und
                      Weltenbau werden fortgeführt, der Kanon (Fakten und Beziehungen) gilt
                      verbindlich.
                    </>
                  ) : (
                    <>
                      <strong>{seriesData.bandLabel}</strong> dieser Reihe — es gibt noch keine
                      Vorbände, das Buch eröffnet die Reihe.
                    </>
                  )}
                </div>
              ) : null}

              <p className="text-[11px] text-muted-foreground">
                Model und Sprache stellst du oben ein (frei, OpenRouter) — Keys liest der Server
                aus der Root-<code>.env</code>.
                {config?.tavily === false ? " ⚠️ Tavily-Key fehlt." : ""}
                {config?.openrouter === false ? " ⚠️ OpenRouter-Key fehlt." : ""}
              </p>
            </div>
          ) : null}

          {stepIndex === 1 && storyboard ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/5">
                  {coverUrl ? (
                    <img src={coverUrl} alt="Cover" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                      {busy === "Cover wird generiert…" ? "…" : "—"}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">Cover</p>
                  <p className="text-[11px] text-muted-foreground">
                    Wird auf dem Server erzeugt, dort gespeichert und von dort geladen.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="glass rounded-lg border-white/10"
                      onClick={() => void runCover()}
                      disabled={Boolean(busy)}
                    >
                      <RefreshCw className="size-3.5" />
                      Cover neu generieren
                    </Button>
                    {coverUrl ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="glass rounded-lg border-white/10"
                        onClick={() => setCoverEditorOpen(true)}
                        disabled={Boolean(busy)}
                      >
                        <Type className="size-3.5" />
                        Text hinzufügen
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Titel
                  </label>
                  <Input
                    value={storyboard.title}
                    onChange={(event) =>
                      setStoryboard({ ...storyboard, title: event.target.value })
                    }
                    className="glass h-10 rounded-xl border-white/10"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Untertitel
                  </label>
                  <Input
                    value={storyboard.subtitle}
                    onChange={(event) =>
                      setStoryboard({ ...storyboard, subtitle: event.target.value })
                    }
                    className="glass h-10 rounded-xl border-white/10"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Logline
                </label>
                <Input
                  value={storyboard.logline}
                  onChange={(event) => setStoryboard({ ...storyboard, logline: event.target.value })}
                  className="glass h-10 rounded-xl border-white/10"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Synopsis
                </label>
                <Textarea
                  rows={4}
                  value={storyboard.synopsis}
                  onChange={(event) =>
                    setStoryboard({ ...storyboard, synopsis: event.target.value })
                  }
                  className="glass rounded-xl border-white/10 text-sm"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {storyboard.themes.map((theme) => (
                  <span
                    key={theme}
                    className="rounded-full border border-brand-violet/30 bg-brand-violet/10 px-2.5 py-0.5 text-[11px] font-medium text-brand-violet"
                  >
                    {theme}
                  </span>
                ))}
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {chapters.length} Kapitel
                </p>
                {chapters.map((chapter, index) => (
                  <div key={index} className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center gap-3">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-violet to-brand-cyan text-xs font-bold text-white">
                        {index + 1}
                      </span>
                      <Input
                        value={chapter.title}
                        onChange={(event) => updateChapter(index, { title: event.target.value })}
                        className="glass h-9 flex-1 rounded-lg border-white/10"
                      />
                    </div>
                    <Textarea
                      rows={2}
                      value={chapter.summary}
                      onChange={(event) => updateChapter(index, { summary: event.target.value })}
                      placeholder="Zusammenfassung"
                      className="glass mt-2 rounded-lg border-white/10 text-sm"
                    />
                    {chapter.beats.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {chapter.beats.map((beat, beatIndex) => (
                          <span
                            key={beatIndex}
                            className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {beat}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {stepIndex === 2 && storyboard ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <Ruler className="size-3.5" />
                  Ziel: ~500 Wörter pro Kapitel (Rohversion)
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="glass rounded-lg border-white/10"
                  onClick={() => void runAllDrafts()}
                  disabled={Boolean(busy)}
                >
                  <Wand2 className="size-3.5" />
                  Alle Rohentwürfe generieren
                </Button>
              </div>
              {chapters.map((chapter, index) => {
                const words = draftWordCounts[index] ?? 0;
                return (
                  <div key={index} className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold">
                        {index + 1}. {chapter.title}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">
                          {words > 0 ? `${words} Wörter` : "leer"}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="glass rounded-lg border-white/10"
                          onClick={() => void runDraft(index)}
                          disabled={Boolean(busy)}
                        >
                          <Sparkles className="size-3.5" />
                          {words > 0 ? "Neu" : "Generieren"}
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      rows={5}
                      value={drafts[index] ?? ""}
                      onChange={(event) =>
                        setDrafts((prev) => {
                          const next = [...prev];
                          next[index] = event.target.value;
                          return next;
                        })
                      }
                      placeholder="Noch kein Rohentwurf …"
                      className="glass rounded-lg border-white/10 text-sm"
                    />
                  </div>
                );
              })}
            </div>
          ) : null}

          {stepIndex === 3 && storyboard ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <Ruler className="size-3.5" />
                  Ziel: {targetWords} Wörter · Pacing, Show-don't-tell, Foreshadowing
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={EXPAND_MIN_WORDS}
                    max={EXPAND_MAX_WORDS}
                    step={500}
                    value={targetWords}
                    onChange={(event) =>
                      setTargetWords(
                        Math.max(
                          EXPAND_MIN_WORDS,
                          Math.min(EXPAND_MAX_WORDS, Number.parseInt(event.target.value, 10) || EXPAND_DEFAULT_WORDS),
                        ),
                      )
                    }
                    className="glass h-9 w-28 rounded-lg border-white/10"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="glass rounded-lg border-white/10"
                    onClick={() => void runAllExpand()}
                    disabled={Boolean(busy)}
                  >
                    <ScrollText className="size-3.5" />
                    Alle ausbauen
                  </Button>
                </div>
              </div>

              {chapters.map((chapter, index) => {
                const words = expandedWordCounts[index] ?? 0;
                const draftWords = draftWordCounts[index] ?? 0;
                return (
                  <div key={index} className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold">
                        {index + 1}. {chapter.title}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">
                          {words > 0
                            ? `${words} Wörter`
                            : draftWords > 0
                              ? `Roh: ${draftWords} Wörter`
                              : "leer"}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="glass rounded-lg border-white/10"
                          onClick={() => void runExpand(index)}
                          disabled={Boolean(busy)}
                        >
                          <ScrollText className="size-3.5" />
                          {words > 0 ? "Neu" : "Ausbauen"}
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      rows={6}
                      value={expanded[index] ?? ""}
                      onChange={(event) =>
                        setExpanded((prev) => {
                          const next = [...prev];
                          next[index] = event.target.value;
                          return next;
                        })
                      }
                      placeholder="Noch nicht ausgebaut …"
                      className="glass rounded-lg border-white/10 text-sm"
                    />
                  </div>
                );
              })}
            </div>
          ) : null}
          {stepIndex === 4 && storyboard ? renderPassStep("consistency") : null}
          {stepIndex === 5 && storyboard ? renderPassStep("style") : null}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-5">
          <div className="flex items-center gap-3">
            {canGoBack ? (
                <Button
                  variant="ghost"
                  className="rounded-xl text-muted-foreground hover:text-foreground"
                  onClick={requestClose}
                >
                  Abbrechen
                </Button>
            ) : null}
            {stepIndex > 0 && storyboard ? (
              <span className="text-[11px] text-muted-foreground">
                {totalExpandedWords > 0
                  ? `${totalExpandedWords.toLocaleString("de-DE")} Wörter ausgebaut`
                  : `${chapters.length} Kapitel geplant`}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {stepIndex === 0 ? (
              <Button
                onClick={() => void runStoryboard()}
                disabled={Boolean(busy)}
                className="rounded-xl bg-gradient-to-r from-brand-violet to-brand-indigo px-5 font-semibold text-white shadow-[0_0_30px_-10px_hsl(258_90%_66%/0.95)] disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Storyboard läuft…
                  </>
                ) : (
                  <>
                    <Wand2 className="size-4" />
                    Storyboard erstellen
                  </>
                )}
              </Button>
            ) : null}

            {stepIndex === 1 ? (
              <>
                <Button
                  variant="outline"
                  className="glass rounded-xl border-white/10"
                  onClick={() => void saveBook("storyboard")}
                  disabled={Boolean(busy)}
                >
                  Als Projekt speichern
                </Button>
                <Button
                  onClick={() => setStepIndex(2)}
                  disabled={Boolean(busy)}
                  className="rounded-xl bg-gradient-to-r from-brand-cyan to-brand-indigo px-5 font-semibold text-white shadow-[0_0_30px_-10px_hsl(186_100%_55%/0.95)]"
                >
                  Storyboard freigeben
                  <ArrowRight className="size-4" />
                </Button>
              </>
            ) : null}

            {stepIndex === 2 ? (
              <>
                <Button
                  variant="outline"
                  className="glass rounded-xl border-white/10"
                  onClick={() => void saveBook("draft")}
                  disabled={Boolean(busy)}
                >
                  Buch speichern (Rohentwurf)
                </Button>
                <Button
                  onClick={() => setStepIndex(3)}
                  disabled={Boolean(busy)}
                  className="rounded-xl bg-gradient-to-r from-brand-cyan to-brand-indigo px-5 font-semibold text-white shadow-[0_0_30px_-10px_hsl(186_100%_55%/0.95)]"
                >
                  Rohentwurf freigeben
                  <ArrowRight className="size-4" />
                </Button>
              </>
            ) : null}

            {stepIndex === 3 ? (
              <>
                <Button
                  variant="outline"
                  className="glass rounded-xl border-white/10"
                  onClick={() => void saveBook("draft")}
                  disabled={Boolean(busy)}
                >
                  <Save className="size-4" />
                  Zwischenspeichern
                </Button>
                <Button
                  onClick={() => setStepIndex(4)}
                  disabled={Boolean(busy)}
                  className="rounded-xl bg-gradient-to-r from-brand-cyan to-brand-indigo px-5 font-semibold text-white shadow-[0_0_30px_-10px_hsl(186_100%_55%/0.95)]"
                >
                  Weiter zur Kohärenz
                  <ArrowRight className="size-4" />
                </Button>
              </>
            ) : null}

            {stepIndex === 4 ? (
              <>
                <Button
                  variant="outline"
                  className="glass rounded-xl border-white/10"
                  onClick={() => void saveBook("draft")}
                  disabled={Boolean(busy)}
                >
                  <Save className="size-4" />
                  Zwischenspeichern
                </Button>
                <Button
                  onClick={() => setStepIndex(5)}
                  disabled={Boolean(busy)}
                  className="rounded-xl bg-gradient-to-r from-brand-cyan to-brand-indigo px-5 font-semibold text-white shadow-[0_0_30px_-10px_hsl(186_100%_55%/0.95)]"
                >
                  Weiter zur Stilprüfung
                  <ArrowRight className="size-4" />
                </Button>
              </>
            ) : null}

            {stepIndex === 5 ? (
              <>
                <Button
                  variant="outline"
                  className="glass rounded-xl border-white/10"
                  onClick={() => void saveBook("draft")}
                  disabled={Boolean(busy)}
                >
                  <Save className="size-4" />
                  Zwischenspeichern
                </Button>
                <Button
                  onClick={() => void saveBook("final")}
                  disabled={Boolean(busy)}
                  className="rounded-xl bg-gradient-to-r from-brand-emerald to-brand-cyan px-5 font-semibold text-white shadow-[0_0_30px_-10px_hsl(158_84%_46%/0.95)]"
                >
                  <BookOpenCheck className="size-4" />
                  Buch fertigstellen
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <CoverEditorDialog
        open={coverEditorOpen}
        imageUrl={coverUrl}
        defaultTitle={storyboard?.title}
        onClose={() => setCoverEditorOpen(false)}
        onSaved={(url) => setCoverUrl(url)}
      />
    </div>
  );
}
