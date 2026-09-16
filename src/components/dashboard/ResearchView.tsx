import { useMemo, useState } from "react";
import { Loader2, Plus, Search, Sparkles, Trash2, X } from "lucide-react";

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

import type { Book } from "@/data/author";
import type { ResearchNote } from "@/data/research";
import { timeAgo } from "@/data/author";
import { runResearch } from "@/services/research";
import type { ResearchResult } from "@/services/research";

import { Panel, PanelHeader, ViewHeader } from "./primitives";

type SortKey = "date" | "title";

const SORTS: Record<SortKey, string> = {
  date: "Datum (neueste zuerst)",
  title: "Titel A–Z",
};

export function ResearchView({
  notes,
  books,
  onCreate,
  onDelete,
}: {
  notes: ResearchNote[];
  books: Book[];
  onCreate: (note: ResearchNote) => void;
  onDelete: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [bookFilter, setBookFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("date");
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [answer, setAnswer] = useState("");
  const [results, setResults] = useState<ResearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [source, setSource] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [dialogBookId, setDialogBookId] = useState("none");

  const bookTitle = (id?: string) => books.find((book) => book.id === id)?.title;

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = notes.filter((note) => {
      const matchesBook = bookFilter === "all" || note.bookId === bookFilter;
      const matchesQuery =
        normalized.length === 0 ||
        note.title.toLowerCase().includes(normalized) ||
        note.content.toLowerCase().includes(normalized) ||
        note.tags.some((tag) => tag.toLowerCase().includes(normalized));
      return matchesBook && matchesQuery;
    });
    // "Datum (neueste zuerst)" entspricht der bisherigen Reihenfolge: neue Notizen werden vorn
    // eingefügt. Der Titel-Sort liefert eine feste alphabetische Sicht.
    return [...filtered].sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title, "de");
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [notes, query, bookFilter, sort]);

  const newId = () => `research-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const search = async () => {
    const term = searchQuery.trim();
    if (!term) return;
    setSearching(true);
    setError(null);
    setAnswer("");
    setResults([]);
    try {
      const data = await runResearch(term, 5);
      setAnswer(data.answer);
      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setSearching(false);
    }
  };

  const saveResult = (result: ResearchResult) => {
    onCreate({
      id: newId(),
      bookId: undefined,
      title: result.title || searchQuery.trim() || "Recherche",
      content: result.content,
      source: result.url,
      tags: ["Tavily"],
      createdAt: new Date().toISOString(),
    });
  };

  const openNew = () => {
    setTitle("");
    setContent("");
    setSource("");
    setTagsInput("");
    setDialogBookId("none");
    setDialogOpen(true);
  };

  const submit = () => {
    if (!title.trim()) return;
    onCreate({
      id: newId(),
      bookId: dialogBookId === "none" ? undefined : dialogBookId,
      title: title.trim(),
      content: content.trim(),
      source: source.trim() || undefined,
      tags: tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      createdAt: new Date().toISOString(),
    });
    setDialogOpen(false);
  };

  return (
    <div>
      <ViewHeader
        eyebrow="Recherche"
        title="Recherche"
        subtitle={`${notes.length} Notizen · Tavily-Suche direkt im Projekt`}
        actions={
          <Button
            onClick={openNew}
            className="h-10 rounded-xl bg-gradient-to-r from-brand-violet to-brand-indigo px-4 font-semibold text-white shadow-[0_0_30px_-10px_hsl(258_90%_66%/0.95)]"
          >
            <Plus className="size-4" />
            Neue Notiz
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel className="p-5">
          <PanelHeader
            icon={<Search className="size-4" />}
            title="Notizen"
            subtitle={`${visible.length} von ${notes.length}`}
          />

          <div className="mt-4 flex flex-wrap gap-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Notizen durchsuchen…"
                className="glass h-9 rounded-lg pl-9"
              />
            </div>
            <Select value={bookFilter} onValueChange={setBookFilter}>
              <SelectTrigger size="sm" className="glass w-48 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="glass-strong border-white/10">
                <SelectItem value="all">Alle Projekte</SelectItem>
                {books.map((book) => (
                  <SelectItem key={book.id} value={book.id}>
                    {book.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
              <SelectTrigger size="sm" className="glass w-48 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="glass-strong border-white/10">
                {(Object.keys(SORTS) as SortKey[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {SORTS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-4 space-y-3">
            {visible.length === 0 ? (
              <p className="rounded-lg border border-dashed border-white/10 px-3 py-8 text-center text-xs text-muted-foreground">
                Keine Notizen gefunden.
              </p>
            ) : (
              visible.map((note) => (
                <div
                  key={note.id}
                  className="group rounded-xl border border-white/10 bg-white/5 p-3 transition-colors hover:border-white/20"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{note.title}</p>
                    <button
                      type="button"
                      onClick={() => onDelete(note.id)}
                      className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-brand-rose group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/80">
                    {note.content}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                    {bookTitle(note.bookId) ? <span>{bookTitle(note.bookId)}</span> : null}
                    {note.source ? (
                      <a
                        href={note.source}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-brand-cyan hover:underline"
                      >
                        {note.source}
                      </a>
                    ) : null}
                    <span>{timeAgo(note.createdAt)}</span>
                    {note.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel className="h-fit p-5 xl:sticky xl:top-6">
          <PanelHeader
            icon={<Sparkles className="size-4" />}
            title="Tavily-Suche"
            subtitle="Antwort + Quellen"
          />

          <div className="mt-4 flex gap-2">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void search();
              }}
              placeholder="Recherchefrage…"
              className="glass h-9 rounded-lg"
            />
            <Button
              size="sm"
              onClick={() => void search()}
              disabled={searching}
              className="h-9 rounded-lg bg-gradient-to-r from-brand-cyan to-brand-indigo px-4 font-semibold text-white"
            >
              {searching ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            </Button>
          </div>

          {error ? (
            <p className="mt-3 rounded-lg border border-brand-rose/30 bg-brand-rose/10 px-3 py-2 text-xs text-brand-rose">
              {error}
            </p>
          ) : null}

          {answer ? (
            <p className="mt-3 rounded-lg border border-brand-cyan/20 bg-brand-cyan/5 px-3 py-2 text-[13px] leading-relaxed text-foreground/85">
              {answer}
            </p>
          ) : null}

          <div className="mt-3 space-y-2">
            {results.map((result, index) => (
              <div key={index} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-xs font-semibold">{result.title}</p>
                <p className="mt-1 line-clamp-4 text-[11px] leading-relaxed text-muted-foreground">
                  {result.content}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  {result.url ? (
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-[10px] text-brand-cyan hover:underline"
                    >
                      {result.url}
                    </a>
                  ) : (
                    <span />
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="glass h-7 shrink-0 rounded-md border-white/10 text-[11px]"
                    onClick={() => saveResult(result)}
                  >
                    Als Notiz
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

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
              <h2 className="text-lg font-semibold tracking-tight">Neue Notiz</h2>
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
                    Projekt
                  </label>
                  <Select value={dialogBookId} onValueChange={setDialogBookId}>
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
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Quelle (URL)
                  </label>
                  <Input
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                    className="glass h-10 rounded-xl border-white/10"
                  />
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
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Inhalt</label>
                <Textarea
                  rows={5}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
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
