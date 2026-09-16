import { useEffect } from "react";
import { CheckCheck, GitMerge, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Ein Dubletten-Paar: was bleibt, was verschwindet — und was daran hängt. */
export interface CharacterDuplicateEntry {
  keptName: string;
  removedName: string;
  /** Fakten und Beziehungen, die an der entfernten Figur hängen. */
  facts: number;
  relations: number;
  /** Davon gibt es bei der behaltenen Figur schon (unscharf verglichen) — wird zusammengefasst. */
  duplicateFacts: number;
  duplicateRelations: number;
}

/**
 * Vorschau vor dem Aufräumen von Figuren-Dubletten.
 *
 * Vorher wurde nur gezählt und gewarnt, dass Fakten und Beziehungen **mitgelöscht** werden. Hier
 * ist sichtbar, was zusammenfällt und was dabei tatsächlich verloren ginge — die Entscheidung
 * (zusammenführen oder nur entfernen) fällt danach, nicht davor.
 */
export function CharacterDuplicatesDialog({
  open,
  entries,
  onMerge,
  onDeleteOnly,
  onClose,
}: {
  open: boolean;
  entries: CharacterDuplicateEntry[];
  onMerge: () => void;
  onDeleteOnly: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const totalFacts = entries.reduce((sum, entry) => sum + entry.facts, 0);
  const totalRelations = entries.reduce((sum, entry) => sum + entry.relations, 0);
  const rescuedFacts = entries.reduce((sum, entry) => sum + (entry.facts - entry.duplicateFacts), 0);
  const rescuedRelations = entries.reduce(
    (sum, entry) => sum + (entry.relations - entry.duplicateRelations),
    0,
  );

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="glass-strong float-in flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-brand-amber/10 p-2 text-brand-amber">
              <GitMerge className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Figuren-Dubletten aufräumen</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {entries.length === 1
                  ? "1 Paar erkannt — Anreden und Ränge werden beim Vergleich ignoriert."
                  : `${entries.length} Paare erkannt — Anreden und Ränge werden beim Vergleich ignoriert.`}
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

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-5">
          {entries.map((entry, index) => {
            const cleanFacts = entry.facts - entry.duplicateFacts;
            const cleanRelations = entry.relations - entry.duplicateRelations;
            return (
              <div
                key={`${entry.keptName}-${entry.removedName}-${index}`}
                className="rounded-xl border border-white/10 bg-white/5 p-3"
              >
                <p className="text-xs font-semibold">
                  <span className="text-brand-rose">{entry.removedName}</span>
                  <span className="mx-2 text-muted-foreground">→</span>
                  <span className="text-brand-emerald">{entry.keptName}</span>
                </p>
                <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                    {entry.facts} {entry.facts === 1 ? "Fakt" : "Fakten"}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                    {entry.relations} {entry.relations === 1 ? "Beziehung" : "Beziehungen"}
                  </span>
                  {entry.duplicateFacts + entry.duplicateRelations > 0 ? (
                    <span className="text-muted-foreground">
                      {entry.duplicateFacts + entry.duplicateRelations} davon gibt es bei „
                      {entry.keptName}" schon — wird zusammengefasst
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Beim Zusammenführen wandern {cleanFacts}{" "}
                  {cleanFacts === 1 ? "Fakt" : "Fakten"} und {cleanRelations}{" "}
                  {cleanRelations === 1 ? "Beziehung" : "Beziehungen"} auf „{entry.keptName}".
                </p>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 p-4">
          <span className="text-[11px] text-muted-foreground">
            Zusammenführen rettet {rescuedFacts} {rescuedFacts === 1 ? "Fakt" : "Fakten"} und{" "}
            {rescuedRelations} {rescuedRelations === 1 ? "Beziehung" : "Beziehungen"}
            {totalFacts + totalRelations > 0 ? " vor dem Löschen" : ""}
          </span>
          <span className="flex items-center gap-2">
            <Button
              variant="outline"
              className="glass rounded-lg border-white/10"
              onClick={onClose}
            >
              Abbrechen
            </Button>
            <Button
              variant="outline"
              className="glass rounded-lg border-white/10 text-brand-rose hover:text-brand-rose"
              onClick={onDeleteOnly}
              title="Entfernt die Dubletten wie bisher — Fakten und Beziehungen der entfernten Figuren gehen verloren."
            >
              <Trash2 className="size-3.5" />
              Nur entfernen
            </Button>
            <Button
              className="rounded-lg bg-gradient-to-r from-brand-emerald to-brand-cyan font-semibold text-white"
              onClick={onMerge}
            >
              <CheckCheck className="size-3.5" />
              Zusammenführen ({entries.length})
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}
