import { useEffect, useMemo, useState } from "react";
import { CheckCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SceneMeta } from "@/data/story";
import type { DerivedScene } from "@/services/story";
import { diffStats, diffWords } from "@/lib/diff";
import { cn } from "@/lib/utils";

import { DiffView } from "./DiffView";

/** Ein Kapitel mit abgeleiteten Szenen, das auf Bestätigung wartet. */
export interface SceneDeriveEntry {
  index: number;
  title: string;
  /** Was die Ableitung vorschlägt. */
  scenes: DerivedScene[];
  /** Der aktuelle Stand — nur für den Vergleich, geschrieben wird er nicht. */
  before: { beats: string[]; metas: SceneMeta[]; characters: string[][] };
}

/** Ein Storyboard-Feld vorher/nachher. */
export interface StoryboardDeriveRow {
  label: string;
  before: string;
  after: string;
}

/** Die abgeleiteten Storyboard-Daten samt Vergleichsgrundlage. */
export interface StoryboardDerivePlan {
  rows: StoryboardDeriveRow[];
  /** Je Kapitel die Kurzfassung vorher/nachher. */
  chapters: { index: number; title: string; before: string; after: string }[];
  /** Neu erkannte Figurennamen (angelegt werden sie erst beim Übernehmen). */
  characters: string[];
  /** Theme-Vorschläge (Mehrfachwerte, deshalb nicht als Zeile im Vergleich). */
  themes: string[];
}

export type DerivePreview =
  | { kind: "scenes"; entries: SceneDeriveEntry[] }
  | { kind: "storyboard"; plan: StoryboardDerivePlan };

/** „fill" füllt nur leere Felder, „overwrite" ersetzt auch vorhandene Angaben. */
export type DeriveMode = "fill" | "overwrite";

/** Welche Zeile würde sich in diesem Modus tatsächlich ändern? */
function rowChanges(row: StoryboardDeriveRow, mode: DeriveMode): boolean {
  if (!row.after.trim()) return false;
  if (mode === "fill") return !row.before.trim();
  return row.after.trim() !== row.before.trim();
}

/**
 * Diff-Vorschau vor dem Übernehmen einer **Ableitung** (Storyboard oder Szenen).
 *
 * Bisher schrieben beide Ableitungen direkt in den State — bei einem teuren Lauf war das ein
 * Blindflug: Man sah erst hinterher, was überschrieben wurde. Diese Vorschau hält das Ergebnis im
 * Speicher, zeigt je Feld bzw. je Kapitel den Unterschied und schreibt erst nach Bestätigung.
 * Verwerfen kostet damit nur den bereits bezahlten Modellaufruf, nicht die Daten.
 */
