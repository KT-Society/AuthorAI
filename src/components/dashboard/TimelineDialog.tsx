import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Hourglass, Loader2, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { TimelineResult } from "@/services/story";

export interface TimelineEntry {
  chapter: number;
  title: string;
  scenes: { text: string; time?: string; setting?: string; pov?: string }[];
}

export function TimelineDialog({
  open,
  entries,
  onCheck,
  onClose,
}: {
  open: boolean;
  entries: TimelineEntry[];
  onCheck: () => Promise<TimelineResult>;
  onClose: () => void;
}) {
  const [result, setResult] = useState<TimelineResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * React StrictMode führt Effekte im Dev-Modus doppelt aus (mount → cleanup → mount).
   * Der Guard verhindert, dass der Check dadurch zweimal gesendet wird.
   */
  const startedRef = useRef(false);

  const run = () => {
    setBusy(true);
    setError(null);
    onCheck()
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
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  const isFlagged = (chapterNumber: number) =>
    Boolean(result?.findings.some((finding) => finding.includes(`Kapitel ${chapterNumber}`)));

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
            disabled={busy}
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

          {busy ? (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-brand-cyan/20 bg-brand-cyan/5 px-4 py-3 text-sm text-brand-cyan">
              <Loader2 className="size-4 animate-spin" />
              Chronologie wird geprüft…
            </div>
          ) : null}

          {result ? (
            <div className="mb-5 rounded-xl border border-white/10 bg-white/5 p-3">
              {result.findings.length > 0 ? (
                <>
                  <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold text-brand-amber">
                    <AlertTriangle className="size-3.5" />
                    {result.findings.length} Hinweis(e)
                  </p>
                  <ul className="space-y-1 text-sm">
                    {result.findings.map((finding, index) => (
                      <li key={index} className="text-brand-amber">
                        • {finding}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
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

        <div className="flex justify-end gap-2 border-t border-white/10 p-5">
          <Button
            variant="outline"
            className="glass rounded-xl border-white/10"
            onClick={run}
            disabled={busy}
          >
            <RefreshCw className={cn("size-4", busy && "animate-spin")} />
            Erneut prüfen
          </Button>
        </div>
      </div>
    </div>
  );
}
