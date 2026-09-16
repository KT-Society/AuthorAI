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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { cn } from "@/lib/utils";

import { createJob, finishJob, isCancelled, updateJob } from "@/lib/jobs";
import { showToast } from "@/lib/toast";
import type {
  CanonCheckResult,
  CanonRepairResultEvent,
  CanonStreamHandlers,
  CanonViolation,
} from "@/services/continuity";

import { CanonRepairPreviewDialog } from "./CanonRepairPreviewDialog";
import type { CanonRepairChange } from "./CanonRepairPreviewDialog";

export interface CanonCheckChapter {
  index: number;
  title: string;
}

/** Umfang des Checks: gesamter Kanon, eine einzelne Entität oder ausgewählte Fakten. */
export interface CanonScopeSelection {
  scopeId: string;
  factIds: string[];
  label: string;
}

export interface CanonScopeOption {
  id: string;
  label: string;
}

export interface CanonFactOption {
  id: string;
  label: string;
}

interface ChapterOutcome {
  chapter: CanonCheckChapter;
  result?: CanonCheckResult;
  error?: string;
}

/** Spezieller Umfang-Wert für die Fakten-Checkliste. */
const FACTS_SCOPE = "facts";

/**
 * Fakten-Check: prüft alle Kapitel **nur gegen den Kanon** (getrennt von der Kohärenz).
 *
 * Die Prüfung läuft über eine SSE-Verbindung: der Server arbeitet parallel und schickt jedes
 * Kapitel-Ergebnis, sobald es fertig ist — die Liste füllt sich live. Der **Umfang** ist
 * wählbar (gesamter Kanon, eine Figur oder ausgewählte Fakten); Widersprüche lassen sich
 * **einzeln markieren**, und die Korrektur wird vor dem Schreiben als **Diff-Vorschau**
 * bestätigt.
 */
