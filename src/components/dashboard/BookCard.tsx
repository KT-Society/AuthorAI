import { ArrowRight, Clock, Layers, ListTree, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { formatPercent, progressOf, STATUS_META, timeAgo } from "@/data/author";
import type { Book } from "@/data/author";

import { Panel, ProgressBar } from "./primitives";

export function BookCard({
  book,
  selected,
  seriesLabel,
  onSelect,
  onOpen,
  onDelete,
}: {
  book: Book;
  selected: boolean;
  /** Anzeige der Reihe, z. B. „Aschenchronik · Band 2". */
  seriesLabel?: string;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const progress = progressOf(book);
  const status = STATUS_META[book.status];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(book.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(book.id);
        }
      }}
      className="group block h-full cursor-pointer text-left focus:outline-none"
    >
      <Panel
        className={cn(
          "flex h-full flex-col overflow-hidden p-0 transition-all duration-300 group-hover:-translate-y-1 group-hover:border-white/20",
          selected && "border-brand-cyan/40 shadow-[0_0_44px_-16px_hsl(186_100%_55%/0.95)]",
        )}
      >
        <div
          className="relative flex h-32 items-end bg-cover bg-center p-4"
          style={{
            backgroundImage: book.coverUrl
              ? `url(${book.coverUrl})`
              : `linear-gradient(150deg, ${book.coverFrom}, ${book.coverTo})`,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <span className="absolute -bottom-5 right-3 select-none text-[86px] font-black leading-none text-white/20">
            {book.title.charAt(0)}
          </span>

          <div className="absolute right-3 top-3 z-20 flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpen(book.id);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-black/40 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur"
            >
              Öffnen
              <ArrowRight className="size-3" />
            </button>
            <button
              type="button"
              title="Buch löschen"
              onClick={(event) => {
                event.stopPropagation();
                if (window.confirm(`„${book.title}“ löschen?`)) onDelete(book.id);
              }}
              className="rounded-lg border border-white/20 bg-black/40 p-1.5 text-white backdrop-blur transition-colors hover:text-brand-rose"
            >
              <Trash2 className="size-3" />
            </button>
          </div>

          <span className="relative z-10 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/35 px-2.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
            <span className={cn("size-1.5 rounded-full", status.dot)} />
            {status.label}
          </span>
          <span className="relative z-10 ml-auto rounded-full bg-black/30 px-2 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur">
            {book.genre}
          </span>
        </div>

        <div className="flex flex-1 flex-col p-4">
          <h3 className="line-clamp-1 text-base font-semibold tracking-tight">{book.title}</h3>
          <p className="line-clamp-1 text-xs text-muted-foreground">{book.subtitle}</p>

          {seriesLabel ? (
            <span className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full border border-brand-indigo/30 bg-brand-indigo/10 px-2 py-0.5 text-[10px] font-semibold text-brand-indigo">
              <Layers className="size-3" />
              {seriesLabel}
            </span>
          ) : null}

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Fortschritt</span>
              <span className="font-semibold">{formatPercent(progress)}</span>
            </div>
            <ProgressBar
              value={progress}
              tone={
                book.status === "published" ? "emerald" : book.status === "editing" ? "violet" : "cyan"
              }
            />
          </div>

          <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ListTree className="size-3.5" />
              {book.chaptersDone}/{book.chapters || "—"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" />
              {timeAgo(book.updatedAt)}
            </span>
          </div>

          {book.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {book.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
