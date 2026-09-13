import { useEffect, useMemo, useState } from "react";
import { CheckCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { diffStats, diffWords } from "@/lib/diff";
import { cn } from "@/lib/utils";

import { DiffView } from "./DiffView";

/** Eine Korrektur, die auf Bestätigung wartet (Kapiteltext vorher/nachher). */
export interface CanonRepairChange {
  chapterIndex: number;
  title: string;
  before: string;
  after: string;
  applied: number;
  unassigned: number;
}

/**
 * Diff-Vorschau vor dem Übernehmen: zeigt je Kapitel, was der Quick Fix ändern würde —
 * erst nach Bestätigung wird geschrieben. Kapitel lassen sich einzeln abwählen.
 */
export function CanonRepairPreviewDialog({
  open,
  changes,
  onApply,
  onDiscard,
}: {
  open: boolean;
  changes: CanonRepairChange[];
  onApply: (chapterIndices: number[]) => void;
  onDiscard: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(changes.map((change) => change.chapterIndex)));
  }, [open, changes]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDiscard();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onDiscard]);

  const diffs = useMemo(
    () =>
      changes.map((change) => {
        const parts = diffWords(change.before, change.after);
        return { change, parts, stats: diffStats(parts) };
      }),
    [changes],
  );

  if (!open) return null;

  const toggle = (chapterIndex: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(chapterIndex)) next.delete(chapterIndex);
      else next.add(chapterIndex);
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
      onClick={(event) => {
        // Nicht bis zum darunterliegenden Check-Dialog durchreichen.
        event.stopPropagation();
        onDiscard();
      }}
    >
      <div
        className="glass-strong float-in flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-amber to-brand-rose text-white">
              <CheckCheck className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Korrektur-Vorschau</h2>
              <p className="text-xs text-muted-foreground">
                {changes.length === 1
                  ? "1 Kapitel würde geändert — noch nicht geschrieben"
                  : `${changes.length} Kapitel würden geändert — noch nicht geschrieben`}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-lg text-muted-foreground hover:text-foreground"
            onClick={onDiscard}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          {diffs.map(({ change, parts, stats }) => {
            const isSelected = selected.has(change.chapterIndex);
            return (
              <div
                key={change.chapterIndex}
                className={cn(
                  "rounded-xl border p-3 transition-colors",
                  isSelected
                    ? "border-brand-emerald/30 bg-brand-emerald/5"
                    : "border-white/10 bg-white/5 opacity-60",
                )}
              >
                <label className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(change.chapterIndex)}
                      className="size-3.5 accent-brand-emerald"
                    />
                    Kapitel {change.chapterIndex + 1}
                    {change.title ? `: ${change.title}` : ""}
                  </span>
                  <span className="flex items-center gap-2 text-[11px]">
                    <span className="rounded-full border border-brand-emerald/30 bg-brand-emerald/10 px-2 py-0.5 font-semibold text-brand-emerald">
                      +{stats.added}
                    </span>
                    <span className="rounded-full border border-brand-rose/30 bg-brand-rose/10 px-2 py-0.5 font-semibold text-brand-rose">
                      −{stats.removed}
                    </span>
                  </span>
                </label>

                <div className="mt-2 rounded-lg border border-white/10 bg-white/5 p-3">
                  <DiffView parts={parts} />
                </div>

                {change.unassigned > 0 ? (
                  <p className="mt-2 text-[11px] text-brand-amber">
                    {change.unassigned} Stelle(n) konnten nicht sicher zugeordnet werden.
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/10 p-4">
          <Button
            variant="outline"
            className="glass rounded-lg border-white/10"
            onClick={onDiscard}
          >
            Verwerfen
          </Button>
          <Button
            className="rounded-lg bg-gradient-to-r from-brand-emerald to-brand-cyan font-semibold text-white disabled:opacity-50"
            disabled={selected.size === 0}
            onClick={() => onApply([...selected])}
          >
            <CheckCheck className="size-3.5" />
            Übernehmen ({selected.size})
          </Button>
        </div>
      </div>
    </div>
  );
}
