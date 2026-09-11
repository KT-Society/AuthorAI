import { ArrowRight, BookOpen, Clock, ListTree } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { formatNumber, progressOf, STATUS_META, timeAgo } from "@/data/author";
import type { Book } from "@/data/author";

import { Badge, Panel, ProgressBar } from "./primitives";

export function ContinueHero({ book, onOpen }: { book: Book | undefined; onOpen: () => void }) {
  if (!book) return null;

  const progress = progressOf(book);
  const status = STATUS_META[book.status];
  const nextChapter = Math.min(book.chaptersDone + 1, book.chapters || book.chaptersDone + 1);

  return (
    <Panel className="mb-6 overflow-hidden p-0">
      <div className="grid gap-0 md:grid-cols-[220px_minmax(0,1fr)]">
        <div
          className="relative hidden min-h-[220px] items-end bg-cover bg-center p-5 md:flex"
          style={{
            backgroundImage: book.coverUrl
              ? `url(${book.coverUrl})`
              : `linear-gradient(150deg, ${book.coverFrom}, ${book.coverTo})`,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
          <span className="absolute -bottom-6 left-5 select-none text-[120px] font-black leading-none text-white/20">
            {book.title.charAt(0)}
          </span>
          <span className="relative z-10 rounded-lg bg-black/30 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur">
            {book.genre}
          </span>
        </div>

        <div className="p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="cyan">
              <BookOpen className="size-3" />
              Aktuelles Projekt
            </Badge>
            <Badge tone={book.status === "editing" ? "violet" : "cyan"} className="border-white/10 bg-white/5 text-foreground/80">
              <span className={cn("size-1.5 rounded-full", status.dot)} />
              {status.label}
            </Badge>
          </div>

          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{book.title}</h2>
          <p className="text-sm text-muted-foreground">{book.subtitle}</p>
          <p className="mt-3 line-clamp-2 max-w-2xl text-sm leading-relaxed text-foreground/75">
            {book.synopsis}
          </p>

          <div className="mt-5 max-w-xl">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {formatNumber(book.words)} / {formatNumber(book.goalWords)} Wörter
              </span>
              <span className="font-semibold text-brand-cyan">{progress} %</span>
            </div>
            <ProgressBar value={progress} tone="cyan" />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ListTree className="size-3.5" />
              Kapitel {book.chaptersDone}/{book.chapters || "—"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" />
              bearbeitet {timeAgo(book.updatedAt)}
            </span>
          </div>

          <div className="mt-6">
            <Button
              onClick={onOpen}
              className="h-10 rounded-xl bg-gradient-to-r from-brand-cyan to-brand-indigo px-5 font-semibold text-white shadow-[0_0_30px_-10px_hsl(186_100%_55%/0.95)] transition-transform hover:scale-[1.02]"
            >
              Kapitel {nextChapter} fortsetzen
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
