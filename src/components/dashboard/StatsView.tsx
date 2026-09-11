import type { ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  Flame,
  GitBranch,
  Globe2,
  PenLine,
  RotateCcw,
  Search,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { Book } from "@/data/author";
import { STATUS_META, STATUS_ORDER, formatNumber } from "@/data/author";
import type { Character } from "@/data/characters";
import { PLOT_STATUSES, PLOT_STATUS_LABELS } from "@/data/plot";
import type { PlotCard } from "@/data/plot";
import type { ResearchNote } from "@/data/research";
import type { WorldEntry } from "@/data/world";

import { Panel, PanelHeader, ProgressBar, ViewHeader } from "./primitives";
import type { Tone } from "./primitives";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function Kpi({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: Tone;
}) {
  const toneClasses: Record<Tone, string> = {
    violet: "bg-brand-violet/10 text-brand-violet",
    cyan: "bg-brand-cyan/10 text-brand-cyan",
    emerald: "bg-brand-emerald/10 text-brand-emerald",
    amber: "bg-brand-amber/10 text-brand-amber",
    rose: "bg-brand-rose/10 text-brand-rose",
    indigo: "bg-brand-indigo/10 text-brand-indigo",
  };
  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
        </div>
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            toneClasses[tone],
          )}
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{hint}</p>
    </Panel>
  );
}

export function StatsView({
  books,
  characters,
  worlds,
  plotCards,
  notes,
  weeklyWords,
  onResetStats,
}: {
  books: Book[];
  characters: Character[];
  worlds: WorldEntry[];
  plotCards: PlotCard[];
  notes: ResearchNote[];
  weeklyWords: number[];
  onResetStats: () => void;
}) {
  const totalWords = books.reduce((sum, book) => sum + book.words, 0);
  const totalChapters = books.reduce((sum, book) => sum + book.chaptersDone, 0);
  const wordsThisWeek = weeklyWords.reduce((sum, value) => sum + value, 0);
  const activeDays = weeklyWords.filter((value) => value > 0).length;
  const published = books.filter((book) => book.status === "published").length;
  const maxBookWords = Math.max(1, ...books.map((book) => book.words));
  const maxWeek = Math.max(1, ...weeklyWords);

  const statusCounts = STATUS_ORDER.map((status) => ({
    status,
    count: books.filter((book) => book.status === status).length,
  }));

  const plotCounts = PLOT_STATUSES.map((status) => ({
    status,
    count: plotCards.filter((card) => card.status === status).length,
  }));

  return (
    <div>
      <ViewHeader
        eyebrow="Statistiken"
        title="Statistiken"
        subtitle="Fortschritt, Output und Weltübersicht auf einen Blick"
        actions={
          <Button
            variant="outline"
            className="glass h-10 rounded-xl border-white/10 text-muted-foreground hover:text-foreground"
            onClick={onResetStats}
          >
            <RotateCcw className="size-4" />
            Beispielwerte zurücksetzen
          </Button>
        }
      />

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={<PenLine className="size-5" />}
          label="Wörter gesamt"
          value={formatNumber(totalWords)}
          hint={`+${formatNumber(wordsThisWeek)} diese Woche`}
          tone="cyan"
        />
        <Kpi
          icon={<BookOpen className="size-5" />}
          label="Bücher"
          value={String(books.length)}
          hint={`${published} veröffentlicht`}
          tone="violet"
        />
        <Kpi
          icon={<BarChart3 className="size-5" />}
          label="Kapitel"
          value={String(totalChapters)}
          hint="fertiggestellt"
          tone="amber"
        />
        <Kpi
          icon={<Flame className="size-5" />}
          label="Aktive Tage"
          value={`${activeDays}/7`}
          hint="diese Woche geschrieben"
          tone="rose"
        />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel className="p-5">
          <PanelHeader icon={<BarChart3 className="size-4" />} title="Wörter pro Buch" />
          <div className="mt-5 space-y-4">
            {books.map((book) => {
              const relative = Math.round((book.words / maxBookWords) * 100);
              return (
                <div key={book.id}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="truncate pr-2">{book.title}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {formatNumber(book.words)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-violet to-brand-cyan transition-[width] duration-700"
                      style={{ width: `${Math.max(2, relative)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel className="p-5">
          <PanelHeader icon={<PenLine className="size-4" />} title="Schreib-Output (Woche)" />
          <div className="mt-6 flex h-40 items-end gap-2">
            {weeklyWords.map((value, index) => (
              <div key={index} className="flex h-full flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-brand-cyan to-brand-violet transition-[height] duration-700"
                    style={{ height: `${Math.max(4, (value / maxWeek) * 100)}%` }}
                    title={`${value.toLocaleString("de-DE")} Wörter`}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{WEEKDAYS[index]}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {formatNumber(wordsThisWeek)} Wörter in dieser Woche
          </p>
        </Panel>

        <Panel className="p-5">
          <PanelHeader icon={<BookOpen className="size-4" />} title="Projekt-Status" />
          <div className="mt-5 space-y-3">
            {statusCounts.map(({ status, count }) => (
              <div key={status}>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className={STATUS_META[status].text}>{STATUS_META[status].label}</span>
                  <span className="text-muted-foreground">{count}</span>
                </div>
                <ProgressBar
                  value={books.length > 0 ? (count / books.length) * 100 : 0}
                  tone={
                    status === "published"
                      ? "emerald"
                      : status === "editing"
                        ? "violet"
                        : status === "draft"
                          ? "cyan"
                          : "amber"
                  }
                />
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="p-5">
          <PanelHeader icon={<GitBranch className="size-4" />} title="Plot-Board" />
          <div className="mt-5 space-y-3">
            {plotCounts.map(({ status, count }) => (
              <div key={status}>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span>{PLOT_STATUS_LABELS[status]}</span>
                  <span className="text-muted-foreground">{count}</span>
                </div>
                <ProgressBar
                  value={plotCards.length > 0 ? (count / plotCards.length) * 100 : 0}
                  tone={status === "written" ? "emerald" : status === "planned" ? "cyan" : "amber"}
                />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi
          icon={<Users className="size-5" />}
          label="Charaktere"
          value={String(characters.length)}
          hint="Figuren in deiner Welt"
          tone="indigo"
        />
        <Kpi
          icon={<Globe2 className="size-5" />}
          label="Weltenbau"
          value={String(worlds.length)}
          hint="Orte, Fraktionen, Lore"
          tone="emerald"
        />
        <Kpi
          icon={<Search className="size-5" />}
          label="Recherche"
          value={String(notes.length)}
          hint="gespeicherte Notizen"
          tone="cyan"
        />
      </section>
    </div>
  );
}
