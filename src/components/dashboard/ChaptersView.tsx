import { useMemo, useState } from "react";
import { ListTree, Search } from "lucide-react";

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

import type { Book } from "@/data/author";
import { countWords } from "@/data/story";
import { manuscriptOf } from "@/lib/bookManuscript";

import { EmptyState, Panel, ViewHeader } from "./primitives";

interface ChapterRow {
  bookId: string;
  bookTitle: string;
  index: number;
  title: string;
  summary: string;
  words: number;
  targetWords: number;
  statusLabel: string;
  statusClass: string;
}

function statusOf(expanded: string, draft: string): { label: string; className: string } {
  if (expanded.trim().length > 0) {
    return {
      label: "Ausgebaut",
      className: "border-brand-emerald/30 bg-brand-emerald/10 text-brand-emerald",
    };
  }
  if (draft.trim().length > 0) {
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

export function ChaptersView({
  books,
  onOpenChapter,
}: {
  books: Book[];
  onOpenChapter: (bookId: string, chapterIndex: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [bookFilter, setBookFilter] = useState<string>("all");

  const rows = useMemo<ChapterRow[]>(() => {
    const result: ChapterRow[] = [];
    for (const book of books) {
      for (const chapter of manuscriptOf(book)) {
        const status = statusOf(chapter.expanded, chapter.draft);
        result.push({
          bookId: book.id,
          bookTitle: book.title,
          index: chapter.index,
          title: chapter.title,
          summary: book.storyboard?.chapters[chapter.index]?.summary ?? "",
          words: countWords(chapter.expanded || chapter.draft),
          targetWords: chapter.targetWords ?? 0,
          statusLabel: status.label,
          statusClass: status.className,
        });
      }
    }
    return result;
  }, [books]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesBook = bookFilter === "all" || row.bookId === bookFilter;
      const matchesQuery =
        normalized.length === 0 ||
        row.title.toLowerCase().includes(normalized) ||
        row.bookTitle.toLowerCase().includes(normalized);
      return matchesBook && matchesQuery;
    });
  }, [rows, query, bookFilter]);

  const totalWords = visible.reduce((sum, row) => sum + row.words, 0);
  const written = rows.filter((row) => row.statusLabel !== "Leer").length;

  return (
    <div>
      <ViewHeader
        eyebrow="Kapitel"
        title="Alle Kapitel"
        subtitle={`${rows.length} Kapitel über ${books.length} Projekte · ${written} begonnen`}
        actions={
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Kapitel durchsuchen…"
              className="glass h-10 w-full rounded-xl pl-9 lg:w-64"
            />
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Select value={bookFilter} onValueChange={setBookFilter}>
          <SelectTrigger size="sm" className="glass w-64 border-white/10">
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
        <p className="text-xs text-muted-foreground">
          {formatWords(totalWords)} in Auswahl
        </p>
      </div>

      {visible.length > 0 ? (
        <div className="space-y-2">
          {visible.map((row) => (
            <Panel
              key={`${row.bookId}-${row.index}`}
              className="flex items-center gap-3 p-3 transition-colors hover:border-white/20"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-xs font-bold">
                {row.index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{row.title}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {row.bookTitle}
                  {row.summary ? ` · ${row.summary}` : ""}
                </p>
              </div>
              <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:block">
                {formatWords(row.words)}
                {row.targetWords > 0 ? ` / ${formatWords(row.targetWords)}` : ""}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                  row.statusClass,
                )}
              >
                {row.statusLabel}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="glass shrink-0 rounded-lg border-white/10"
                onClick={() => onOpenChapter(row.bookId, row.index)}
              >
                Öffnen
              </Button>
            </Panel>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<ListTree className="size-6" />}
          title="Keine Kapitel gefunden"
          description="Erstelle ein Buch über den Wizard, um Kapitel zu erzeugen."
        />
      )}
    </div>
  );
}

function formatWords(value: number): string {
  return `${value.toLocaleString("de-DE")} Wörter`;
}
