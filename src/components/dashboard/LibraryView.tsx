import { useMemo, useState } from "react";
import { Library, Plus, Search } from "lucide-react";

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

import { STATUS_META, STATUS_ORDER, formatNumber } from "@/data/author";
import type { Book, BookStatus } from "@/data/author";
import { seriesOfBook, volumeLabel } from "@/data/series";
import type { Series } from "@/data/series";

import { BookCard } from "./BookCard";
import { EmptyState, ViewHeader } from "./primitives";

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
}: {
  books: Book[];
  series?: Series[];
  onOpenBook: (id: string) => void;
  onDeleteBook: (id: string) => void;
  onCreate: () => void;
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
              onClick={onCreate}
              className="h-10 rounded-xl bg-gradient-to-r from-brand-violet to-brand-indigo px-4 font-semibold text-white shadow-[0_0_30px_-10px_hsl(258_90%_66%/0.95)]"
            >
              <Plus className="size-4" />
              Neues Buch
            </Button>
          </>
        }
      />

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
