import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { countWords } from "@/data/story";
import type { ChapterContent } from "@/data/story";
import { diffStats, diffWords } from "@/lib/diff";
import { cn } from "@/lib/utils";

import { DiffView } from "./DiffView";

interface VersionOption {
  id: string;
  label: string;
}

const CURRENT = "current";

/**
 * Versions-Diff: vergleicht zwei Fassungen eines Kapitels („Aktueller Stand" oder eine
 * gespeicherte Version) Wort für Wort. Entferntes rot/durchgestrichen, Neues grün.
 */
export function VersionDiffDialog({
  open,
  chapter,
  onClose,
}: {
  open: boolean;
  chapter: ChapterContent;
  onClose: () => void;
}) {
  const options = useMemo<VersionOption[]>(
    () => [
      { id: CURRENT, label: "Aktueller Stand" },
      ...(chapter.history ?? []).map((version) => ({
        id: version.at,
        label: `${version.note ?? "Version"} · ${new Date(version.at).toLocaleString("de-DE")} · ${
          countWords(version.expanded || version.draft)
        } W`,
      })),
    ],
    [chapter],
  );

  const [leftId, setLeftId] = useState(CURRENT);
  const [rightId, setRightId] = useState(options[1]?.id ?? CURRENT);

  // Beim Öffnen auf sinnvolle Vorgaben zurücksetzen: aktueller Stand ↔ jüngste Version.
  useEffect(() => {
    if (!open) return;
    setLeftId(CURRENT);
    setRightId(options[1]?.id ?? CURRENT);
  }, [open, options]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const textOf = (id: string): string => {
    if (id === CURRENT) return chapter.expanded || chapter.draft || "";
    const version = (chapter.history ?? []).find((entry) => entry.at === id);
    return version ? version.expanded || version.draft || "" : "";
  };

  const parts = useMemo(
    () => diffWords(textOf(leftId), textOf(rightId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chapter, leftId, rightId],
  );
  const stats = diffStats(parts);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="glass-strong float-in flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-violet to-brand-cyan text-white">
              <ArrowLeftRight className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Versions-Vergleich</h2>
              <p className="text-xs text-muted-foreground">
                {countWords(chapter.expanded || chapter.draft)} Wörter aktuell ·{" "}
                {chapter.history?.length ?? 0} Version(en)
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-lg text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-b border-white/10 px-5 py-4">
          <label className="min-w-[220px] flex-1 space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Vergleich (alt)
            </span>
            <Select value={leftId} onValueChange={setLeftId}>
              <SelectTrigger className="glass w-full rounded-lg border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <span className="pb-2.5 text-muted-foreground">
            <ArrowLeftRight className="size-4" />
          </span>

          <label className="min-w-[220px] flex-1 space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Gegen (neu)
            </span>
            <Select value={rightId} onValueChange={setRightId}>
              <SelectTrigger className="glass w-full rounded-lg border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div className="flex items-center gap-2 pb-1 text-[11px]">
            <span className="rounded-full border border-brand-emerald/30 bg-brand-emerald/10 px-2 py-0.5 font-semibold text-brand-emerald">
              +{stats.added}
            </span>
            <span className="rounded-full border border-brand-rose/30 bg-brand-rose/10 px-2 py-0.5 font-semibold text-brand-rose">
              −{stats.removed}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {leftId === rightId ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Beide Seiten sind dieselbe Fassung — wähle unterschiedliche Quellen.
            </p>
          ) : (
            <div className={cn("rounded-xl border border-white/10 bg-white/5 p-4")}>
              <DiffView parts={parts} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
