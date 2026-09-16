import { useEffect, useMemo, useState } from "react";
import { Check, Link2, Loader2, ShieldCheck, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { ExtractedFact, ExtractedRelation } from "@/data/continuity";
import { FACT_KIND_LABELS, RELATION_COLORS, RELATION_KIND_LABELS, formatIntensity } from "@/data/continuity";

import { Badge } from "./primitives";

/**
 * Review-Dialog für extrahierte Fakten und Beziehungen.
 * Alles ist vorausgewählt und kann einzeln abgewählt werden — nichts wird still übernommen.
 */
export function ContinuityExtractDialog({
  open,
  facts,
  relations,
  running = false,
  progressLabel,
  warnings = [],
  liveCount = 0,
  bookTitle,
  onClose,
  onAccept,
}: {
  open: boolean;
  facts: ExtractedFact[];
  relations: ExtractedRelation[];
  /** Läuft die Ableitung noch? Dann wachsen die Vorschläge live hinein. */
  running?: boolean;
  /** Live-Label der Extraktion (z. B. „Kapitel 3/12 wird gelesen…"). */
  progressLabel?: string | null;
  /** Übersprungene Kapitel (unbrauchbare Modellantwort) — der Rest des Laufs ist erhalten. */
  warnings?: string[];
  /** Roh-Vorschläge, die während des Scans eintrafen (vor Belegprüfung/Entdopplung). */
  liveCount?: number;
  bookTitle: string;
  onClose: () => void;
  onAccept: (facts: ExtractedFact[], relations: ExtractedRelation[]) => void;
}) {
  const [rejectedFacts, setRejectedFacts] = useState<Set<number>>(new Set());
  const [rejectedRelations, setRejectedRelations] = useState<Set<number>>(new Set());

  // Nur beim Öffnen zurücksetzen — sonst würde jeder neu eintreffende Live-Vorschlag
  // die Auswahl des Nutzers verwerfen.
  useEffect(() => {
    if (!open) return;
    setRejectedFacts(new Set());
    setRejectedRelations(new Set());
  }, [open]);

  const selectedFacts = useMemo(
    () => facts.filter((_, index) => !rejectedFacts.has(index)),
    [facts, rejectedFacts],
  );
  const selectedRelations = useMemo(
    () => relations.filter((_, index) => !rejectedRelations.has(index)),
    [relations, rejectedRelations],
  );

  if (!open) return null;

  const toggle = (
    set: Set<number>,
    apply: (next: Set<number>) => void,
    key: number,
  ) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    apply(next);
  };

  const total = facts.length + relations.length;
  const selectedCount = selectedFacts.length + selectedRelations.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-strong float-in flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-emerald to-brand-cyan text-white">
              <Sparkles className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Kontinuität vorschlagen</h2>
              <p className="text-xs text-muted-foreground">
                {facts.length} Fakten · {relations.length} Beziehungen
                {bookTitle ? ` · ${bookTitle}` : ""}
                {running ? " · sammelt…" : ""}
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

        <p className="mt-4 text-xs text-muted-foreground">
          {running
            ? `${progressLabel ?? "Die Vorschläge treffen live ein"} — am Ende wird jeder Beleg gegen den Text geprüft.`
            : "Nur übernehmen, was wirklich im Material steht. Alles ist vorausgewählt — Abwählen, was nicht ins Kanon gehört."}
        </p>

        {/* Warum die Liste nach dem Scan kleiner ist als live: Belegprüfung und Entdopplung. */}
        {!running && liveCount > facts.length + relations.length ? (
          <p className="mt-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-muted-foreground">
            {liveCount} Roh-Vorschläge sind eingetroffen · {facts.length + relations.length} haben die
            Belegprüfung bestanden. Verworfen wurden Vorschläge ohne wörtliches Zitat aus dem Kapitel
            (oder mit Zitat, das dort nicht steht) sowie Wiederholungen.
          </p>
        ) : null}

        {warnings.length > 0 ? (
          <ul className="mt-3 space-y-1 rounded-xl border border-brand-amber/30 bg-brand-amber/10 px-3 py-2 text-[11px] text-brand-amber">
            {warnings.map((warning, index) => (
              <li key={index}>• {warning}</li>
            ))}
          </ul>
        ) : null}

        <div className="mt-3 flex-1 space-y-4 overflow-y-auto pr-1">
          {facts.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Fakten
              </p>
              {facts.map((fact, index) => {
                const isSelected = !rejectedFacts.has(index);
                return (
                  <button
                    key={`${fact.entityName}-${index}`}
                    type="button"
                    onClick={() => toggle(rejectedFacts, setRejectedFacts, index)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-all duration-200",
                      isSelected
                        ? "border-brand-emerald/40 bg-brand-emerald/10"
                        : "border-white/10 bg-white/5 opacity-60 hover:opacity-90",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                        isSelected
                          ? "border-transparent bg-gradient-to-br from-brand-emerald to-brand-cyan text-white"
                          : "border-white/20 text-transparent",
                      )}
                    >
                      <Check className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-sm font-semibold tracking-tight">
                          <ShieldCheck className="size-3.5 text-muted-foreground" />
                          {fact.entityName}
                        </span>
                        <Badge tone={fact.entityType === "world" ? "cyan" : "violet"}>
                          {FACT_KIND_LABELS[fact.kind]}
                        </Badge>
                        {fact.hard ? <Badge tone="amber">harte Regel</Badge> : null}
                        {fact.establishedIn ? (
                          <span className="text-[11px] text-muted-foreground">
                            {fact.establishedIn}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        {fact.statement}
                      </span>
                      {fact.quote ? (
                        /* Der Beleg aus dem Kapiteltext — nachprüfbar, deshalb zeigen wir ihn. */
                        <span className="mt-1.5 block border-l-2 border-brand-emerald/40 pl-2 text-[11px] italic leading-relaxed text-foreground/70">
                          „{fact.quote}"
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {relations.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Beziehungen
              </p>
              {relations.map((relation, index) => {
                const isSelected = !rejectedRelations.has(index);
                return (
                  <button
                    key={`${relation.fromName}-${relation.toName}-${index}`}
                    type="button"
                    onClick={() => toggle(rejectedRelations, setRejectedRelations, index)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-all duration-200",
                      isSelected
                        ? "border-brand-cyan/40 bg-brand-cyan/10"
                        : "border-white/10 bg-white/5 opacity-60 hover:opacity-90",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                        isSelected
                          ? "border-transparent bg-gradient-to-br from-brand-cyan to-brand-indigo text-white"
                          : "border-white/20 text-transparent",
                      )}
                    >
                      <Check className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold tracking-tight">
                          <Link2 className="size-3.5 text-muted-foreground" />
                          {relation.fromName} → {relation.toName}
                        </span>
                        <span
                          className="size-2.5 rounded-full"
                          style={{ background: RELATION_COLORS[relation.kind] }}
                        />
                        <span className="text-xs text-muted-foreground">
                          {RELATION_KIND_LABELS[relation.kind]} (
                          {formatIntensity(relation.intensity)})
                        </span>
                        {relation.secret ? <Badge tone="amber">geheim</Badge> : null}
                      </span>
                      {relation.note ? (
                        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                          {relation.note}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {total === 0 ? (
            <p className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-muted-foreground">
              {running ? (
                <>
                  <Loader2 className="size-4 animate-spin text-brand-cyan" />
                  Sammelt Vorschläge…
                </>
              ) : (
                "Keine neuen Vorschläge — alles bereits erfasst."
              )}
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-5">
          <span className="text-xs text-muted-foreground">
            {selectedCount} von {total} ausgewählt
          </span>
          <div className="flex gap-3">
            <Button
              variant="ghost"
              className="rounded-xl text-muted-foreground hover:text-foreground"
              onClick={onClose}
            >
              Abbrechen
            </Button>
            <Button
              onClick={() => onAccept(selectedFacts, selectedRelations)}
              disabled={selectedCount === 0 || running}
              className="rounded-xl bg-gradient-to-r from-brand-emerald to-brand-cyan px-5 font-semibold text-white disabled:opacity-50"
            >
              {selectedCount} übernehmen
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}



