import { useEffect, useRef, useState } from "react";
import { Check, Image as ImageIcon, Loader2, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { Storyboard } from "@/data/story";
import { buildCoverPrompt, generateCover } from "@/services/cover";

export function CoverVariantsDialog({
  open,
  storyboard,
  count = 3,
  onClose,
  onGenerated,
}: {
  open: boolean;
  storyboard: Storyboard | undefined;
  count?: number;
  onClose: () => void;
  /** Alle erzeugten Entwürfe — der Aufrufer verwaltet sie als Kandidaten. */
  onGenerated: (urls: string[]) => void;
}) {
  const [variants, setVariants] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  /**
   * StrictMode führt Effekte doppelt aus — ohne Guard würden statt 3 Bildern
   * sechs generiert (und bezahlt).
   */
  const runKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !storyboard) return;
    const runKey = `${count}:${round}`;
    if (runKeyRef.current === runKey) return;
    runKeyRef.current = runKey;

    let active = true;
    setBusy(true);
    setError(null);
    const urls: string[] = [];

    (async () => {
      try {
        for (let index = 0; index < count; index += 1) {
          urls.push(await generateCover({ prompt: buildCoverPrompt(storyboard) }));
        }
        if (active) setVariants(urls);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
      } finally {
        if (active) setBusy(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [open, storyboard, count, round]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onClick={() => !busy && onClose()}
    >
      <div
        className="glass-strong float-in w-full max-w-4xl rounded-2xl p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-violet to-brand-cyan text-white">
              <ImageIcon className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Cover-Varianten</h2>
              <p className="text-xs text-muted-foreground">
                {count} Entwürfe — sie landen als Kandidaten im Buch und lassen sich dort vergleichen.
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

        {error ? (
          <p className="mt-4 rounded-xl border border-brand-rose/30 bg-brand-rose/10 px-3 py-2 text-sm text-brand-rose">
            {error}
          </p>
        ) : null}

        {busy ? (
          <div className="mt-6 flex flex-col items-center gap-3 py-16 text-center">
            <Loader2 className="size-6 animate-spin text-brand-cyan" />
            <p className="text-sm text-muted-foreground">Varianten werden generiert…</p>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {variants.map((url, index) => (
              <div
                key={url}
                className={cn(
                  "relative overflow-hidden rounded-xl border border-white/10 transition-all",
                  "hover:border-brand-cyan/50",
                )}
              >
                <img src={url} alt={`Variante ${index + 1}`} className="block h-auto w-full" />
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                  <Check className="size-3" />
                  Kandidat {index + 1}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="outline"
            className="glass rounded-xl border-white/10"
            onClick={() => {
              if (variants.length > 0) onGenerated(variants);
            }}
            disabled={busy || variants.length === 0}
          >
            <Check className="size-4" />
            Als Kandidaten übernehmen
          </Button>
          <Button
            variant="outline"
            className="glass rounded-xl border-white/10"
            onClick={() => setRound((prev) => prev + 1)}
            disabled={busy}
          >
            <RefreshCw className="size-4" />
            Neue Varianten
          </Button>
        </div>
      </div>
    </div>
  );
}

