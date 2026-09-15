import { useMemo, useState } from "react";
import { Layers, Library, Plus, Search, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { STATUS_META, STATUS_ORDER, formatNumber, formatPercent } from "@/data/author";
import type { Book, BookStatus } from "@/data/author";
import { seriesOfBook, volumeLabel } from "@/data/series";
import type { Series } from "@/data/series";
import { seriesOverview } from "@/lib/seriesOverview";

import { BookCard } from "./BookCard";
import { Badge, EmptyState, ProgressBar, ViewHeader } from "./primitives";

type SortKey = "updated" | "title" | "progress" | "words";

const SORTS: Record<SortKey, string> = {
  updated: "Zuletzt bearbeitet",
  title: "Titel A–Z",
  progress: "Fortschritt",
  words: "Wörter",
};

function ratio(book: Book): number {
  return book.goalWords > 0 ? book.words / book.goalWords : 0;
}

export function LibraryView({
  books,
  series = [],
  onOpenBook,
  onDeleteBook,
  onCreate,
  onImport,
}: {
  books: Book[];
  series?: Series[];
  onOpenBook: (id: string) => void;
  onDeleteBook: (id: string) => void;
  onCreate: () => void;
  /** Öffnet den Manuskript-Import (vorhandenes Markdown/Text einlesen). */
  onImport: () => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<BookStatus | "all">("all");
  const [sort, setSort] = useState<SortKey>("updated");

  const counts = useMemo(() => {
    const base: Record<BookStatus | "all", number> = {
      all: books.length,
      idea: 0,
      draft: 0,
      editing: 0,
      published: 0,
    };
    for (const book of books) base[book.status] += 1;
    return base;
  }, [books]);

  const seriesLabelFor = (bookId: string): string | undefined => {
    const entry = seriesOfBook(series, bookId);
    if (!entry) return undefined;
    const label = volumeLabel(entry, bookId);
    return label ? `${entry.name} · ${label}` : entry.name;
  };

  const overviews = useMemo(() => seriesOverview(series, books), [series, books]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = books.filter((book) => {
      const matchesStatus = status === "all" || book.status === status;
      const entry = seriesOfBook(series, book.id);
      const matchesQuery =
        normalized.length === 0 ||
        book.title.toLowerCase().includes(normalized) ||
        book.subtitle.toLowerCase().includes(normalized) ||
        book.genre.toLowerCase().includes(normalized) ||
        (entry?.name.toLowerCase().includes(normalized) ?? false) ||
        book.tags.some((tag) => tag.toLowerCase().includes(normalized));
      return matchesStatus && matchesQuery;
    });

    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "title":
          return a.title.localeCompare(b.title, "de");
        case "progress":
          return ratio(b) - ratio(a);
        case "words":
          return b.words - a.words;
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });
  }, [books, series, query, status, sort]);

  const totalWords = books.reduce((sum, book) => sum + book.words, 0);
  const totalChapters = books.reduce((sum, book) => sum + book.chaptersDone, 0);

  return (
    <div>
      <ViewHeader
        eyebrow="Bibliothek"
        title="Meine Bibliothek"
        subtitle={`${books.length} Projekte · ${formatNumber(totalWords)} Wörter · ${totalChapters} Kapitel`}
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Projekte durchsuchen…"
                className="glass h-10 w-full rounded-xl pl-9 lg:w-64"
              />
            </div>
            <Button
              variant="outline"
              onClick={onImport}
              className="glass h-10 rounded-xl border-white/10 px-4 font-semibold"
              title="Vorhandenes Manuskript (Markdown/Text) als Projekt einlesen"
            >
              <Upload className="size-4" />
              Importieren
            </Button>
            <Button
              onClick={onCreate}
              className="h-10 rounded-xl bg-gradient-to-r from-brand-violet to-brand-indigo px-4 font-semibold text-white shadow-[0_0_30px_-10px_hsl(258_90%_66%/0.95)]"
            >
              <Plus className="size-4" />
              Neues Buch
            </Button>
          </>
        }
      />

      {overviews.length > 0 ? (
        <details open className="mb-5 rounded-2xl border border-white/10 bg-white/5 p-4">
          <summary className="flex cursor-pointer flex-wrap items-center gap-3 text-sm font-semibold">
            <Layers className="size-4 text-brand-indigo" />
            Reihen ({overviews.length})
            <span className="text-[11px] font-normal text-muted-foreground">
              Bände, Fortschritt und Lücken auf einen Blick
            </span>
          </summary>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {overviews.map((overview) => (
              <div key={overview.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold tracking-tight">{overview.name}</span>
                  <Badge tone="indigo">{overview.volumes.length} Bände</Badge>
                  {overview.missing > 0 ? (
                    <Badge tone="rose">
                      {overview.missing} Lücke{overview.missing === 1 ? "" : "n"}
                    </Badge>
                  ) : null}
                  {overview.withoutStoryboard > 0 ? (
                    <Badge tone="amber">{overview.withoutStoryboard} ohne Storyboard</Badge>
                  ) : null}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {formatNumber(overview.totalWords)} Wörter
                  </span>
                </div>

                {overview.description ? (
                  <p className="mb-2 text-[11px] text-muted-foreground">{overview.description}</p>
                ) : null}

                <div className="mb-3 flex items-center gap-2">
                  <ProgressBar
                    value={overview.progress}
                    tone={overview.minProgress >= 100 ? "emerald" : "violet"}
                  />
                  <span className="shrink-0 text-[11px] font-semibold">
                    {formatPercent(overview.progress)}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {overview.volumes.map((volume) => {
                    const book = volume.book;
                    const meta = book ? STATUS_META[book.status] : null;
                    return (
                      <button
                        key={volume.bookId}
                        type="button"
                        disabled={!book}
                        onClick={() => book && onOpenBook(book.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors",
                          book
                            ? "border-white/10 bg-white/5 hover:border-white/20"
                            : "cursor-not-allowed border-dashed border-brand-rose/30 bg-brand-rose/5",
                        )}
                      >
                        <span className="w-14 shrink-0 text-[11px] font-semibold text-muted-foreground">
                          Band {volume.position}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs">
                          {book ? book.title : "(Buch gelöscht)"}
                        </span>
                        {meta ? (
                          <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold", meta.chip)}>
                            {meta.label}
                          </span>
                        ) : null}
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {book ? `${book.chaptersDone}/${book.chapters || "—"}` : "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setStatus("all")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
              status === "all"
                ? "border-transparent bg-gradient-to-r from-brand-violet to-brand-indigo text-white"
                : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground",
            )}
          >
            Alle
            <span className="ml-2 rounded-full bg-white/10 px-1.5 text-[10px]">{counts.all}</span>
          </button>
          {STATUS_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setStatus(id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                status === id
                  ? "border-transparent bg-gradient-to-r from-brand-violet to-brand-indigo text-white"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground",
              )}
            >
              {STATUS_META[id].label}
              <span className="ml-2 rounded-full bg-white/10 px-1.5 text-[10px]">{counts[id]}</span>
            </button>
          ))}
        </div>

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

      {visible.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              selected={false}
              seriesLabel={seriesLabelFor(book.id)}
              onSelect={onOpenBook}
              onOpen={onOpenBook}
              onDelete={onDeleteBook}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Library className="size-6" />}
          title="Keine Projekte gefunden"
          description="Passe Suche oder Filter an — oder erstelle ein neues Buch über den Wizard."
        />
      )}
    </div>
  );
}
