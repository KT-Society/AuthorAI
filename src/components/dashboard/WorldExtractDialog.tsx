import { useEffect, useMemo, useState } from "react";
import { Check, Globe2, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { WorldCategory, WorldEntry } from "@/data/world";

import { Badge } from "./primitives";
import type { Tone } from "./primitives";

export const WORLD_CATEGORY_TONE: Record<WorldCategory, Tone> = {
  Ort: "cyan",
  Fraktion: "rose",
  Magie: "violet",
  Artefakt: "amber",
  Lore: "emerald",
};

export interface WorldCandidate {
  entry: WorldEntry;
  /** Titel eines vorhandenen Eintrags, dem der Vorschlag stark ähnelt. */
  similarTo?: string;
}

/**
 * Review-Dialog für abgeleitete Welteneinträge.
 * Ähnliche/bereits vorhandene Vorschläge sind vorab abgewählt, damit mehrere Scans
 * keine Dubletten anlegen — der Nutzer entscheidet im Zweifel selbst.
 */
export function WorldExtractDialog({
  open,
  candidates,
  bookTitle,
  onClose,
  onAccept,
}: {
  open: boolean;
  candidates: WorldCandidate[];
  bookTitle: string;
  onClose: () => void;
  onAccept: (accepted: WorldEntry[]) => void;
}) {
  const [rejected, setRejected] = useState<Set<string>>(new Set());

  // Bei jedem Öffnen: neue Vorschläge vorausgewählt, ähnliche abgewählt.
  useEffect(() => {
    if (open) {
      setRejected(new Set(candidates.filter((item) => item.similarTo).map((item) => item.entry.id)));
    }
  }, [open, candidates]);

  const selected = useMemo(
    () => candidates.filter((item) => !rejected.has(item.entry.id)).map((item) => item.entry),
    [candidates, rejected],
  );

  const duplicates = useMemo(
    () => candidates.filter((item) => item.similarTo).length,
    [candidates],
  );

  if (!open) return null;

  const toggle = (id: string) =>
    setRejected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-strong float-in flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-cyan to-brand-indigo text-white">
              <Globe2 className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Weltenbau aus Storyboard</h2>
              <p className="text-xs text-muted-foreground">
                {candidates.length} Vorschläge{bookTitle ? ` · ${bookTitle}` : ""}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-lg text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {duplicates > 0
              ? duplicates === 1
                ? "1 Vorschlag ähnelt bereits vorhandenen Einträgen und ist abgewählt."
                : `${duplicates} Vorschläge ähneln bereits vorhandenen Einträgen und sind abgewählt.`
              : "Neue Vorschläge sind vorausgewählt."}
          </p>
          <button
            type="button"
            onClick={() => setRejected(new Set())}
            className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            {rejected.size === 0 ? "Alle abwählen" : "Alle auswählen"}
          </button>
        </div>

        <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
          {candidates.map(({ entry, similarTo }) => {
            const isSelected = !rejected.has(entry.id);
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => toggle(entry.id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-all duration-200",
                  isSelected
                    ? "border-brand-cyan/40 bg-brand-cyan/10"
                    : "border-white/10 bg-white/5 opacity-60 hover:opacity-90",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                    isSelected
                      ? "border-transparent bg-gradient-to-br from-brand-cyan to-brand-indigo text-white"
                      : "border-white/20 text-transparent",
                  )}
                >
                  <Check className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold tracking-tight">{entry.title}</span>
                    <Badge tone={WORLD_CATEGORY_TONE[entry.category]}>{entry.category}</Badge>
                    {similarTo ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-brand-amber/30 bg-brand-amber/10 px-2 py-0.5 text-[11px] font-semibold text-brand-amber">
                        <Sparkles className="size-3" />
                        ähnlich zu „{similarTo}“
                      </span>
                    ) : null}
                  </span>
                  {entry.description ? (
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      {entry.description}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-5">
          <span className="text-xs text-muted-foreground">
            {selected.length} von {candidates.length} ausgewählt
          </span>
          <div className="flex gap-3">
            <Button
              variant="ghost"
              className="rounded-xl text-muted-foreground hover:text-foreground"
              onClick={onClose}
            >
              Abbrechen
            </Button>
            <Button
              onClick={() => onAccept(selected)}
              disabled={selected.length === 0}
              className="rounded-xl bg-gradient-to-r from-brand-cyan to-brand-indigo px-5 font-semibold text-white disabled:opacity-50"
            >
              {selected.length} übernehmen
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
