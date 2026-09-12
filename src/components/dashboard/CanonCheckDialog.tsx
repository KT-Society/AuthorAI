import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Wand2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { createJob, finishJob, isCancelled, updateJob } from "@/lib/jobs";
import { showToast } from "@/lib/toast";
import type {
  CanonCheckResult,
  CanonRepairResultEvent,
  CanonStreamHandlers,
  CanonViolation,
} from "@/services/continuity";

export interface CanonCheckChapter {
  index: number;
  title: string;
}

interface ChapterOutcome {
  chapter: CanonCheckChapter;
  result?: CanonCheckResult;
  error?: string;
}

/**
 * Fakten-Check: prüft alle Kapitel **nur gegen den Kanon** (getrennt von der Kohärenz).
 *
 * Die Prüfung läuft über eine SSE-Verbindung: der Server arbeitet parallel und schickt jedes
 * Kapitel-Ergebnis, sobald es fertig ist — die Liste füllt sich live. Gemeldete Widersprüche
 * lassen sich **einzeln oder für alle** beheben; danach wird das Kapitel neu geprüft, damit
 * sichtbar ist, was übrig bleibt.
 */
export function CanonCheckDialog({
  open,
  chapters,
  canonAvailable,
  onStreamCheck,
  onRepairMany,
  onClose,
}: {
  open: boolean;
  chapters: CanonCheckChapter[];
  canonAvailable: boolean;
  /** Startet den gestreamten Check über alle Kapitel (Payload baut der Aufrufer). */
  onStreamCheck: (handlers: CanonStreamHandlers) => Promise<void>;
  /**
   * Behebt Widersprüche und prüft die betroffenen Kapitel **direkt danach erneut** (SSE).
   * Der Aufrufer schreibt die korrigierten Texte ins Buch; hier kommen die frischen Ergebnisse an.
   */
  onRepairMany: (
    targets: { chapterIndex: number; violations: CanonViolation[] }[],
    callbacks: {
      onStarted: (chapterIndex: number) => void;
      onResult: (event: CanonRepairResultEvent) => void;
    },
  ) => Promise<void>;
  onClose: () => void;
}) {
  const [outcomes, setOutcomes] = useState<Map<number, ChapterOutcome>>(new Map());
  const [running, setRunning] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [repairing, setRepairing] = useState<Set<number>>(new Set());
  const [repairAllBusy, setRepairAllBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** StrictMode führt Effekte doppelt aus — Guard verhindert doppelte Läufe. */
  const startedRef = useRef(false);
  /**
   * Fortschrittszähler als Ref: `updateJob` darf **nicht** in einem State-Updater laufen —
   * das würde `JobCenter` während des Renderns aktualisieren (React-Fehler).
   */
  const progressRef = useRef(0);

  const order = new Map(chapters.map((chapter, position) => [chapter.index, position]));
  const sorted = [...outcomes.values()].sort(
    (a, b) => (order.get(a.chapter.index) ?? 0) - (order.get(b.chapter.index) ?? 0),
  );
  const violations = sorted.flatMap((outcome) => outcome.result?.violations ?? []);
  const failed = sorted.filter((outcome) => outcome.error);
  const doneCount = outcomes.size;

  const run = async () => {
    if (!canonAvailable) return;
    setBusy(true);
    setError(null);
    setOutcomes(new Map());
    setRunning(new Set());
    progressRef.current = 0;

    const jobId = createJob({
      title: `Fakten-Check · ${chapters.length} Kapitel`,
      kind: "canon-check",
      total: chapters.length,
    });

    try {
      await onStreamCheck({
        onStarted: (chapterIndex) =>
          setRunning((prev) => new Set(prev).add(chapterIndex)),
        onResult: (chapterIndex, result, errorMessage) => {
          const chapter = chapters.find((entry) => entry.index === chapterIndex) ?? {
            index: chapterIndex,
            title: "",
          };
          // Zähler zuerst (außerhalb des Updaters), dann reine State-Updates.
          progressRef.current += 1;
          updateJob(jobId, { done: progressRef.current });
          setRunning((prev) => {
            const next = new Set(prev);
            next.delete(chapterIndex);
            return next;
          });
          setOutcomes((prev) =>
            new Map(prev).set(chapterIndex, { chapter, result, error: errorMessage }),
          );
        },
      });
      finishJob(jobId, "done", "Prüfung abgeschlossen");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler.";
      setError(message);
      finishJob(jobId, "error", message);
    } finally {
      setBusy(false);
      setRunning(new Set());
    }
  };

  /** Behebt die Widersprüche der angegebenen Kapitel (gestreamt, mit Nachprüfung). */
  const runRepair = async (
    targets: { chapterIndex: number; violations: CanonViolation[] }[],
  ) => {
    if (targets.length === 0) return;
    setError(null);
    setRepairAllBusy(true);
    progressRef.current = 0;

    const jobId = createJob({
      title: `Fakten-Korrektur · ${targets.length} Kapitel`,
      kind: "canon-repair",
      total: targets.length,
    });
    let failure: string | null = null;
    let aborted = false;

    try {
      await onRepairMany(targets, {
        onStarted: (chapterIndex) =>
          setRepairing((prev) => new Set(prev).add(chapterIndex)),
        onResult: (event) => {
          progressRef.current += 1;
          updateJob(jobId, { done: progressRef.current });
          setRepairing((prev) => {
            const next = new Set(prev);
            next.delete(event.chapterIndex);
            return next;
          });

          if (event.error) {
            setError(
              `Kapitel ${event.chapterIndex + 1}: ${event.error}`,
            );
            return;
          }
          if (event.result) {
            setOutcomes((prev) => {
              const existing = prev.get(event.chapterIndex);
              return new Map(prev).set(event.chapterIndex, {
                chapter: existing?.chapter ?? { index: event.chapterIndex, title: "" },
                result: event.result,
              });
            });
            const left = event.result.violations.length;
            showToast(
              left === 0
                ? `Kapitel ${event.chapterIndex + 1}: Widerspruch behoben ✓`
                : `Kapitel ${event.chapterIndex + 1}: korrigiert, ${left} offen`,
              left === 0 ? "ok" : "info",
            );
          }
        },
      });
    } catch (err) {
      failure = err instanceof Error ? err.message : "Unbekannter Fehler.";
      setError(failure);
      aborted = isCancelled(jobId);
    } finally {
      if (aborted) finishJob(jobId, "cancelled", "Korrektur abgebrochen");
      else if (failure) finishJob(jobId, "error", failure);
      else {
        updateJob(jobId, { done: targets.length });
        finishJob(jobId, "done", `${targets.length} Kapitel bearbeitet`);
      }
      setRepairing(new Set());
      setRepairAllBusy(false);
    }
  };

  const repairableTargets = () =>
    sorted
      .filter((outcome) => (outcome.result?.violations.length ?? 0) > 0 && !outcome.error)
      .map((outcome) => ({
        chapterIndex: outcome.chapter.index,
        violations: outcome.result?.violations ?? [],
      }));

  useEffect(() => {
    if (!open || startedRef.current) return;
    startedRef.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) {
      startedRef.current = false;
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !repairAllBusy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, repairAllBusy, onClose]);

  if (!open) return null;

  const busyOverall = busy || repairAllBusy;
  const progress = chapters.length === 0 ? 0 : (doneCount / chapters.length) * 100;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onClick={() => !busyOverall && onClose()}
    >
      <div
        className="glass-strong float-in flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-emerald to-brand-cyan text-white">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Fakten-Check</h2>
              <p className="text-xs text-muted-foreground">
                Nur gegen den Kanon geprüft · getrennt von der Kohärenz
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-lg text-muted-foreground hover:text-foreground"
            onClick={onClose}
            disabled={busyOverall}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {!canonAvailable ? (
            <div className="rounded-xl border border-brand-amber/30 bg-brand-amber/10 px-4 py-3 text-sm text-brand-amber">
              Kein Kanon vorhanden. Lege zuerst Fakten oder Beziehungen an (Charakter-Editor) oder
              leite Vorschläge in der Ansicht <strong>Kontinuität</strong> ab.
            </div>
          ) : null}

          {error ? (
            <p className="mb-4 rounded-xl border border-brand-rose/30 bg-brand-rose/10 px-3 py-2 text-sm text-brand-rose">
              {error}
            </p>
          ) : null}

          {canonAvailable ? (
            <div
              className={cn(
                "mb-5 rounded-xl border p-4",
                busy
                  ? "border-brand-cyan/20 bg-brand-cyan/5"
                  : violations.length === 0
                    ? "border-brand-emerald/30 bg-brand-emerald/10"
                    : "border-brand-amber/30 bg-brand-amber/10",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="inline-flex items-center gap-2 text-sm font-semibold">
                  {busy ? (
                    <>
                      <Loader2 className="size-4 animate-spin text-brand-cyan" />
                      Prüfe {doneCount + running.size}/{chapters.length} · läuft live
                    </>
                  ) : violations.length === 0 ? (
                    <>
                      <CheckCircle2 className="size-4 text-brand-emerald" />
                      Kein Widerspruch zum Kanon
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="size-4 text-brand-amber" />
                      {violations.length === 1
                        ? "1 Widerspruch zum Kanon"
                        : `${violations.length} Widersprüche zum Kanon`}
                    </>
                  )}
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  {violations.length > 0 && !busy ? (
                    <Button
                      size="sm"
                      className="h-8 rounded-lg bg-gradient-to-r from-brand-emerald to-brand-cyan font-semibold text-white disabled:opacity-50"
                      onClick={() => void runRepair(repairableTargets())}
                      disabled={repairAllBusy || repairing.size > 0}
                      title="Alle gemeldeten Widersprüche korrigieren und danach erneut prüfen"
                    >
                      {repairAllBusy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Wand2 className="size-3.5" />
                      )}
                      Alle beheben ({repairableTargets().length})
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    className="glass h-8 rounded-lg border-white/10"
                    onClick={() => void run()}
                    disabled={busyOverall}
                  >
                    <RefreshCw className="size-3.5" />
                    Erneut prüfen
                  </Button>
                </div>
              </div>

              {busy || repairAllBusy ? (
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-emerald to-brand-cyan transition-all duration-300"
                    style={{ width: `${busy ? progress : 100}%` }}
                  />
                </div>
              ) : null}

              {failed.length > 0 ? (
                <p className="mt-2 text-[11px] text-brand-rose">
                  {failed.length} Kapitel konnten nicht geprüft werden.
                </p>
              ) : null}
            </div>
          ) : null}

          {canonAvailable ? (
            <div className="space-y-3">
              {chapters.map((chapter) => {
                const outcome = outcomes.get(chapter.index);
                const isRunning = running.has(chapter.index);
                const isRepairing = repairing.has(chapter.index);
                const count = outcome?.result?.violations.length ?? 0;

                return (
                  <div
                    key={chapter.index}
                    className={cn(
                      "rounded-xl border p-3 transition-colors",
                      isRunning || isRepairing
                        ? "border-brand-cyan/30 bg-brand-cyan/5"
                        : count > 0
                          ? "border-brand-amber/25 bg-white/5"
                          : "border-white/10 bg-white/5",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold">
                        Kapitel {chapter.index + 1}
                        {chapter.title ? `: ${chapter.title}` : ""}
                      </p>

                      <div className="flex items-center gap-2">
                        {isRunning || isRepairing ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-brand-cyan">
                            <Loader2 className="size-3 animate-spin" />
                            {isRepairing ? "korrigiert…" : "prüft…"}
                          </span>
                        ) : outcome?.error ? (
                          <span className="text-[11px] text-brand-rose">{outcome.error}</span>
                        ) : count === 0 ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-brand-emerald">
                            <CheckCircle2 className="size-3" />
                            keine Widersprüche
                          </span>
                        ) : (
                          <>
                            <span className="text-[11px] font-semibold text-brand-amber">
                              {count === 1 ? "1 Widerspruch" : `${count} Widersprüche`}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="glass h-7 rounded-lg border-white/10 px-2 text-[11px]"
                              onClick={() =>
                                void runRepair([
                                  {
                                    chapterIndex: chapter.index,
                                    violations: outcome?.result?.violations ?? [],
                                  },
                                ])
                              }
                              disabled={busyOverall || repairing.size > 0}
                              title="Nur dieses Kapitel korrigieren und danach erneut prüfen"
                            >
                              <Wand2 className="size-3" />
                              Beheben
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {count > 0 ? (
                      <ul className="mt-2 space-y-2">
                        {outcome?.result?.violations.map((violation, index) => (
                          <li
                            key={`${chapter.index}-${index}`}
                            className="rounded-lg border border-white/10 bg-white/5 p-2.5"
                          >
                            <p className="text-[11px] font-semibold text-brand-amber">
                              {violation.fact}
                              {violation.part ? (
                                <span className="ml-2 font-normal text-muted-foreground">
                                  Teil {violation.part}
                                </span>
                              ) : null}
                            </p>
                            <p className="mt-1 text-xs italic text-foreground/85">
                              „{violation.quote}“
                            </p>
                            {violation.fix ? (
                              <p className="mt-1 text-[11px] text-muted-foreground">{violation.fix}</p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}

              {doneCount === 0 && !busy ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Keine Ergebnisse — „Erneut prüfen" starten.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
