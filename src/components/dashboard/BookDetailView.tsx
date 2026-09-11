import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  BookText,
  Copy,
  Download,
  FileText,
  Image as ImageIcon,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Printer,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Trash2,
  Type,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { Book } from "@/data/author";
import { STATUS_META, progressOf, timeAgo } from "@/data/author";
import type { Character } from "@/data/characters";
import {
  EXPAND_DEFAULT_WORDS,
  EXPAND_MAX_WORDS,
  EXPAND_MIN_WORDS,
  chapterTargetWords,
  countWords,
  manuscriptWordCount,
  toParagraphs,
} from "@/data/story";
import type { ChapterContent, ChapterPlan } from "@/data/story";
import { MODEL_STAGE_LABELS, readLanguage, readStageModel } from "@/lib/generationSettings";
import { manuscriptOf } from "@/lib/bookManuscript";
import { buildCoverPrompt, generateCover } from "@/services/cover";
import { checkConsistency, draftChapter, expandChapter, refineStyle } from "@/services/story";

import { CoverEditorDialog } from "./CoverEditorDialog";
import { Panel, ProgressBar } from "./primitives";

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

export function BookDetailView({
  book,
  characters,
  initialChapterIndex = 0,
  onBack,
  onUpdate,
  onDelete,
  onWordsWritten,
}: {
  book: Book;
  characters: Character[];
  initialChapterIndex?: number;
  onBack: () => void;
  onUpdate: (book: Book) => void;
  onDelete: (id: string) => void;
  onWordsWritten: (count: number) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(initialChapterIndex);
  const [mode, setMode] = useState<Mode>("edit");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coverEditorOpen, setCoverEditorOpen] = useState(false);

  useEffect(() => {
    setSelectedIndex(initialChapterIndex);
  }, [initialChapterIndex, book.id]);

  const manuscript = useMemo(() => manuscriptOf(book), [book.manuscript, book.storyboard]);
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

  const moveChapter = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= manuscript.length) return;
    const nextManuscript = [...manuscript];
    const nextPlans = [...plans];
    const a = nextManuscript[index];
    const b = nextManuscript[target];
    const pa = nextPlans[index];
    const pb = nextPlans[target];
    if (!a || !b) return;
    nextManuscript[index] = b;
    nextManuscript[target] = a;
    if (pa && pb) {
      nextPlans[index] = pb;
      nextPlans[target] = pa;
    }
    commit(nextManuscript, plans.length > 0 ? nextPlans : undefined);
    setSelectedIndex(target);
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

  const toggleBeatCharacter = (index: number, beatIndex: number, characterId: string) => {
    const chapter = manuscript[index];
    if (!chapter) return;
    const beatCount = plans[index]?.beats.length ?? 0;
    const grid: string[][] = Array.from({ length: Math.max(beatCount, chapter.beatCharacters?.length ?? 0) }, (_, i) => [
      ...(chapter.beatCharacters?.[i] ?? []),
    ]);
    const current = grid[beatIndex] ?? [];
    grid[beatIndex] = current.includes(characterId)
      ? current.filter((id) => id !== characterId)
      : [...current, characterId];
    updateChapter(index, { beatCharacters: grid });
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

    for (let position = 0; position < pending.length; position += 1) {
      const chapterIndex = pending[position] ?? 0;
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
        };
        const result =
          kind === "consistency" ? await checkConsistency(request) : await refineStyle(request);
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
        setError(
          err instanceof Error
            ? `${err.message} (abgebrochen bei Kapitel ${chapterIndex + 1})`
            : "Unbekannter Fehler.",
        );
        break;
      }
    }

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
    try {
      const draft = await draftChapter({
        storyboard: book.storyboard,
        chapterIndex: index,
        model,
        language,
      });
      updateChapter(index, { draft });
      onWordsWritten(countWords(draft));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setBusy(null);
    }
  };

  const targetFor = (chapter: ChapterContent | undefined): number =>
    chapter ? chapterTargetWords(chapter) : EXPAND_DEFAULT_WORDS;

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
    try {
      const request = {
        storyboard: book.storyboard,
        chapterIndex: index,
        model,
        language,
        text: source,
      };
      const result = kind === "consistency" ? await checkConsistency(request) : await refineStyle(request);
      updateChapter(index, {
        expanded: result.text,
        ...(kind === "consistency"
          ? { consistencyNotes: result.notes.join("\n"), consistencyChecked: true }
          : { styleNotes: result.notes.join("\n"), styleChecked: true }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
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
    try {
      const expanded = await expandChapter({
        storyboard: book.storyboard,
        chapterIndex: index,
        model,
        language,
        draft: manuscript[index]?.draft ?? "",
        targetWords: targetFor(manuscript[index]),
      });
      updateChapter(index, { expanded });
      onWordsWritten(countWords(expanded));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
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

    for (let position = 0; position < pending.length; position += 1) {
      const chapterIndex = pending[position] ?? 0;
      setBusy(`Ausbau ${position + 1}/${pending.length} · Kapitel ${chapterIndex + 1}…`);
      try {
        const expanded = await expandChapter({
          storyboard: book.storyboard,
          chapterIndex,
          model,
          language,
          draft: current[chapterIndex]?.draft ?? "",
          targetWords: targetFor(current[chapterIndex]),
        });
        current = current.map((chapter, i) =>
          i === chapterIndex ? { ...chapter, expanded } : chapter,
        );
        // Persist after every chapter so the queue survives a reload/interruption.
        commit(current, plans);
        onWordsWritten(countWords(expanded));
      } catch (err) {
        setError(
          err instanceof Error
            ? `${err.message} (abgebrochen bei Kapitel ${chapterIndex + 1})`
            : "Unbekannter Fehler.",
        );
        break;
      }
    }

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

  const fullText = useMemo(() => {
    const header = `${book.title}\n${book.subtitle}\n\n`;
    const body = manuscript
      .map(
        (chapter, index) =>
          `Kapitel ${index + 1}: ${chapter.title}\n\n${chapter.expanded || chapter.draft}`,
      )
      .join("\n\n— — —\n\n");
    return header + body;
  }, [book.title, book.subtitle, manuscript]);

  const chapterCharacters = (index: number): Character[] => {
    const ids = manuscript[index]?.characterIds ?? [];
    return characters.filter((character) => ids.includes(character.id));
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
                  onClick={() => setCoverEditorOpen(true)}
                  disabled={Boolean(busy)}
                >
                  <Type className="size-4" />
                  Cover-Text
                </Button>
              ) : null}
              <Button
                variant="outline"
                className="glass rounded-xl border-white/10"
                onClick={() => void navigator.clipboard.writeText(fullText)}
              >
                <Copy className="size-4" />
                Manuskript kopieren
              </Button>
              <Button
                variant="outline"
                className="glass rounded-xl border-white/10"
                onClick={() => {
                  const blob = new Blob([fullText], { type: "text/plain" });
                  const url = URL.createObjectURL(blob);
                  const anchor = document.createElement("a");
                  anchor.href = url;
                  anchor.download = `${book.title}_manuskript.txt`;
                  anchor.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download className="size-4" />
                .txt exportieren
              </Button>
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
          <article className="mx-auto max-w-2xl">
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
                const roster = chapterCharacters(index);
                return (
                  <div
                    key={index}
                    className={cn(
                      "group rounded-lg px-2 py-2 transition-colors",
                      isActive ? "bg-white/10" : "hover:bg-white/5",
                    )}
                  >
                    <div className="flex items-center gap-2">
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
                            {roster.length > 0 ? ` · ${roster.length} Figur(en)` : ""}
                          </span>
                        </span>
                      </button>
                      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <button
                          type="button"
                          onClick={() => moveChapter(index, -1)}
                          disabled={index === 0}
                          className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                          title="Nach oben"
                        >
                          <ArrowUp className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveChapter(index, 1)}
                          disabled={index === manuscript.length - 1}
                          className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                          title="Nach unten"
                        >
                          <ArrowDown className="size-3" />
                        </button>
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
                      value={chapterTargetWords(selected)}
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
                      ((countWords(selected.expanded) || 0) / chapterTargetWords(selected)) * 100,
                    )}{" "}
                    %
                  </div>
                </div>

                <div className="mb-4">
                  <label className="mb-1.5 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                    <Users className="size-3.5" />
                    Figuren in diesem Kapitel
                  </label>
                  {characters.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {characters.map((character) => {
                        const active = (selected.characterIds ?? []).includes(character.id);
                        return (
                          <button
                            key={character.id}
                            type="button"
                            onClick={() => toggleChapterCharacter(safeIndex, character.id)}
                            className={cn(
                              "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                              active
                                ? "border-brand-cyan/40 bg-brand-cyan/10 text-brand-cyan"
                                : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {character.name}
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

                <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Kapiteltext (ausgebaut)</span>
                  <span>{countWords(selected.expanded).toLocaleString("de-DE")} Wörter</span>
                </div>
                <Textarea
                  rows={18}
                  value={selected.expanded}
                  onChange={(event) =>
                    updateChapter(safeIndex, { expanded: event.target.value })
                  }
                  placeholder="Noch nicht ausgebaut …"
                  className="glass rounded-xl border-white/10 text-sm leading-relaxed"
                />

                <details className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                    Rohentwurf ({countWords(selected.draft).toLocaleString("de-DE")} Wörter)
                  </summary>
                  <Textarea
                    rows={5}
                    value={selected.draft}
                    onChange={(event) => updateChapter(safeIndex, { draft: event.target.value })}
                    placeholder="Kein Rohentwurf vorhanden …"
                    className="glass mt-3 rounded-lg border-white/10 text-sm"
                  />
                </details>

                {plan ? (
                  <details className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                      Kapitel-Plan, Beats &amp; Foreshadowing
                    </summary>
                    <div className="mt-3 space-y-3 text-sm text-foreground/80">
                      {plan.summary ? <p>{plan.summary}</p> : null}

                      {plan.beats.length > 0 ? (
                        <div className="space-y-2">
                          {plan.beats.map((beat, beatIndex) => {
                            const beatChars = selected.beatCharacters?.[beatIndex] ?? [];
                            return (
                              <div
                                key={beatIndex}
                                className="rounded-lg border border-white/10 bg-white/5 p-2"
                              >
                                <p className="text-xs text-muted-foreground">{beat}</p>
                                {characters.length > 0 ? (
                                  <div className="mt-1.5 flex flex-wrap gap-1">
                                    {characters.map((character) => {
                                      const active = beatChars.includes(character.id);
                                      return (
                                        <button
                                          key={character.id}
                                          type="button"
                                          onClick={() =>
                                            toggleBeatCharacter(safeIndex, beatIndex, character.id)
                                          }
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
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">Keine Beats hinterlegt.</p>
                      )}

                      {plan.foreshadowing.length > 0 ? (
                        <p className="text-[11px] text-brand-violet">
                          Foreshadowing: {plan.foreshadowing.join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  </details>
                ) : null}

                {selected.consistencyChecked || selected.styleChecked ? (
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
        imageUrl={book.coverUrl}
        defaultTitle={book.title}
        onClose={() => setCoverEditorOpen(false)}
        onSaved={(url) => onUpdate({ ...book, coverUrl: url })}
      />
    </div>
  );
}
