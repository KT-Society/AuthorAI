import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Hourglass, Loader2, RefreshCw, Wand2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { showToast } from "@/lib/toast";

import type { TimelineFinding, TimelineResult } from "@/services/story";

import { TimelineRepairPreviewDialog } from "./TimelineRepairPreviewDialog";
import type { TimelineRepairChange } from "./TimelineRepairPreviewDialog";

export interface TimelineEntry {
  chapter: number;
  title: string;
  scenes: { text: string; time?: string; setting?: string; pov?: string }[];
}

export function TimelineDialog({
  open,
  entries,
  onCheck,
  onRepair,
  onApplyRepairs,
  onClose,
}: {
  open: boolean;
  entries: TimelineEntry[];
  /** Prüft die Chronologie — `onFinding` meldet jeden Befund, sobald er eintrifft. */
  onCheck: (handlers: { onFinding: (finding: TimelineFinding) => void }) => Promise<TimelineResult>;
  /**
   * Quick Fix: liefert die vorgeschlagenen Änderungen — geschrieben wird erst nach Bestätigung.
   * `onChapter` meldet jeden Vorschlag live, während das Modell arbeitet.
   */
  onRepair?: (
    findings: TimelineFinding[],
    handlers: { onChapter: (change: TimelineRepairChange) => void },
  ) => Promise<TimelineRepairChange[]>;
  /** Schreibt die bestätigten Kapitel-Korrekturen. */
  onApplyRepairs?: (changes: TimelineRepairChange[]) => void;
  onClose: () => void;
}) {
  const [result, setResult] = useState<TimelineResult | null>(null);
  const [busy, setBusy] = useState(false);
  /** Läuft gerade die Korrektur (statt der Prüfung)? */
  const [repairing, setRepairing] = useState(false);
  const [pending, setPending] = useState<TimelineRepairChange[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * React StrictMode führt Effekte im Dev-Modus doppelt aus (mount → cleanup → mount).
   * Der Guard verhindert, dass der Check dadurch zweimal gesendet wird.
   */
  const startedRef = useRef(false);

  const run = () => {
    setBusy(true);
    setError(null);
    // Leeres Ergebnis vorlegen: die Befunde wachsen dann live hinein.
    setResult({ summary: "", findings: [] });
    onCheck({
      onFinding: (finding) =>
        setResult((prev) => ({
          summary: prev?.summary ?? "",
          findings: [...(prev?.findings ?? []), finding],
        })),
    })
      .then((value) => setResult(value))
      .catch((err) => setError(err instanceof Error ? err.message : "Unbekannter Fehler."))
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    if (!open || startedRef.current) return;
    startedRef.current = true;
    setResult(null);
    setError(null);
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // Bei offener Vorschau gehört Escape der Vorschau (sie schließt sich selbst).
      if (event.key === "Escape" && !busy && !repairing && !pending) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, repairing, pending, onClose]);

  if (!open) return null;

  const findings = result?.findings ?? [];
  const isFlagged = (chapterNumber: number) => findings.some((f) => f.chapter === chapterNumber);

  /** Quick Fix starten: Vorschau sofort öffnen, Vorschläge live einsammeln — nichts schreiben. */
  const startRepair = async () => {
    if (!onRepair || findings.length === 0) return;
    setRepairing(true);
    setError(null);
    setPending([]);
    try {
      const changes = await onRepair(findings, {
        onChapter: (change) =>
          setPending((prev) => (prev ?? []).some((item) => item.chapterIndex === change.chapterIndex)
            ? prev
            : [...(prev ?? []), change]),
      });
      if (changes.length === 0) {
        setPending(null);
        showToast("Keine Änderung vorgeschlagen — bitte einen Blick auf die Hinweise werfen.", "info");
      } else {
        // Verbindlich ist die validierte Fassung aus dem Abschluss.
        setPending(changes);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
      setPending(null);
    } finally {
      setRepairing(false);
    }
  };

  const applyPending = (chapterIndices: number[]) => {
    const chosen = (pending ?? []).filter((change) =>
      chapterIndices.includes(change.chapterIndex),
    );
    setPending(null);
    if (chosen.length === 0) return;
    onApplyRepairs?.(chosen);
    showToast(
      chosen.length === 1
        ? `Timeline-Korrektur in Kapitel ${chosen[0]!.chapterIndex + 1} übernommen`
        : `Timeline-Korrektur in ${chosen.length} Kapiteln übernommen`,
      "ok",
    );
    // Direkt nachprüfen: zeigt, was jetzt noch offen ist.
    setResult(null);
    run();
  };

  const discardPending = () => {
    setPending(null);
    showToast("Timeline-Korrektur verworfen — Struktur unverändert.", "info");
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onClick={() => !busy && onClose()}
    >
      <div
        className="glass-strong float-in flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-violet to-brand-cyan text-white">
              <Hourglass className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Timeline</h2>
              <p className="text-xs text-muted-foreground">
                Chronologie aller Szenen · Widersprüche werden markiert
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-lg text-muted-foreground hover:text-foreground"
            onClick={onClose}
            disabled={busy || repairing}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {error ? (
            <p className="mb-4 rounded-xl border border-brand-rose/30 bg-brand-rose/10 px-3 py-2 text-sm text-brand-rose">
              {error}
            </p>
          ) : null}

          {busy || repairing ? (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-brand-cyan/20 bg-brand-cyan/5 px-4 py-3 text-sm text-brand-cyan">
              <Loader2 className="size-4 animate-spin" />
              {repairing ? "Korrektur wird vorbereitet…" : "Chronologie wird geprüft…"}
            </div>
          ) : null}

          {result ? (
            <div className="mb-5 rounded-xl border border-white/10 bg-white/5 p-3">
              {findings.length > 0 ? (
                <>
                  <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold text-brand-amber">
                    <AlertTriangle className="size-3.5" />
                    {findings.length} Hinweis(e){busy ? " · sammelt…" : ""}
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    {findings.map((finding, index) => (
                      <li key={index} className="text-brand-amber">
                        • {finding.issue}
                        {finding.chapter > 0 ? (
                          <span className="ml-1.5 text-[10px] text-muted-foreground">
                            (Kapitel {finding.chapter}
                            {finding.scene ? `, Szene ${finding.scene}` : ""})
                          </span>
                        ) : null}
                        {finding.fix ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            Vorschlag: {finding.fix}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              ) : busy ? null : (
                <p className="inline-flex items-center gap-2 text-sm text-brand-emerald">
                  <CheckCircle2 className="size-4" />
                  {result.summary || "Keine Widersprüche gefunden."}
                </p>
              )}
            </div>
          ) : null}

          <ol className="space-y-4">
            {entries.map((entry) => (
              <li key={entry.chapter}>
                <p
                  className={cn(
                    "mb-2 inline-flex items-center gap-2 text-sm font-semibold",
                    isFlagged(entry.chapter) && "text-brand-amber",
                  )}
                >
                  {isFlagged(entry.chapter) ? <AlertTriangle className="size-3.5" /> : null}
                  {entry.chapter}. {entry.title}
                </p>
                <div className="space-y-1.5 border-l border-white/10 pl-3">
                  {entry.scenes.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">Keine Szenen erfasst.</p>
                  ) : (
                    entry.scenes.map((scene, index) => (
                      <div key={index} className="rounded-lg border border-white/10 bg-white/5 p-2">
                        <p className="text-xs text-foreground/85">
                          {scene.time ? (
                            <span className="mr-1.5 rounded bg-black/30 px-1.5 py-0.5 text-[10px] font-semibold text-brand-cyan">
                              {scene.time}
                            </span>
                          ) : null}
                          {scene.text}
                        </p>
                        {scene.setting || scene.pov ? (
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {scene.pov ? `POV: ${scene.pov}` : ""}
                            {scene.pov && scene.setting ? " · " : ""}
                            {scene.setting ? `Schauplatz: ${scene.setting}` : ""}
                          </p>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 p-5">
          {onRepair && findings.length > 0 ? (
            <Button
              className="rounded-xl bg-gradient-to-r from-brand-amber to-brand-cyan font-semibold text-white disabled:opacity-50"
              onClick={() => void startRepair()}
              disabled={busy || repairing}
            >
              {repairing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Wand2 className="size-4" />
              )}
              Quick Fix ({findings.length})
            </Button>
          ) : null}
          <Button
            variant="outline"
            className="glass rounded-xl border-white/10"
            onClick={run}
            disabled={busy || repairing}
          >
            <RefreshCw className={cn("size-4", busy && "animate-spin")} />
            Erneut prüfen
          </Button>
        </div>
      </div>

      <TimelineRepairPreviewDialog
        open={Boolean(pending)}
        changes={pending ?? []}
        running={repairing}
        onApply={applyPending}
        onDiscard={discardPending}
      />
    </div>
  );
}
