import { useMemo, useState } from "react";
import {
  Globe2,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
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

import type { Book } from "@/data/author";
import type { StoryWorld } from "@/data/story";
import { WORLD_CATEGORIES, entriesFromStoryWorld, entryFromWorldItem } from "@/data/world";
import type { WorldCategory, WorldEntry } from "@/data/world";
import { readLanguage, readStageModel } from "@/lib/generationSettings";
import { showToast } from "@/lib/toast";
import { dedupeWorldEntries, findMatchingEntry, normalizeWorldTitle } from "@/lib/worldMatch";
import { streamWorldExtract } from "@/services/story";

import { Badge, EmptyState, Panel, ViewHeader } from "./primitives";
import { WORLD_CATEGORY_TONE, WorldExtractDialog } from "./WorldExtractDialog";
import type { WorldCandidate } from "./WorldExtractDialog";

export function WorldView({
  entries,
  books,
  onCreate,
  onCreateMany,
  onUpdate,
  onDelete,
  onDeleteMany,
}: {
  entries: WorldEntry[];
  books: Book[];
  onCreate: (entry: WorldEntry) => void;
  onCreateMany: (entries: WorldEntry[]) => void;
  onUpdate: (entry: WorldEntry) => void;
  onDelete: (id: string) => void;
  onDeleteMany: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<WorldCategory | "all">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deriveBookId, setDeriveBookId] = useState<string>(
    books.find((book) => book.storyboard)?.id ?? books[0]?.id ?? "",
  );
  const [candidates, setCandidates] = useState<WorldCandidate[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [formCategory, setFormCategory] = useState<WorldCategory>("Ort");
  const [bookId, setBookId] = useState("none");
  const [tagsInput, setTagsInput] = useState("");
  const [description, setDescription] = useState("");

  const bookTitle = (id?: string) => books.find((book) => book.id === id)?.title;

  /**
   * Baut Review-Vorschläge aus einem fertigen Welt-Objekt — inklusive Dublettenschutz gegen
   * Vorhandenes und gegen sich selbst. Nur nötig, wenn **nichts** live ankam (das Modell hat
   * statt JSONL ein JSON-Dokument geliefert).
   */
  const buildCandidates = (world: StoryWorld, bookId: string): WorldCandidate[] => {
    const prepared: WorldCandidate[] = [];
    for (const candidate of entriesFromStoryWorld(world, bookId)) {
      const match =
        findMatchingEntry(candidate, entries) ??
        findMatchingEntry(
          candidate,
          prepared.map((item) => item.entry),
        );
      prepared.push(match ? { entry: candidate, similarTo: match.title } : { entry: candidate });
    }
    return prepared;
  };

  const runExtract = async () => {
    const book = books.find((item) => item.id === deriveBookId);
    if (!book?.storyboard) {
      setError("Dieses Projekt hat kein Storyboard — bitte zuerst eines erstellen.");
      return;
    }
    const model = readStageModel("storyboard");
    if (!model.trim()) {
      setError("Bitte eine Model-ID für „Storyboard“ in den Einstellungen eintragen.");
      return;
    }
    setError(null);
    setBusy(true);
    // Dialog sofort öffnen — die Vorschläge wachsen live hinein.
    setCandidates([]);
    const prepared: WorldCandidate[] = [];
    try {
      const knownEntries = entries
        .filter((entry) => (entry.bookId ?? "") === book.id)
        .map((entry) => ({ title: entry.title, category: entry.category }));

      const world = await streamWorldExtract(
        {
          storyboard: book.storyboard,
          model,
          language: readLanguage() ?? "German",
          knownEntries,
        },
        {
          onEntry: (category, item) => {
            const entry = entryFromWorldItem(category, item, book.id);
            if (!entry.title) return;
            // Vorschläge gegen Vorhandenes UND gegen sich selbst prüfen (Dublettenschutz).
            const match =
              findMatchingEntry(entry, entries) ??
              findMatchingEntry(
                entry,
                prepared.map((item) => item.entry),
              );
            prepared.push(match ? { entry, similarTo: match.title } : { entry });
            setCandidates([...prepared]);
          },
        },
      );

      // Abschluss: Der Server hat dedupliziert. Die **live erzeugten** Einträge behalten (so
      // bleiben IDs und damit die Auswahl des Nutzers stabil) und nur die weglassen, die es im
      // validierten Ergebnis nicht mehr gibt.
      const validKeys = new Set(
        entriesFromStoryWorld(world, book.id).map(
          (entry) => `${entry.category}:${normalizeWorldTitle(entry.title)}`,
        ),
      );
      const confirmed = prepared.filter((item) =>
        validKeys.has(`${item.entry.category}:${normalizeWorldTitle(item.entry.title)}`),
      );
      // Nichts live angekommen? Dann aus dem validierten Welt-Objekt bauen.
      const final = prepared.length === 0 ? buildCandidates(world, book.id) : confirmed;

      if (final.length === 0) {
        setCandidates(null);
        setError("Keine neuen Welteneinträge gefunden (alles bereits vorhanden).");
        return;
      }
      setCandidates(final);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
      setCandidates(prepared.length > 0 ? [...prepared] : null);
    } finally {
      setBusy(false);
    }
  };

  const acceptCandidates = (accepted: WorldEntry[]) => {
    if (accepted.length === 0) {
      setCandidates(null);
      return;
    }
    onCreateMany(accepted);
    showToast(
      accepted.length === 1
        ? "1 Welteneintrag übernommen"
        : `${accepted.length} Welteneinträge übernommen`,
    );
    setCandidates(null);
  };

  const removeDuplicates = () => {
    const { kept, removed } = dedupeWorldEntries(entries);
    if (removed.length === 0) {
      setError("Keine Dubletten gefunden.");
      return;
    }
    const confirmed = window.confirm(
      `${removed.length} Dublette${removed.length === 1 ? "" : "n"} entfernen? Es bleiben ${kept.length} Einträge.`,
    );
    if (!confirmed) return;
    onDeleteMany(removed.map((entry) => entry.id));
    showToast(
      removed.length === 1 ? "1 Dublette entfernt" : `${removed.length} Dubletten entfernt`,
    );
  };

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return entries.filter((entry) => {
      const matchesCategory = category === "all" || entry.category === category;
      const matchesQuery =
        normalized.length === 0 ||
        entry.title.toLowerCase().includes(normalized) ||
        entry.description.toLowerCase().includes(normalized) ||
        entry.tags.some((tag) => tag.toLowerCase().includes(normalized));
      return matchesCategory && matchesQuery;
    });
  }, [entries, query, category]);

  const openNew = () => {
    setEditingId(null);
    setTitle("");
    setFormCategory("Ort");
    setBookId("none");
    setTagsInput("");
    setDescription("");
    setDialogOpen(true);
  };

  const openEdit = (entry: WorldEntry) => {
    setEditingId(entry.id);
    setTitle(entry.title);
    setFormCategory(entry.category);
    setBookId(entry.bookId ?? "none");
    setTagsInput(entry.tags.join(", "));
    setDescription(entry.description);
    setDialogOpen(true);
  };

  const submit = () => {
    if (!title.trim()) return;
    const payload: WorldEntry = {
      id: editingId ?? `world-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      title: title.trim(),
      category: formCategory,
      bookId: bookId === "none" ? undefined : bookId,
      description: description.trim(),
      tags: tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      createdAt: new Date().toISOString(),
    };
    if (editingId) onUpdate(payload);
    else onCreate(payload);
    setDialogOpen(false);
  };

  return (
    <div>
      <ViewHeader
        eyebrow="Weltenbau"
        title="Weltenbau"
        subtitle={`${entries.length} Einträge · Orte, Fraktionen, Magie, Artefakte, Lore`}
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Welt durchsuchen…"
                className="glass h-10 w-full rounded-xl pl-9 lg:w-64"
              />
            </div>
            <Button
              onClick={openNew}
              className="h-10 rounded-xl bg-gradient-to-r from-brand-violet to-brand-indigo px-4 font-semibold text-white shadow-[0_0_30px_-10px_hsl(258_90%_66%/0.95)]"
            >
              <Plus className="size-4" />
              Neuer Eintrag
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Select value={deriveBookId} onValueChange={setDeriveBookId}>
          <SelectTrigger size="sm" className="glass w-56 border-white/10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="glass-strong border-white/10">
            {books.map((book) => (
              <SelectItem key={book.id} value={book.id}>
                {book.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          className="glass rounded-lg border-white/10"
          onClick={() => void runExtract()}
          disabled={busy || books.length === 0}
          title="Orte, Fraktionen, Magie, Artefakte und Lore aus dem Storyboard ableiten"
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          Welt aus Storyboard ableiten
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="glass rounded-lg border-white/10"
          onClick={removeDuplicates}
          disabled={entries.length < 2}
          title="Ähnliche Einträge zusammenfassen — behält je Konzept den ersten Eintrag"
        >
          <Wand2 className="size-3.5" />
          Dubletten entfernen
        </Button>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-brand-rose/30 bg-brand-rose/10 px-3 py-2 text-sm text-brand-rose">
          {error}
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategory("all")}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
            category === "all"
              ? "border-transparent bg-gradient-to-r from-brand-violet to-brand-indigo text-white"
              : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground",
          )}
        >
          Alle
          <span className="ml-2 rounded-full bg-white/10 px-1.5 text-[10px]">{entries.length}</span>
        </button>
        {WORLD_CATEGORIES.map((item) => {
          const count = entries.filter((entry) => entry.category === item).length;
          return (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                category === item
                  ? "border-transparent bg-gradient-to-r from-brand-violet to-brand-indigo text-white"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground",
              )}
            >
              {item}
              <span className="ml-2 rounded-full bg-white/10 px-1.5 text-[10px]">{count}</span>
            </button>
          );
        })}
      </div>

      {visible.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {visible.map((entry) => (
            <Panel key={entry.id} className="group flex h-full flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold tracking-tight">{entry.title}</h3>
                  {bookTitle(entry.bookId) ? (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {bookTitle(entry.bookId)}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => openEdit(entry)}
                    className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(entry.id)}
                    className="rounded p-1 text-muted-foreground transition-colors hover:text-brand-rose"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-2">
                <Badge tone={WORLD_CATEGORY_TONE[entry.category]}>{entry.category}</Badge>
              </div>

              <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-foreground/80">
                {entry.description}
              </p>

              {entry.tags.length > 0 ? (
                <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
                  {entry.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </Panel>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Globe2 className="size-6" />}
          title="Noch keine Welteneinträge"
          description="Lege Orte, Fraktionen, Magiesysteme oder Lore an."
        />
      )}

      <WorldExtractDialog
        open={candidates !== null}
        candidates={candidates ?? []}
        running={busy}
        bookTitle={books.find((book) => book.id === deriveBookId)?.title ?? ""}
        onClose={() => setCandidates(null)}
        onAccept={acceptCandidates}
      />

      {dialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setDialogOpen(false)}
        >
          <div
            className="glass-strong float-in w-full max-w-lg rounded-2xl p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-violet to-brand-cyan text-white">
                  <Globe2 className="size-5" />
                </span>
                <h2 className="text-lg font-semibold tracking-tight">
                  {editingId ? "Eintrag bearbeiten" : "Neuer Welteneintrag"}
                </h2>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-lg text-muted-foreground hover:text-foreground"
                onClick={() => setDialogOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Titel</label>
                <Input
                  autoFocus
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="glass h-10 rounded-xl border-white/10"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Kategorie
                  </label>
                  <Select
                    value={formCategory}
                    onValueChange={(value) => setFormCategory(value as WorldCategory)}
                  >
                    <SelectTrigger className="glass h-10 w-full rounded-xl border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-strong border-white/10">
                      {WORLD_CATEGORIES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Projekt
                  </label>
                  <Select value={bookId} onValueChange={setBookId}>
                    <SelectTrigger className="glass h-10 w-full rounded-xl border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-strong border-white/10">
                      <SelectItem value="none">Kein Projekt</SelectItem>
                      {books.map((book) => (
                        <SelectItem key={book.id} value={book.id}>
                          {book.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Tags (Komma-getrennt)
                </label>
                <Input
                  value={tagsInput}
                  onChange={(event) => setTagsInput(event.target.value)}
                  className="glass h-10 rounded-xl border-white/10"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Beschreibung
                </label>
                <Textarea
                  rows={4}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="glass rounded-xl border-white/10 text-sm"
                />
              </div>
            </div>

            <div className="mt-7 flex justify-end gap-3">
              <Button
                variant="ghost"
                className="rounded-xl text-muted-foreground hover:text-foreground"
                onClick={() => setDialogOpen(false)}
              >
                Abbrechen
              </Button>
              <Button
                onClick={submit}
                disabled={title.trim().length === 0}
                className="rounded-xl bg-gradient-to-r from-brand-violet to-brand-indigo px-5 font-semibold text-white disabled:opacity-50"
              >
                Speichern
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
