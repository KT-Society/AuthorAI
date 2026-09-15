import { Plus, Search, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { greetingFor } from "@/data/author";

import { NotificationsBell } from "./NotificationsBell";

export function TopBar({
  query,
  onQueryChange,
  onCreate,
  onImport,
  profileName,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onCreate: () => void;
  /** Öffnet den Manuskript-Import (vorhandenes Markdown/Text einlesen). */
  onImport: () => void;
  profileName: string;
}) {
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);

  return (
    <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="float-in">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-brand-cyan">
          {dateLabel}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          {greetingFor(now)}, {profileName} 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(now)} Uhr
          — Zeit, die nächste Seite zu schreiben.
        </p>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative flex-1 lg:w-72 lg:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Projekte, Genres durchsuchen…"
            className="glass h-10 rounded-xl pl-9"
          />
        </div>

        <NotificationsBell />

        <Button
          variant="outline"
          onClick={onImport}
          className="glass h-10 rounded-xl border-white/10 px-3 font-semibold"
          title="Vorhandenes Manuskript (Markdown/Text) als Projekt einlesen"
        >
          <Upload className="size-4" />
          <span className="hidden sm:inline">Importieren</span>
        </Button>

        <Button
          onClick={onCreate}
          className="h-10 rounded-xl bg-gradient-to-r from-brand-violet to-brand-indigo px-4 font-semibold text-white shadow-[0_0_30px_-10px_hsl(258_90%_66%/0.95)] transition-transform hover:scale-[1.02]"
        >
          <Plus className="size-4" />
          Neues Buch
        </Button>
      </div>
    </header>
  );
}