export function CanonCheckDialog({
  open,
  chapters,
  canonAvailable,
  scopes,
  facts,
  onStreamCheck,
  onRepairMany,
  onApplyRepairs,
  onRecordCheck,
  onClose,
}: {
  open: boolean;
  chapters: CanonCheckChapter[];
  canonAvailable: boolean;
  /** Wählbare Umfänge (enthält immer „all"); der Aufrufer baut die Kanon-Blöcke. */
  scopes: CanonScopeOption[];
  /** Einzelne Fakten für den Umfang „nur ausgewählte Fakten". */
  facts: CanonFactOption[];
  /** Startet den gestreamten Check für den gewählten Umfang. */
  onStreamCheck: (
    handlers: CanonStreamHandlers,
    scope: CanonScopeSelection,
  ) => Promise<void>;
  /**
   * Behebt die gemeldeten Widersprüche und prüft die betroffenen Kapitel direkt danach erneut.
   * **Schreibt nicht** — liefert die Änderungen für die Vorschau zurück.
   */
  onRepairMany: (
    targets: { chapterIndex: number; violations: CanonViolation[] }[],
    callbacks: {
      onStarted: (chapterIndex: number) => void;
      onResult: (event: CanonRepairResultEvent) => void;
    },
    scope: CanonScopeSelection,
  ) => Promise<CanonRepairChange[]>;
  /** Schreibt die bestätigten Korrekturen ins Buch. */
  onApplyRepairs: (changes: CanonRepairChange[]) => void;
  /** Meldet ein Prüfergebnis für die Prüf-Historie des Kapitels. */
  onRecordCheck: (chapterIndex: number, result: CanonCheckResult, scopeLabel: string) => void;
  onClose: () => void;
}) {
  const [outcomes, setOutcomes] = useState<Map<number, ChapterOutcome>>(new Map());
  const [running, setRunning] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [repairing, setRepairing] = useState<Set<number>>(new Set());
  const [repairAllBusy, setRepairAllBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scopeId, setScopeId] = useState("all");
  const [factIds, setFactIds] = useState<Set<string>>(new Set());
  const [factsOpen, setFactsOpen] = useState(false);
  /** Abgewählte Widersprüche (`"<chapterIndex>:<violationIndex>"`); Default = alle markiert. */
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<CanonRepairChange[] | null>(null);
  /** Zustand **vor** einer Korrektur — wird bei „Verwerfen" wiederhergestellt. */
  const preRepairRef = useRef<Map<number, ChapterOutcome> | null>(null);
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
  const failed = sorted.filter((outcome) => outcome.error);
  const doneCount = outcomes.size;

  const scopeLabel = (): string => {
    if (scopeId === FACTS_SCOPE) return `Nur ${factIds.size} ausgewählte Fakten`;
    return scopes.find((scope) => scope.id === scopeId)?.label ?? "Gesamter Kanon";
  };

  const effectiveScope = (): CanonScopeSelection => ({
    scopeId,
    factIds: scopeId === FACTS_SCOPE ? [...factIds] : [],
    label: scopeLabel(),
  });

  const violationsOf = (chapterIndex: number): CanonViolation[] =>
    outcomes.get(chapterIndex)?.result?.violations ?? [];
  const selectedOf = (chapterIndex: number): CanonViolation[] =>
    violationsOf(chapterIndex).filter(
      (_, index) => !deselected.has(`${chapterIndex}:${index}`),
    );
  const selectedCount = sorted.reduce(
    (sum, outcome) => sum + selectedOf(outcome.chapter.index).length,
    0,
  );
  const totalViolations = sorted.reduce(
    (sum, outcome) => sum + (outcome.result?.violations.length ?? 0),
    0,
  );

  const canRun =
    canonAvailable && !(scopeId === FACTS_SCOPE && factIds.size === 0);

  const run = async () => {
    if (!canRun) return;
    setBusy(true);
    setError(null);
    setOutcomes(new Map());
    setRunning(new Set());
    setDeselected(new Set());
    progressRef.current = 0;

    const jobId = createJob({
      title: `Fakten-Check · ${scopeLabel()}`,
      kind: "canon-check",
      total: chapters.length,
    });

    try {
      await onStreamCheck(
        {
          onStarted: (chapterIndex) => setRunning((prev) => new Set(prev).add(chapterIndex)),
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
            if (result) onRecordCheck(chapterIndex, result, scopeLabel());
          },
        },
        effectiveScope(),
      );
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

  /** Behebt die **markierten** Widersprüche (gestreamt, mit Nachprüfung, ohne Schreiben). */
  const runRepair = async (
    targets: { chapterIndex: number; violations: CanonViolation[] }[],
  ) => {
    if (targets.length === 0) return;
    setError(null);
    setRepairAllBusy(true);
    progressRef.current = 0;
    preRepairRef.current = outcomes;

    const jobId = createJob({
      title: `Fakten-Korrektur · ${targets.length} Kapitel`,
      kind: "canon-repair",
      total: targets.length,
    });
    let failure: string | null = null;
    let aborted = false;

    try {
      const changes = await onRepairMany(
        targets,
        {
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
              setError(`Kapitel ${event.chapterIndex + 1}: ${event.error}`);
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
              onRecordCheck(event.chapterIndex, event.result, scopeLabel());
            }
          },
        },
        effectiveScope(),
      );

      if (changes.length > 0) {
        setPending(changes);
      } else {
        preRepairRef.current = null;
        showToast("Keine Stelle konnte geändert werden.", "info");
      }
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

  const applyPending = (chapterIndices: number[]) => {
    const changes = (pending ?? []).filter((change) =>
      chapterIndices.includes(change.chapterIndex),
    );
    const dismissed = (pending ?? []).filter(
      (change) => !chapterIndices.includes(change.chapterIndex),
    );
    onApplyRepairs(changes);
    // Nicht bestätigte Kapitel zeigen wieder ihren Vorher-Stand.
    if (dismissed.length > 0 && preRepairRef.current) {
      setOutcomes((prev) => {
        const next = new Map(prev);
        for (const change of dismissed) {
          const before = preRepairRef.current?.get(change.chapterIndex);
          if (before) next.set(change.chapterIndex, before);
        }
        return next;
      });
    }
    showToast(
      changes.length === 1
        ? "Kapitel-Korrektur übernommen"
        : `${changes.length} Kapitel-Korrekturen übernommen`,
      "ok",
    );
    setPending(null);
    preRepairRef.current = null;
  };

  const discardPending = () => {
    if (preRepairRef.current) setOutcomes(preRepairRef.current);
    preRepairRef.current = null;
    setPending(null);
    showToast("Korrektur verworfen — Text unverändert.", "info");
  };

  const repairableTargets = () =>
    sorted
      .filter((outcome) => selectedOf(outcome.chapter.index).length > 0 && !outcome.error)
      .map((outcome) => ({
        chapterIndex: outcome.chapter.index,
        violations: selectedOf(outcome.chapter.index),
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
      if (event.key === "Escape" && !repairAllBusy && !pending) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, repairAllBusy, pending, onClose]);

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
            <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-[220px] flex-1 space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Umfang
                  </span>
                  <Select
                    value={scopeId}
                    onValueChange={(value) => {
                      setScopeId(value);
                      if (value === FACTS_SCOPE) setFactsOpen(true);
                    }}
                    disabled={busyOverall}
                  >
                    <SelectTrigger className="glass w-full rounded-lg border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {scopes.map((scope) => (
                        <SelectItem key={scope.id} value={scope.id}>
                          {scope.label}
                        </SelectItem>
                      ))}
                      {facts.length > 0 ? (
                        <SelectItem value={FACTS_SCOPE}>
                          Nur ausgewählte Fakten ({factIds.size})
                        </SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                </label>
                <Button
                  size="sm"
                  className="h-9 rounded-lg bg-gradient-to-r from-brand-emerald to-brand-cyan font-semibold text-white disabled:opacity-50"
                  onClick={() => void run()}
                  disabled={busyOverall || !canRun}
                  title="Mit dem gewählten Umfang prüfen"
                >
                  <RefreshCw className="size-3.5" />
                  Prüfen
                </Button>
              </div>

              {scopeId === FACTS_SCOPE ? (
                <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-2.5">
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                    onClick={() => setFactsOpen((prev) => !prev)}
                  >
                    {factsOpen ? "Fakten ausblenden" : `Fakten auswählen (${factIds.size})`}
                  </button>
                  {factsOpen ? (
                    <div className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1">
                      {facts.map((fact) => (
                        <label
                          key={fact.id}
                          className="flex items-start gap-2 rounded-md px-1 py-0.5 text-[11px] text-foreground/85 hover:bg-white/5"
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 size-3.5 accent-brand-emerald"
                            checked={factIds.has(fact.id)}
                            onChange={() =>
                              setFactIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(fact.id)) next.delete(fact.id);
                                else next.add(fact.id);
                                return next;
                              })
                            }
                          />
                          <span className="min-w-0">{fact.label}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {canonAvailable ? (
            <div
              className={cn(
                "mb-5 rounded-xl border p-4",
                busy
                  ? "border-brand-cyan/20 bg-brand-cyan/5"
                  : totalViolations === 0
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
                  ) : totalViolations === 0 ? (
                    <>
                      <CheckCircle2 className="size-4 text-brand-emerald" />
                      Kein Widerspruch zum Kanon
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="size-4 text-brand-amber" />
                      {totalViolations === 1
                        ? "1 Widerspruch zum Kanon"
                        : `${totalViolations} Widersprüche zum Kanon`}
                      {selectedCount !== totalViolations
                        ? ` · ${selectedCount} markiert`
                        : ""}
                    </>
                  )}
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  {deselected.size > 0 && totalViolations > 0 ? (
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                      onClick={() => setDeselected(new Set())}
                      disabled={busyOverall}
                    >
                      Alle markieren
                    </button>
                  ) : null}
                  {totalViolations > 0 && !busy ? (
                    <Button
                      size="sm"
                      className="h-8 rounded-lg bg-gradient-to-r from-brand-emerald to-brand-cyan font-semibold text-white disabled:opacity-50"
                      onClick={() => void runRepair(repairableTargets())}
                      disabled={repairAllBusy || repairing.size > 0 || selectedCount === 0}
                      title="Nur die markierten Widersprüche korrigieren und danach erneut prüfen"
                    >
                      {repairAllBusy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Wand2 className="size-3.5" />
                      )}
                      Markierte beheben ({selectedCount})
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    className="glass h-8 rounded-lg border-white/10"
                    onClick={() => void run()}
                    disabled={busyOverall || !canRun}
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
                const chapterSelected = selectedOf(chapter.index).length;

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
                              {chapterSelected === count
                                ? count === 1
                                  ? "1 Widerspruch"
                                  : `${count} Widersprüche`
                                : `${chapterSelected}/${count} markiert`}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="glass h-7 rounded-lg border-white/10 px-2 text-[11px]"
                              onClick={() =>
                                void runRepair([
                                  {
                                    chapterIndex: chapter.index,
                                    violations: selectedOf(chapter.index),
                                  },
                                ])
                              }
                              disabled={busyOverall || repairing.size > 0 || chapterSelected === 0}
                              title="Nur dieses Kapitel korrigieren und danach erneut prüfen"
                            >
                              <Wand2 className="size-3" />
                              Beheben ({chapterSelected})
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {count > 0 ? (
                      <ul className="mt-2 space-y-2">
                        {outcome?.result?.violations.map((violation, index) => {
                          const key = `${chapter.index}:${index}`;
                          const checked = !deselected.has(key);
                          return (
                            <li
                              key={key}
                              className={cn(
                                "rounded-lg border p-2.5 transition-colors",
                                checked
                                  ? "border-white/10 bg-white/5"
                                  : "border-white/5 bg-white/[0.02] opacity-55",
                              )}
                            >
                              <label className="flex items-start gap-2">
                                <input
                                  type="checkbox"
                                  className="mt-0.5 size-3.5 accent-brand-emerald"
                                  checked={checked}
                                  disabled={busyOverall}
                                  onChange={() =>
                                    setDeselected((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(key)) next.delete(key);
                                      else next.add(key);
                                      return next;
                                    })
                                  }
                                />
                                <span className="min-w-0">
                                  <span className="text-[11px] font-semibold text-brand-amber">
                                    {violation.fact}
                                    {violation.part ? (
                                      <span className="ml-2 font-normal text-muted-foreground">
                                        Teil {violation.part}
                                      </span>
                                    ) : null}
                                    {violation.quoteVerified === false ? (
                                      <span
                                        className="ml-2 rounded-full border border-brand-amber/40 bg-brand-amber/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-amber"
                                        title="Das Zitat steht nicht wörtlich im Kapiteltext — das Modell hat umformuliert oder erfunden. Der Befund kann trotzdem stimmen, ist aber nicht belegt."
                                      >
                                        ohne Beleg
                                      </span>
                                    ) : null}
                                  </span>
                                  <span className="mt-1 block text-xs italic text-foreground/85">
                                    „{violation.quote}“
                                  </span>
                                  {violation.fix ? (
                                    <span className="mt-1 block text-[11px] text-muted-foreground">
                                      {violation.fix}
                                    </span>
                                  ) : null}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                );
              })}

              {doneCount === 0 && !busy ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Keine Ergebnisse — „Prüfen" starten.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <CanonRepairPreviewDialog
        open={Boolean(pending)}
        changes={pending ?? []}
        onApply={applyPending}
        onDiscard={discardPending}
      />
    </div>
  );
}
