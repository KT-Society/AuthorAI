import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Sparkles, UserRound, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { StoryCharacter } from "@/data/story";

import { Badge } from "./primitives";

/**
 * Review-Dialog für aus dem Manuskript abgeleitete Figuren.
 * Jeder Vorschlag kann einzeln angenommen oder verworfen werden.
 */
export function CharacterExtractDialog({
  open,
  candidates,
  running = false,
  bookTitle,
  onClose,
  onAccept,
}: {
  open: boolean;
  candidates: StoryCharacter[];
  /** Läuft die Ableitung noch? Dann treffen die Figuren live ein. */
  running?: boolean;
  bookTitle: string;
  onClose: () => void;
  onAccept: (accepted: StoryCharacter[]) => void;
}) {
  const [rejected, setRejected] = useState<Set<string>>(new Set());

  // Nur beim Öffnen zurücksetzen — bei einem Effekt auf `[open, candidates]` würde jeder live
  // eintreffende Vorschlag die Auswahl des Nutzers verwerfen.
  useEffect(() => {
    if (!open) return;
    setRejected(new Set());
  }, [open]);

  const selected = useMemo(
    () => candidates.filter((candidate) => !rejected.has(candidate.name)),
    [candidates, rejected],
  );

  if (!open) return null;

  const toggle = (name: string) =>
    setRejected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const allSelected = rejected.size === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={() => {
        // Während des Sammelns gesperrt: sonst pusht der laufende Stream weiter und öffnet
        // den Dialog sofort wieder.
        if (!running) onClose();
      }}
    >
      <div
        className="glass-strong float-in flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-violet to-brand-cyan text-white">
              <Sparkles className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Figuren aus dem Manuskript</h2>
              <p className="text-xs text-muted-foreground">
                {candidates.length} Vorschläge{bookTitle ? ` · ${bookTitle}` : ""}
                {running ? " · sammelt…" : ""}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-lg text-muted-foreground hover:text-foreground"
            onClick={onClose}
            disabled={running}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {running
              ? "Die Figuren treffen live ein — am Ende wird gefiltert und validiert."
              : "Bereits getrackte Figuren sind ausgefiltert. Abwählen, was nicht ins Figuren-Register soll."}
          </p>
          <button
            type="button"
            onClick={() => setRejected(new Set())}
            className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            {allSelected ? "Alle abwählen" : "Alle auswählen"}
          </button>
        </div>

        <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
          {running && candidates.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl border border-brand-violet/20 bg-brand-violet/5 px-3.5 py-3 text-xs text-brand-violet">
              <Loader2 className="size-3.5 animate-spin" />
              Sammelt Figuren…
            </p>
          ) : null}          {candidates.map((candidate) => {
            const isSelected = !rejected.has(candidate.name);
            return (
              <button
                key={candidate.name}
                type="button"
                onClick={() => toggle(candidate.name)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-all duration-200",
                  isSelected
                    ? "border-brand-violet/40 bg-brand-violet/10"
                    : "border-white/10 bg-white/5 opacity-60 hover:opacity-90",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                    isSelected
                      ? "border-transparent bg-gradient-to-br from-brand-violet to-brand-indigo text-white"
                      : "border-white/20 text-transparent",
                  )}
                >
                  <Check className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold tracking-tight">{candidate.name}</span>
                    <Badge tone={isSelected ? "violet" : "indigo"}>{candidate.role}</Badge>
                  </span>
                  {candidate.description ? (
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      {candidate.description}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-5">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <UserRound className="size-3.5" />
            {selected.length} von {candidates.length} ausgewählt
          </span>
          <div className="flex gap-3">
            <Button
              variant="ghost"
              className="rounded-xl text-muted-foreground hover:text-foreground"
              onClick={onClose}
              disabled={running}
            >
              Abbrechen
            </Button>
            <Button
              onClick={() => onAccept(selected)}
              disabled={running || selected.length === 0}
              className="rounded-xl bg-gradient-to-r from-brand-violet to-brand-indigo px-5 font-semibold text-white disabled:opacity-50"
            >
              {selected.length} übernehmen
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
