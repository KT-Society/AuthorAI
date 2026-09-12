import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";

import { createJob, finishJob, isCancelled, updateJob } from "@/lib/jobs";
import type { CanonCheckResult } from "@/services/continuity";

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
 * Läuft als kleine Queue im Dialog — pro Kapitel ein Aufruf (serverseitig gechunkt).
 */
export function CanonCheckDialog({
  open,
  chapters,
  canonAvailable,
  onCheck,
  onClose,
}: {
  open: boolean;
  chapters: CanonCheckChapter[];
  canonAvailable: boolean;
  onCheck: (chapterIndex: number) => Promise<CanonCheckResult>;
  onClose: () => void;
}) {
  const [outcomes, setOutcomes] = useState<ChapterOutcome[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** StrictMode führt Effekte doppelt aus — Guard verhindert doppelte Läufe. */
  const startedRef = useRef(false);

  const run = async () => {
    if (!canonAvailable) return;
    setBusy(true);
    setError(null);
    setOutcomes([]);
    setProgress({ done: 0, total: chapters.length });

    const jobId = createJob({
      title: `Fakten-Check · ${chapters.length} Kapitel`,
      kind: "canon-check",
      total: chapters.length,
    });

    const collected: ChapterOutcome[] = [];
    let aborted = false;
    let failure: string | null = null;

    for (let position = 0; position < chapters.length; position += 1) {
      const chapter = chapters[position];
      if (!chapter) continue;
      if (isCancelled(jobId)) {
        aborted = true;
        break;
      }
      updateJob(jobId, { done: position, label: `Kapitel ${chapter.index + 1}` });
      try {
        const result = await onCheck(chapter.index);
        collected.push({ chapter, result });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unbekannter Fehler.";
        failure = message;
        collected.push({ chapter, error: message });
      }
      setOutcomes([...collected]);
      setProgress({ done: position + 1, total: chapters.length });
    }

    const violations = collected.reduce(
      (sum, outcome) => sum + (outcome.result?.violations.length ?? 0),
      0,
    );
    if (aborted) {
      finishJob(jobId, "cancelled", "Fakten-Check abgebrochen");
    } else if (failure && collected.every((outcome) => outcome.error)) {
      finishJob(jobId, "error", failure);
    } else {
      updateJob(jobId, { done: chapters.length });
      finishJob(jobId, "done", `${violations} Widerspruch/Widersprüche`);
    }

    setBusy(false);
  };

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
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const violations = outcomes.flatMap((outcome) => outcome.result?.violations ?? []);
  const failed = outcomes.filter((outcome) => outcome.error);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onClick={() => !busy && onClose()}
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
            disabled={busy}
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

          {busy ? (
            <div className="mb-4 rounded-xl border border-brand-cyan/20 bg-brand-cyan/5 px-4 py-3 text-sm text-brand-cyan">
              <p className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Prüfe Kapitel {Math.min(progress.done + 1, progress.total)}/{progress.total}…
              </p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-emerald to-brand-cyan transition-all duration-300"
                  style={{
                    width: `${progress.total === 0 ? 0 : (progress.done / progress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          ) : null}

          {canonAvailable && !busy ? (
            <div
              className={
                violations.length === 0
                  ? "mb-5 rounded-xl border border-brand-emerald/30 bg-brand-emerald/10 p-4"
                  : "mb-5 rounded-xl border border-brand-amber/30 bg-brand-amber/10 p-4"
              }
            >
              <p className="inline-flex items-center gap-2 text-sm font-semibold">
                {violations.length === 0 ? (
                  <>
                    <CheckCircle2 className="size-4 text-brand-emerald" />
                    Kein Widerspruch zum Kanon
                  </>
                ) : (
                  <>
                    <AlertTriangle className="size-4 text-brand-amber" />
                    {violations.length === 1
                      ? "1 Widerspruch"
                      : `${violations.length} Widersprüche`}{" "}
                    zum Kanon
                  </>
                )}
              </p>
              {failed.length > 0 ? (
                <p className="mt-1 text-[11px] text-brand-rose">
                  {failed.length} Kapitel konnten nicht geprüft werden.
                </p>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                className="glass mt-3 h-8 rounded-lg border-white/10"
                onClick={() => void run()}
              >
                <RefreshCw className="size-3.5" />
                Erneut prüfen
              </Button>
            </div>
          ) : null}

          {!busy && outcomes.length > 0 ? (
            <div className="space-y-3">
              {outcomes.map((outcome) => (
                <div key={outcome.chapter.index} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs font-semibold">
                    Kapitel {outcome.chapter.index + 1}
                    {outcome.chapter.title ? `: ${outcome.chapter.title}` : ""}
                  </p>

                  {outcome.error ? (
                    <p className="mt-1 text-[11px] text-brand-rose">{outcome.error}</p>
                  ) : (outcome.result?.violations.length ?? 0) === 0 ? (
                    <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-brand-emerald">
                      <CheckCircle2 className="size-3" />
                      keine Widersprüche
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {outcome.result?.violations.map((violation, index) => (
                        <li
                          key={`${outcome.chapter.index}-${index}`}
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
                          <p className="mt-1 text-xs italic text-foreground/85">„{violation.quote}“</p>
                          {violation.fix ? (
                            <p className="mt-1 text-[11px] text-muted-foreground">{violation.fix}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
