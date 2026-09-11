import { useEffect, useState } from "react";
import { Check, Image as ImageIcon, Loader2, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { Storyboard } from "@/data/story";
import { buildCoverPrompt, deleteCover, generateCover } from "@/services/cover";

export function CoverVariantsDialog({
  open,
  storyboard,
  count = 3,
  onClose,
  onPick,
}: {
  open: boolean;
  storyboard: Storyboard | undefined;
  count?: number;
  onClose: () => void;
  onPick: (url: string) => void;
}) {
  const [variants, setVariants] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!open || !storyboard) return;
    let active = true;
    setBusy(true);
    setError(null);
    setVariants([]);

    (async () => {
      const urls: string[] = [];
      try {
        for (let index = 0; index < count; index += 1) {
          urls.push(await generateCover({ prompt: buildCoverPrompt(storyboard) }));
        }
        if (active) setVariants(urls);
      } catch (err) {
        // Bereits erzeugte Varianten wieder aufräumen
        for (const url of urls) void deleteCover(url);
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
      if (event.key === "Escape" && !busy) closeAll();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const closeAll = () => {
    for (const url of variants) void deleteCover(url);
    setVariants([]);
    onClose();
  };

  const pick = (url: string) => {
    for (const other of variants) {
      if (other !== url) void deleteCover(other);
    }
    setVariants([]);
    onPick(url);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onClick={() => !busy && closeAll()}
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
                {count} Entwürfe zur Auswahl — nicht gewählte werden wieder gelöscht.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-lg text-muted-foreground hover:text-foreground"
            onClick={closeAll}
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
              <button
                key={url}
                type="button"
                onClick={() => pick(url)}
                className={cn(
                  "group relative overflow-hidden rounded-xl border border-white/10 transition-all",
                  "hover:-translate-y-1 hover:border-brand-cyan/50",
                )}
                title="Diese Variante übernehmen"
              >
                <img src={url} alt={`Variante ${index + 1}`} className="block h-auto w-full" />
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/60 px-2 py-1.5 text-[11px] font-semibold text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
                  <Check className="size-3.5" />
                  Übernehmen
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
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
