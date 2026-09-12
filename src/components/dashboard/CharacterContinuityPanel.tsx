import { useState } from "react";
import type { ReactNode } from "react";
import { Link2, Plus, ShieldCheck, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type { CanonFact, CharacterRelation, FactKind, RelationArcPoint, RelationKind } from "@/data/continuity";
import {
  FACT_KINDS,
  FACT_KIND_LABELS,
  RELATION_COLORS,
  RELATION_KINDS,
  RELATION_KIND_LABELS,
  arcDelta,
  emptyFact,
  formatIntensity,
  hasArc,
  newRelationId,
  sortArc,
} from "@/data/continuity";
import type { Character } from "@/data/characters";
import { sparklinePath, sparklineZeroY } from "@/lib/graph";

function PanelShell({
  icon,
  title,
  hint,
  children,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <span className="flex size-5 items-center justify-center rounded-md bg-white/5 text-muted-foreground">
            {icon}
          </span>
          {title}
        </span>
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      </div>
      {children}
    </section>
  );
}

/** Fakten zu genau dieser Figur — Änderungen wirken sofort (kein Speichern nötig). */
export function FactsPanel({
  character,
  facts,
  onChange,
}: {
  character: Character;
  facts: CanonFact[];
  onChange: (facts: CanonFact[]) => void;
}) {
  const [statement, setStatement] = useState("");
  const [kind, setKind] = useState<FactKind>("attribute");
  const [source, setSource] = useState("");

  const mine = facts.filter((fact) => fact.entityId === character.id);

  const add = () => {
    const text = statement.trim();
    if (!text) return;
    onChange([
      ...facts,
      {
        ...emptyFact(character.id, "character", kind),
        statement: text,
        establishedIn: source.trim() || undefined,
      },
    ]);
    setStatement("");
    setSource("");
  };

  const update = (id: string, patch: Partial<CanonFact>) =>
    onChange(facts.map((fact) => (fact.id === id ? { ...fact, ...patch } : fact)));

  const remove = (id: string) => onChange(facts.filter((fact) => fact.id !== id));

  return (
    <PanelShell
      icon={<ShieldCheck className="size-3.5" />}
      title={`Fakten (${mine.length})`}
      hint="sofort gespeichert"
    >
      {mine.length === 0 ? (
        <p className="mb-2 text-[11px] text-muted-foreground">
          Noch keine Fakten — z. B. Alter, Verlust, Fähigkeit oder Besitz.
        </p>
      ) : (
        <div className="mb-2 space-y-1.5">
          {mine.map((fact) => (
            <div
              key={fact.id}
              className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-2"
            >
              <Select
                value={fact.kind}
                onValueChange={(value) => update(fact.id, { kind: value as FactKind })}
              >
                <SelectTrigger size="sm" className="h-8 w-32 shrink-0 border-white/10 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="glass-strong border-white/10">
                  {FACT_KINDS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {FACT_KIND_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="min-w-0 flex-1 space-y-1">
                <Input
                  value={fact.statement}
                  onChange={(event) => update(fact.id, { statement: event.target.value })}
                  className="glass h-8 rounded-lg border-white/10 text-xs"
                />
                <Input
                  value={fact.establishedIn ?? ""}
                  onChange={(event) =>
                    update(fact.id, { establishedIn: event.target.value || undefined })
                  }
                  placeholder="Quelle (z. B. Kapitel 3)"
                  className="glass h-7 rounded-lg border-white/10 text-[11px]"
                />
              </div>

              <button
                type="button"
                onClick={() => remove(fact.id)}
                className="mt-1 shrink-0 rounded-lg border border-white/10 p-1.5 text-muted-foreground transition-colors hover:text-brand-rose"
                title="Fakt löschen"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={kind} onValueChange={(value) => setKind(value as FactKind)}>
          <SelectTrigger size="sm" className="h-9 w-32 border-white/10 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="glass-strong border-white/10">
            {FACT_KINDS.map((item) => (
              <SelectItem key={item} value={item}>
                {FACT_KIND_LABELS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") add();
          }}
          placeholder="Kurze, prüfbare Aussage …"
          className="glass h-9 min-w-[200px] flex-1 rounded-lg border-white/10 text-xs"
        />
        <Input
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="Kapitel"
          className="glass h-9 w-28 rounded-lg border-white/10 text-xs"
        />
        <Button
          size="sm"
          variant="outline"
          className="glass h-9 rounded-lg border-white/10"
          onClick={add}
          disabled={statement.trim().length === 0}
        >
          <Plus className="size-3.5" />
          Fakt
        </Button>
      </div>
    </PanelShell>
  );
}

/** Kleine Verlaufs-Sparkline (−1 … 1) für die Beziehungsliste. */
export function RelationSparkline({ arc, color }: { arc: RelationArcPoint[]; color: string }) {
  const values = sortArc(arc).map((point) => point.intensity);
  if (values.length < 2) return null;
  return (
    <svg width={72} height={18} viewBox="0 0 72 18" className="shrink-0" aria-hidden>
      <line
        x1={1}
        y1={sparklineZeroY()}
        x2={71}
        y2={sparklineZeroY()}
        stroke="currentColor"
        strokeOpacity={0.2}
        strokeDasharray="2 2"
      />
      <path d={sparklinePath(values)} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

/** Verlaufs-Editor: Intensität je Kapitel (Figuren-Entwicklung über die Zeit). */
function ArcEditor({
  relation,
  onChange,
}: {
  relation: CharacterRelation;
  onChange: (patch: Partial<CharacterRelation>) => void;
}) {
  const points = sortArc(relation.arc ?? []);

  const update = (index: number, patch: Partial<RelationArcPoint>) =>
    onChange({ arc: points.map((point, i) => (i === index ? { ...point, ...patch } : point)) });

  const add = () => {
    const last = points[points.length - 1];
    onChange({
      arc: [
        ...points,
        { chapter: (last?.chapter ?? 0) + 1, intensity: last?.intensity ?? relation.intensity },
      ],
    });
  };

  const remove = (index: number) => onChange({ arc: points.filter((_, i) => i !== index) });

  return (
    <div className="mt-2 rounded-lg border border-white/10 bg-white/5 p-2">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Verlauf (Kapitel → Intensität)
        </span>
        <span className="text-[10px] text-muted-foreground">
          {hasArc(relation)
            ? `Arc hat Vorrang · Δ ${formatIntensity(arcDelta(points))}`
            : "ab 2 Punkten gilt der Verlauf statt des Einzelwerts"}
        </span>
      </div>

      {points.length === 0 ? (
        <p className="mb-2 text-[11px] text-muted-foreground">
          Noch keine Punkte — z. B. Kap. 1 Misstrauen, Kap. 12 Vertrauen.
        </p>
      ) : (
        <div className="mb-2 space-y-1">
          {points.map((point, index) => (
            <div key={`${point.chapter}-${index}`} className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                value={point.chapter}
                onChange={(event) =>
                  update(index, { chapter: Math.max(1, Number(event.target.value) || 1) })
                }
                className="glass h-7 w-16 rounded-lg border-white/10 text-[11px]"
              />
              <input
                type="range"
                min={-1}
                max={1}
                step={0.1}
                value={point.intensity}
                onChange={(event) => update(index, { intensity: Number(event.target.value) })}
                className="h-1 flex-1 cursor-pointer accent-brand-violet"
              />
              <span className="w-8 text-right text-[11px] font-semibold">
                {formatIntensity(point.intensity)}
              </span>
              <button
                type="button"
                onClick={() => remove(index)}
                className="shrink-0 rounded-md border border-white/10 p-1 text-muted-foreground transition-colors hover:text-brand-rose"
                title="Punkt löschen"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="glass h-7 rounded-lg border-white/10 text-[11px]" onClick={add}>
          <Plus className="size-3" />
          Punkt
        </Button>
        <RelationSparkline arc={points} color={RELATION_COLORS[relation.kind]} />
      </div>
    </div>
  );
}

/** Beziehungen dieser Figur zu anderen Figuren (gerichtet, mit Intensität). */
export function RelationsPanel({
  character,
  characters,
  relations,
  onChange,
}: {
  character: Character;
  characters: Character[];
  relations: CharacterRelation[];
  onChange: (relations: CharacterRelation[]) => void;
}) {
  const [toId, setToId] = useState("");
  const [kind, setKind] = useState<RelationKind>("loyalty");
  const [intensity, setIntensity] = useState(0.7);
  const [note, setNote] = useState("");
  const [secret, setSecret] = useState(false);
  const [arcOpenId, setArcOpenId] = useState<string | null>(null);

  const nameOf = (id: string) => characters.find((entry) => entry.id === id)?.name ?? "?";

  // Richtungen dieser Figur (ausgehend und eingehend).
  const mine = relations.filter(
    (relation) => relation.fromId === character.id || relation.toId === character.id,
  );
  const targets = characters.filter((entry) => entry.id !== character.id);

  const add = () => {
    if (!toId) return;
    onChange([
      ...relations,
      {
        id: newRelationId(),
        fromId: character.id,
        toId,
        kind,
        intensity,
        note: note.trim() || undefined,
        secret: secret || undefined,
      },
    ]);
    setToId("");
    setNote("");
    setSecret(false);
    setIntensity(0.7);
  };

  const update = (id: string, patch: Partial<CharacterRelation>) =>
    onChange(relations.map((relation) => (relation.id === id ? { ...relation, ...patch } : relation)));

  const remove = (id: string) => onChange(relations.filter((relation) => relation.id !== id));

  return (
    <PanelShell
      icon={<Link2 className="size-3.5" />}
      title={`Beziehungen (${mine.length})`}
      hint="sofort gespeichert"
    >
      {mine.length === 0 ? (
        <p className="mb-2 text-[11px] text-muted-foreground">
          Noch keine Beziehungen — z. B. Loyalität, Schuld oder Misstrauen.
        </p>
      ) : (
        <div className="mb-2 space-y-1.5">
          {mine.map((relation) => {
            const outgoing = relation.fromId === character.id;
            const otherId = outgoing ? relation.toId : relation.fromId;
            const arcIsOpen = arcOpenId === relation.id;
            return (
              <div
                key={relation.id}
                className="rounded-lg border border-white/10 bg-white/5 p-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: RELATION_COLORS[relation.kind] }}
                  />
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {outgoing ? "→" : "←"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs">
                    <span className="font-semibold">{nameOf(otherId)}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {RELATION_KIND_LABELS[relation.kind]} (
                      {hasArc(relation)
                        ? `Verlauf ${formatIntensity(arcDelta(relation.arc ?? []))}`
                        : formatIntensity(relation.intensity)}
                      ){relation.secret ? " · geheim" : ""}
                      {relation.note ? ` — ${relation.note}` : ""}
                    </span>
                  </span>

                  {hasArc(relation) ? (
                    <RelationSparkline arc={relation.arc ?? []} color={RELATION_COLORS[relation.kind]} />
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setArcOpenId(arcIsOpen ? null : relation.id)}
                    className={cn(
                      "shrink-0 rounded-lg border px-2 py-1 text-[10px] font-semibold transition-colors",
                      arcIsOpen
                        ? "border-brand-violet/40 bg-brand-violet/10 text-brand-violet"
                        : "border-white/10 text-muted-foreground hover:text-foreground",
                    )}
                    title="Verlauf über die Kapitel pflegen"
                  >
                    Verlauf
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(relation.id)}
                    className="shrink-0 rounded-lg border border-white/10 p-1.5 text-muted-foreground transition-colors hover:text-brand-rose"
                    title="Beziehung löschen"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>

                {arcIsOpen ? (
                  <ArcEditor
                    relation={relation}
                    onChange={(patch) => update(relation.id, patch)}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={toId} onValueChange={setToId}>
          <SelectTrigger size="sm" className="h-9 w-40 border-white/10 text-xs">
            <SelectValue placeholder="Ziel-Figur" />
          </SelectTrigger>
          <SelectContent className="glass-strong border-white/10">
            {targets.length === 0 ? (
              <SelectItem value="__none" disabled>
                Keine weitere Figur
              </SelectItem>
            ) : (
              targets.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        <Select value={kind} onValueChange={(value) => setKind(value as RelationKind)}>
          <SelectTrigger size="sm" className="h-9 w-36 border-white/10 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="glass-strong border-white/10">
            {RELATION_KINDS.map((item) => (
              <SelectItem key={item} value={item}>
                {RELATION_KIND_LABELS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          Intensität
          <input
            type="range"
            min={-1}
            max={1}
            step={0.1}
            value={intensity}
            onChange={(event) => setIntensity(Number(event.target.value))}
            className="h-1 w-28 cursor-pointer accent-brand-violet"
          />
          <span className="w-8 font-semibold text-foreground/80">
            {formatIntensity(intensity)}
          </span>
        </label>

        <button
          type="button"
          onClick={() => setSecret((prev) => !prev)}
          className={cn(
            "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
            secret
              ? "border-brand-amber/40 bg-brand-amber/10 text-brand-amber"
              : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground",
          )}
        >
          geheim
        </button>

        <Input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Notiz (optional)"
          className="glass h-9 min-w-[160px] flex-1 rounded-lg border-white/10 text-xs"
        />

        <Button
          size="sm"
          variant="outline"
          className="glass h-9 rounded-lg border-white/10"
          onClick={add}
          disabled={!toId}
        >
          <Plus className="size-3.5" />
          Beziehung
        </Button>
      </div>
    </PanelShell>
  );
}