export function DerivePreviewDialog({
  preview,
  onApply,
  onDiscard,
}: {
  preview: DerivePreview | null;
  onApply: (mode: DeriveMode, chapterIndices: number[]) => void;
  onDiscard: () => void;
}) {
  const [mode, setMode] = useState<DeriveMode>("overwrite");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!preview) return;
    setMode("overwrite");
    setSelected(
      new Set(preview.kind === "scenes" ? preview.entries.map((entry) => entry.index) : []),
    );
  }, [preview]);

  useEffect(() => {
    if (!preview) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDiscard();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [preview, onDiscard]);

  const sceneDiffs = useMemo(() => {
    if (preview?.kind !== "scenes") return [];
    return preview.entries.map((entry) => ({
      entry,
      // Vorher = die bisherigen Beats; nachher = die abgeleiteten Beat-Zeilen.
      parts: diffWords(entry.before.beats.join("\n"), entry.scenes.map((scene) => scene.text).join("\n")),
    }));
  }, [preview]);

  if (!preview) return null;

  const isScenes = preview.kind === "scenes";
  const changedRows =
    preview.kind === "storyboard" ? preview.plan.rows.filter((row) => rowChanges(row, mode)) : [];
  const changedChapters =
    preview.kind === "storyboard"
      ? preview.plan.chapters.filter((chapter) => {
          if (!chapter.after.trim()) return false;
          if (mode === "fill") return !chapter.before.trim();
          return chapter.after.trim() !== chapter.before.trim();
        })
      : [];
  const changedCount = isScenes ? selected.size : changedRows.length + changedChapters.length;

  const toggle = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
      onClick={onDiscard}
    >
      <div
        className="glass-strong float-in flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-brand-cyan/10 p-2 text-brand-cyan">
              <CheckCheck className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">
                {isScenes ? "Abgeleitete Szenen prüfen" : "Abgeleitetes Storyboard prüfen"}
              </h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {isScenes
                  ? "Beats, Zeit, Schauplatz, POV und Figuren je Kapitel — geschrieben wird erst nach dem Übernehmen."
                  : "Nur was sich wirklich ändert, ist hervorgehoben. Geschrieben wird erst nach dem Übernehmen."}
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

        {!isScenes ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-5 py-3">
            <span className="text-[11px] text-muted-foreground">Übernehmen:</span>
            {(
              [
                { value: "overwrite", label: "alles überschreiben" },
                { value: "fill", label: "nur leere Felder füllen" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setMode(option.value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
                  mode === option.value
                    ? "border-brand-cyan/40 bg-brand-cyan/10 text-brand-cyan"
                    : "border-white/10 text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          {isScenes
            ? sceneDiffs.map(({ entry, parts }) => {
                const isSelected = selected.has(entry.index);
                const stats = diffStats(parts);
                return (
                  <div
                    key={entry.index}
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
                          onChange={() => toggle(entry.index)}
                          className="size-3.5 accent-brand-emerald"
                        />
                        Kapitel {entry.index + 1}
                        {entry.title ? `: ${entry.title}` : ""}
                        <span className="font-normal text-muted-foreground">
                          · {entry.scenes.length}{" "}
                          {entry.scenes.length === 1 ? "Szene" : "Szenen"}
                        </span>
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

                    <ul className="mt-2 space-y-1">
                      {entry.scenes.map((scene, sceneIndex) => {
                        const meta = [
                          scene.time ? `Zeit: ${scene.time}` : "",
                          scene.setting ? `Schauplatz: ${scene.setting}` : "",
                          scene.pov ? `POV: ${scene.pov}` : "",
                          scene.characters.length > 0 ? `Figuren: ${scene.characters.join(", ")}` : "",
                        ].filter(Boolean);
                        return (
                          <li key={sceneIndex} className="text-[11px] text-muted-foreground">
                            <span className="font-medium text-foreground/80">
                              Szene {sceneIndex + 1}:
                            </span>{" "}
                            {meta.length > 0 ? meta.join(" · ") : "keine Zusatzangaben"}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })
            : null}

          {preview.kind === "storyboard" ? (
            <>
              {changedRows.length === 0 && changedChapters.length === 0 ? (
                <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-muted-foreground">
                  In diesem Modus würde sich nichts ändern.
                </p>
              ) : null}

              {changedRows.map((row) => (
                <div
                  key={row.label}
                  className="rounded-xl border border-brand-cyan/25 bg-brand-cyan/5 p-3"
                >
                  <span className="text-xs font-semibold">{row.label}</span>
                  <div className="mt-2 rounded-lg border border-white/10 bg-white/5 p-3">
                    <DiffView parts={diffWords(row.before, row.after)} />
                  </div>
                </div>
              ))}

              {changedChapters.map((chapter) => (
                <div
                  key={chapter.index}
                  className="rounded-xl border border-brand-cyan/25 bg-brand-cyan/5 p-3"
                >
                  <span className="text-xs font-semibold">
                    Kapitel {chapter.index + 1}
                    {chapter.title ? `: ${chapter.title}` : ""} · Kurzfassung
                  </span>
                  <div className="mt-2 rounded-lg border border-white/10 bg-white/5 p-3">
                    <DiffView parts={diffWords(chapter.before, chapter.after)} />
                  </div>
                </div>
              ))}

              {preview.plan.characters.length > 0 ? (
                <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-[11px] text-muted-foreground">
                  Figuren im Manuskript: {preview.plan.characters.join(", ")} — vorhandene werden
                  ergänzt, keine doppelt angelegt.
                </p>
              ) : null}
              {preview.plan.themes.length > 0 ? (
                <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-[11px] text-muted-foreground">
                  Themen: {preview.plan.themes.join(", ")}
                </p>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/10 p-4">
          <span className="text-[11px] text-muted-foreground">
            {isScenes
              ? `${selected.size} von ${preview.entries.length} Kapiteln ausgewählt`
              : mode === "overwrite"
                ? "Vorhandene Angaben werden ersetzt"
                : "Nur leere Felder werden gefüllt"}
          </span>
          <span className="flex items-center gap-2">
            <Button
              variant="outline"
              className="glass rounded-lg border-white/10"
              onClick={onDiscard}
            >
              Verwerfen
            </Button>
            <Button
              className="rounded-lg bg-gradient-to-r from-brand-emerald to-brand-cyan font-semibold text-white disabled:opacity-50"
              disabled={changedCount === 0}
              onClick={() =>
                onApply(mode, isScenes ? [...selected] : [])
              }
            >
              <CheckCheck className="size-3.5" />
              Übernehmen{isScenes ? ` (${selected.size})` : ""}
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}
