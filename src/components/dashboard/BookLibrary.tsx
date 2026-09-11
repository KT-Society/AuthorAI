import { useMemo } from "react";
import { BookMarked, SearchX } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { STATUS_META, STATUS_ORDER } from "@/data/author";
import type { Book, BookStatus } from "@/data/author";

import { BookCard } from "./BookCard";
import { EmptyState, Panel, PanelHeader } from "./primitives";

export type SortKey = "updated" | "title" | "progress" | "words";

const SORT_LABELS: Record<SortKey, string> = {
  updated: "Zuletzt bearbeitet",
  title: "Titel A–Z",
  progress: "Fortschritt",
  words: "Wörter",
};

function progressOf(book: Book): number {
  return book.goalWords > 0 ? book.words / book.goalWords : 0;
}

export function BookLibrary({
  books,
  query,
  status,
  sort,
  onStatusChange,
  onSortChange,
  selectedId,
  onSelect,
  onOpenBook,
  onDeleteBook,
}: {
  books: Book[];
  query: string;
  status: BookStatus | "all";
  sort: SortKey;
  onStatusChange: (status: BookStatus | "all") => void;
  onSortChange: (sort: SortKey) => void;
  selectedId: string;
  onSelect: (id: string) => void;
  onOpenBook: (id: string) => void;
  onDeleteBook: (id: string) => void;
}) {
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

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = books.filter((book) => {
      const matchesStatus = status === "all" || book.status === status;
      const matchesQuery =
        normalized.length === 0 ||
        book.title.toLowerCase().includes(normalized) ||
        book.subtitle.toLowerCase().includes(normalized) ||
        book.genre.toLowerCase().includes(normalized) ||
        book.tags.some((tag) => tag.toLowerCase().includes(normalized));
      return matchesStatus && matchesQuery;
    });

    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "title":
          return a.title.localeCompare(b.title, "de");
        case "progress":
          return progressOf(b) - progressOf(a);
        case "words":
          return b.words - a.words;
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });
  }, [books, query, status, sort]);

  const tabs: { id: BookStatus | "all"; label: string }[] = [
    { id: "all", label: "Alle" },
    ...STATUS_ORDER.map((id) => ({ id, label: STATUS_META[id].label })),
  ];

  return (
    <Panel className="p-5">
      <PanelHeader
        icon={<BookMarked className="size-4" />}
        title="Meine Bibliothek"
        subtitle={`${visible.length} von ${books.length} Projekten`}
        action={
          <Select value={sort} onValueChange={(value) => onSortChange(value as SortKey)}>
            <SelectTrigger size="sm" className="glass border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass-strong border-white/10">
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {SORT_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const isActive = status === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onStatusChange(tab.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200",
                isActive
                  ? "border-transparent bg-gradient-to-r from-brand-violet to-brand-indigo text-white shadow-[0_0_26px_-12px_hsl(258_90%_66%/0.95)]"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20 hover:text-foreground",
              )}
            >
              {tab.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px]",
                  isActive ? "bg-white/20 text-white" : "bg-white/5 text-muted-foreground",
                )}
              >
                {counts[tab.id]}
              </span>
            </button>
          );
        })}
      </div>

      {visible.length > 0 ? (
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {visible.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              selected={book.id === selectedId}
              onSelect={onSelect}
              onOpen={onOpenBook}
              onDelete={onDeleteBook}
            />
          ))}
        </div>
      ) : (
        <div className="mt-5">
          <EmptyState
            icon={<SearchX className="size-6" />}
            title="Keine Projekte gefunden"
            description="Passe Suche oder Filter an — oder leg ein neues Buch an."
          />
        </div>
      )}
    </Panel>
  );
}
