import { Flame, Library, ListChecks, PenLine } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { formatNumber } from "@/data/author";
import type { Book } from "@/data/author";

import { Panel, Sparkline, TONES } from "./primitives";
import type { Tone } from "./primitives";

function StatCard({
  icon,
  label,
  value,
  hint,
  tone,
  spark,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: Tone;
  spark?: number[];
}) {
  return (
    <Panel className="group relative overflow-hidden p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
        </div>
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105",
            TONES[tone].soft,
            TONES[tone].text,
          )}
        >
          {icon}
        </span>
      </div>

      {spark ? <Sparkline data={spark} tone={tone} className="mt-4" /> : null}

      <p className="mt-3 text-xs text-muted-foreground">{hint}</p>
    </Panel>
  );
}

export function StatGrid({
  books,
  weeklyWords,
  streakCurrent,
  streakBest,
}: {
  books: Book[];
  weeklyWords: number[];
  streakCurrent: number;
  streakBest: number;
}) {
  const totalWords = books.reduce((sum, book) => sum + book.words, 0);
  const totalChapters = books.reduce((sum, book) => sum + book.chaptersDone, 0);
  const inProgress = books.filter(
    (book) => book.status === "draft" || book.status === "editing",
  ).length;
  const published = books.filter((book) => book.status === "published").length;
  const wordsThisWeek = weeklyWords.reduce((sum, value) => sum + value, 0);
  const hasWeek = weeklyWords.some((value) => value > 0);

  return (
    <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon={<Library className="size-5" />}
        label="Bücher"
        value={String(books.length)}
        hint={`${inProgress} in Arbeit · ${published} veröffentlicht`}
        tone="violet"
      />
      <StatCard
        icon={<PenLine className="size-5" />}
        label="Wörter gesamt"
        value={formatNumber(totalWords)}
        hint={hasWeek ? `+${formatNumber(wordsThisWeek)} in dieser Woche` : "Noch keine Woche erfasst"}
        tone="cyan"
        {...(hasWeek ? { spark: weeklyWords } : {})}
      />
      <StatCard
        icon={<ListChecks className="size-5" />}
        label="Kapitel"
        value={String(totalChapters)}
        hint="fertiggestellt über alle Projekte"
        tone="amber"
      />
      <StatCard
        icon={<Flame className="size-5" />}
        label="Schreib-Streak"
        value={`${streakCurrent} ${streakCurrent === 1 ? "Tag" : "Tage"}`}
        hint={streakBest > 0 ? `Bestwert: ${streakBest} Tage in Folge` : "Noch kein Streak erfasst"}
        tone="rose"
      />
    </section>
  );
}
