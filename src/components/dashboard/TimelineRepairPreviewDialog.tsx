import { useEffect, useMemo, useState } from "react";
import { CheckCheck, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { diffStats, diffWords } from "@/lib/diff";
import { cn } from "@/lib/utils";

import { DiffView } from "./DiffView";

/** Eine geänderte Szene: nur die Felder, die sich wirklich ändern, sind gesetzt. */
export interface TimelineSceneChange {
  /** 0-basierter Szenen-Index im Kapitel. */
  sceneIndex: number;
  timeBefore?: string;
  timeAfter?: string;
  settingBefore?: string;
  settingAfter?: string;
  textBefore?: string;
  textAfter?: string;
}

/** Eine Korrektur, die auf Bestätigung wartet (Szenen-Struktur eines Kapitels). */
export interface TimelineRepairChange {
  chapterIndex: number;
  title: string;
  /** Kurzbegründung des Modells. */
  note: string;
  scenes: TimelineSceneChange[];
}

/** „—" für fehlende Angaben, sonst der Wert in Anführungszeichen. */
function label(value: string | undefined): string {
  return value && value.trim() ? `„${value}"` : "—";
}

/**
 * Diff-Vorschau vor dem Übernehmen: zeigt je Kapitel, welche **Szenen-Struktur** (Zeit,
 * Schauplatz, Text) der Timeline-Quick-Fix ändern würde — erst nach Bestätigung wird geschrieben.
 * Kapitel lassen sich einzeln abwählen.
 */
export function TimelineRepairPreviewDialog({
  open,
  changes,
  running = false,
  onApply,
  onDiscard,
}: {
  open: boolean;
  changes: TimelineRepairChange[];
  /** Läuft die Korrektur noch? Dann treffen die Kapitel live ein — geschrieben wird danach. */
  running?: boolean;
  onApply: (chapterIndices: number[]) => void;
  onDiscard: () => void;
}) {
  /**
   * Abgewählte Kapitel statt ausgewählter: So bleiben Entscheidungen des Nutzers erhalten,
   * wenn während des Streams neue Kapitel eintreffen (die sind dann vorausgewählt).
   */
  const [excluded, setExcluded] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    setExcluded(new Set());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !running) onDiscard();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, running, onDiscard]);

  /** Text-Diffs vorberechnen (nur für Szenen, deren Text sich ändert). */
  const diffs = useMemo(() => {
    const map = new Map<string, { parts: ReturnType<typeof diffWords>; stats: { added: number; removed: number } }>();
    for (const change of changes) {
      for (const scene of change.scenes) {
        if (scene.textBefore === undefined || scene.textAfter === undefined) continue;
        const parts = diffWords(scene.textBefore, scene.textAfter);
        map.set(`${change.chapterIndex}:${scene.sceneIndex}`, { parts, stats: diffStats(parts) });
      }
    }
    return map;
  }, [changes]);

  if (!open) return null;

  const selected = changes
    .map((change) => change.chapterIndex)
    .filter((chapterIndex) => !excluded.has(chapterIndex));

  const toggle = (chapterIndex: number) => {
    if (running) return;
    setExcluded((prev) => {
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
        // Nicht bis zum darunterliegenden Timeline-Dialog durchreichen.
        event.stopPropagation();
        if (!running) onDiscard();
      }}
    >
      <div
        className="glass-strong float-in flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-amber to-brand-cyan text-white">
              <CheckCheck className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Timeline-Korrektur</h2>
              <p className="text-xs text-muted-foreground">
                {running
                  ? "Die Kapitel treffen live ein — am Ende prüft der Server die Vorschläge."
                  : changes.length === 1
                    ? "1 Kapitel würde in der Szenen-Struktur geändert — noch nicht geschrieben"
                    : `${changes.length} Kapitel würden in der Szenen-Struktur geändert — noch nicht geschrieben`}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-lg text-muted-foreground hover:text-foreground"
            onClick={onDiscard}
            disabled={running}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          {running && changes.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl border border-brand-cyan/20 bg-brand-cyan/5 px-4 py-3 text-sm text-brand-cyan">
              <Loader2 className="size-4 animate-spin" />
              Korrektur wird vorbereitet…
            </p>
          ) : null}
          {changes.map((change) => {
            const isSelected = selected.includes(change.chapterIndex);
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
                  <span className="rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-2 py-0.5 text-[11px] font-semibold text-brand-cyan">
                    {change.scenes.length === 1 ? "1 Szene" : `${change.scenes.length} Szenen`}
                  </span>
                </label>

                {change.note ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">{change.note}</p>
                ) : null}

                <div className="mt-2 space-y-2">
                  {change.scenes.map((scene) => {
                    const diff = diffs.get(`${change.chapterIndex}:${scene.sceneIndex}`);
                    return (
                      <div
                        key={scene.sceneIndex}
                        className="rounded-lg border border-white/10 bg-white/5 p-3"
                      >
                        <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">
                          Szene {scene.sceneIndex + 1}
                        </p>

                        {scene.timeAfter !== undefined ? (
                          <p className="text-xs">
                            <span className="text-muted-foreground">Zeit: </span>
                            <span className="text-brand-rose line-through">
                              {label(scene.timeBefore)}
                            </span>
                            <span className="mx-1.5 text-muted-foreground">→</span>
                            <span className="font-semibold text-brand-emerald">
                              {label(scene.timeAfter)}
                            </span>
                          </p>
                        ) : null}

                        {scene.settingAfter !== undefined ? (
                          <p className="text-xs">
                            <span className="text-muted-foreground">Schauplatz: </span>
                            <span className="text-brand-rose line-through">
                              {label(scene.settingBefore)}
                            </span>
                            <span className="mx-1.5 text-muted-foreground">→</span>
                            <span className="font-semibold text-brand-emerald">
                              {label(scene.settingAfter)}
                            </span>
                          </p>
                        ) : null}

                        {diff ? (
                          <div className="mt-2">
                            <span className="inline-flex items-center gap-2 text-[11px]">
                              <span className="text-muted-foreground">Szenen-Text</span>
                              <span className="rounded-full border border-brand-emerald/30 bg-brand-emerald/10 px-2 py-0.5 font-semibold text-brand-emerald">
                                +{diff.stats.added}
                              </span>
                              <span className="rounded-full border border-brand-rose/30 bg-brand-rose/10 px-2 py-0.5 font-semibold text-brand-rose">
                                −{diff.stats.removed}
                              </span>
                            </span>
                            <div className="mt-1.5 rounded-lg border border-white/10 bg-black/20 p-2 text-xs">
                              <DiffView parts={diff.parts} />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/10 p-4">
          <Button
            variant="outline"
            className="glass rounded-lg border-white/10"
            onClick={onDiscard}
            disabled={running}
          >
            Verwerfen
          </Button>
          <Button
            className="rounded-lg bg-gradient-to-r from-brand-emerald to-brand-cyan font-semibold text-white disabled:opacity-50"
            disabled={running || selected.length === 0}
            onClick={() => onApply(selected)}
          >
            <CheckCheck className="size-3.5" />
            Übernehmen ({selected.length})
          </Button>
        </div>
      </div>
    </div>
  );
}
