import { useMemo, useState } from "react";
import { Loader2, Search, ShieldCheck, Sparkles, Trash2, Users, Wand2 } from "lucide-react";

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

import type { Book } from "@/data/author";
import type { Character } from "@/data/characters";
import type {
  CanonFact,
  CharacterRelation,
  ExtractedFact,
  ExtractedRelation,
  FactEntityType,
  FactKind,
  RelationKind,
} from "@/data/continuity";
import {
  FACT_KINDS,
  FACT_KIND_LABELS,
  RELATION_COLORS,
  RELATION_KINDS,
  RELATION_KIND_LABELS,
  arcDelta,
  formatIntensity,
  hasArc,
  newFactId,
  newRelationId,
  sortFacts,
} from "@/data/continuity";
import type { WorldEntry } from "@/data/world";
import type { Series } from "@/data/series";
import { canonVolumeIds } from "@/data/series";
import { readLanguage, readStageModel } from "@/lib/generationSettings";
import { edgeOpacity, edgePath, edgeWidth, layoutCircle, sortByDegree } from "@/lib/graph";
import type { GraphNode } from "@/lib/graph";
import { dedupeFacts, dedupeRelations } from "@/lib/factMatch";
import { showToast } from "@/lib/toast";
import { streamContinuityExtract } from "@/services/continuity";

import { Badge, EmptyState, ViewHeader } from "./primitives";
import type { Tone } from "./primitives";
import { RelationSparkline } from "./CharacterContinuityPanel";
import { ContinuityExtractDialog } from "./ContinuityExtractDialog";

const FACT_KIND_TONE: Record<FactKind, Tone> = {
  attribute: "violet",
  history: "amber",
  skill: "cyan",
  possession: "rose",
  world: "indigo",
  rule: "emerald",
};

const GRAPH_WIDTH = 760;
const GRAPH_HEIGHT = 440;

function nameKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function truncate(value: string, max = 16): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function ContinuityView({
  books,
  characters,
  worlds,
  facts,
  relations,
  series = [],
  onFactsChange,
  onRelationsChange,
  onClearAll,
}: {
  books: Book[];
  characters: Character[];
  worlds: WorldEntry[];
  facts: CanonFact[];
  relations: CharacterRelation[];
  series?: Series[];
  onFactsChange: (facts: CanonFact[]) => void;
  onRelationsChange: (relations: CharacterRelation[]) => void;
  /** Leert den gesamten Kanon (Fakten und Beziehungen). */
  onClearAll: () => void;
}) {
  const [tab, setTab] = useState<"facts" | "relations">("facts");
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<FactKind | "all">("all");
  const [scopeFilter, setScopeFilter] = useState<FactEntityType | "all">("all");
  /** "all" · "b:<bookId>" (Projekt) · "s:<seriesId>" (Reihe = alle Bände). */
  const [scope, setScope] = useState<string>("all");
  const [extractBookId, setExtractBookId] = useState<string>(
    () => books.find((book) => book.storyboard)?.id ?? books[0]?.id ?? "",
  );
  const [extractBusy, setExtractBusy] = useState(false);
  /** Läuft die gestreamte Ableitung gerade? (Dialog ist dann bereits offen.) */
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<{
    facts: ExtractedFact[];
    relations: ExtractedRelation[];
  } | null>(null);

  /** Projekte des aktuellen Scopes (null = alle). */
  const scopedBookIds = useMemo<Set<string> | null>(() => {
    if (scope === "all") return null;
    if (scope.startsWith("s:")) {
      const entry = series.find((item) => item.id === scope.slice(2));
      return new Set(entry?.volumeIds ?? []);
    }
    return new Set([scope.slice(2)]);
  }, [scope, series]);

  const scopedCharacters = useMemo(
    () =>
      scopedBookIds
        ? characters.filter((character) => scopedBookIds.has(character.bookId ?? ""))
        : characters,
    [characters, scopedBookIds],
  );
  const scopedWorlds = useMemo(
    () => (scopedBookIds ? worlds.filter((entry) => scopedBookIds.has(entry.bookId ?? "")) : worlds),
    [worlds, scopedBookIds],
  );
  const characterIds = useMemo(
    () => new Set(scopedCharacters.map((character) => character.id)),
    [scopedCharacters],
  );
  const worldIds = useMemo(() => new Set(scopedWorlds.map((entry) => entry.id)), [scopedWorlds]);

  /** Figuren eines Projekts (Register + Figuren aus dessen Storyboard-Namen). */
  const bookCharacters = (bookId: string): Character[] => {
    const book = books.find((item) => item.id === bookId);
    const storyboardNames = new Set(
      (book?.storyboard?.characters ?? []).map((entry) => nameKey(entry.name)),
    );
    return characters.filter(
      (character) => character.bookId === bookId || storyboardNames.has(nameKey(character.name)),
    );
  };

  const nameOf = (entityId: string): string =>
    characters.find((character) => character.id === entityId)?.name ??
    worlds.find((entry) => entry.id === entityId)?.title ??
    "(unbekannt)";

  const visibleFacts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sortFacts(facts).filter((fact) => {
      if (kindFilter !== "all" && fact.kind !== kindFilter) return false;
      if (scopeFilter !== "all" && fact.entityType !== scopeFilter) return false;
      if (scopedBookIds) {
        const inScope =
          fact.entityType === "character"
            ? characterIds.has(fact.entityId)
            : worldIds.has(fact.entityId);
        if (!inScope) return false;
      }
      if (normalized.length === 0) return true;
      return (
        fact.statement.toLowerCase().includes(normalized) ||
        nameOf(fact.entityId).toLowerCase().includes(normalized)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facts, query, kindFilter, scopeFilter, scopedBookIds, characterIds, worldIds, characters, worlds]);

  /** Graph: Figuren des gewählten Scopes und die Beziehungen zwischen ihnen. */
  const graph = useMemo(() => {
    const edges = relations.filter(
      (relation) =>
        characterIds.has(relation.fromId) &&
        characterIds.has(relation.toId) &&
        relation.fromId !== relation.toId,
    );
    const ordered = sortByDegree(
      scopedCharacters.map((character) => ({ id: character.id, name: character.name })),
      edges.map((relation) => ({ fromId: relation.fromId, toId: relation.toId })),
    );
    const nodes = layoutCircle(ordered, GRAPH_WIDTH, GRAPH_HEIGHT);
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const drawn: { relation: CharacterRelation; from: GraphNode; to: GraphNode }[] = [];
    for (const relation of edges) {
      const from = byId.get(relation.fromId);
      const to = byId.get(relation.toId);
      if (from && to) drawn.push({ relation, from, to });
    }
    return { nodes, drawn };
  }, [scopedCharacters, relations, characterIds]);

  const visibleRelations = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return relations.filter((relation) => {
      if (!characterIds.has(relation.fromId) || !characterIds.has(relation.toId)) return false;
      if (normalized.length === 0) return true;
      return (
        nameOf(relation.fromId).toLowerCase().includes(normalized) ||
        nameOf(relation.toId).toLowerCase().includes(normalized) ||
        RELATION_KIND_LABELS[relation.kind].toLowerCase().includes(normalized)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relations, query, characterIds, characters, worlds]);

  const runExtract = async () => {
    const book = books.find((item) => item.id === extractBookId);
    if (!book?.storyboard) {
      setExtractError("Dieses Projekt hat kein Storyboard — bitte zuerst eines erstellen.");
      return;
    }
    const model = readStageModel("consistency");
    if (!model.trim()) {
      setExtractError("Bitte eine Model-ID für „Kohärenz“ in den Einstellungen eintragen.");
      return;
    }
    setExtractError(null);
    setExtractBusy(true);
    setExtracting(true);
    // Dialog sofort öffnen — die Vorschläge wachsen dann live hinein.
    setCandidates({ facts: [], relations: [] });

    try {
      const scoped = bookCharacters(book.id);
      const bookWorlds = worlds.filter((entry) => entry.bookId === book.id);

      // Bekanntes gilt **reihenweit**: was in einem anderen Band schon steht, wird nicht
      // erneut vorgeschlagen.
      const canonBooks = new Set(canonVolumeIds(series, book.id));
      const knownCharacterIds = new Set(
        characters
          .filter((character) => canonBooks.has(character.bookId ?? ""))
          .map((character) => character.id),
      );
      const knownWorldIds = new Set(
        worlds.filter((entry) => canonBooks.has(entry.bookId ?? "")).map((entry) => entry.id),
      );

      const result = await streamContinuityExtract(
        {
          storyboard: book.storyboard,
          characters: scoped.map((character) => ({ name: character.name, role: character.role })),
          worldNames: bookWorlds.map((entry) => entry.title),
          knownStatements: facts
            .filter((fact) =>
              fact.entityType === "character"
                ? knownCharacterIds.has(fact.entityId)
                : knownWorldIds.has(fact.entityId),
            )
            .map((fact) => fact.statement),
          knownRelations: relations
            .filter(
              (relation) =>
                knownCharacterIds.has(relation.fromId) && knownCharacterIds.has(relation.toId),
            )
            .map((relation) => `${nameOf(relation.fromId)}→${nameOf(relation.toId)}:${relation.kind}`),
          model,
          language: readLanguage() ?? "German",
        },
        {
          onItem: (type, item) =>
            setCandidates((prev) => {
              const base = prev ?? { facts: [], relations: [] };
              return type === "fact"
                ? { ...base, facts: [...base.facts, item as ExtractedFact] }
                : { ...base, relations: [...base.relations, item as ExtractedRelation] };
            }),
        },
      );

      // Endfassung ist validiert und dedupliziert — sie ersetzt die Live-Liste.
      if (result.facts.length === 0 && result.relations.length === 0) {
        setCandidates(null);
        setExtractError("Keine neuen Vorschläge gefunden (alles bereits erfasst).");
        return;
      }
      setCandidates(result);
    } catch (err) {
      setCandidates(null);
      setExtractError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setExtracting(false);
      setExtractBusy(false);
    }
  };

  /** Bestehende Dubletten in Fakten und Beziehungen aufräumen. */
  const removeDuplicateCanon = () => {
    const factResult = dedupeFacts(facts);
    const relationResult = dedupeRelations(relations);
    const total = factResult.removed.length + relationResult.removed.length;
    if (total === 0) {
      showToast("Keine Dubletten gefunden", "info");
      return;
    }
    const confirmed = window.confirm(
      `${total} Dublette${total === 1 ? "" : "n"} entfernen?` +
        `\n\n${factResult.removed.length} Fakten · ${relationResult.removed.length} Beziehungen.` +
        `\nBehalten wird jeweils der erste Eintrag.`,
    );
    if (!confirmed) return;
    if (factResult.removed.length > 0) onFactsChange(factResult.kept);
    if (relationResult.removed.length > 0) onRelationsChange(relationResult.kept);
    showToast(total === 1 ? "1 Dublette entfernt" : `${total} Dubletten entfernt`);
  };

  const duplicateCanonCount = useMemo(
    () => dedupeFacts(facts).removed.length + dedupeRelations(relations).removed.length,
    [facts, relations],
  );

  const acceptExtraction = (acceptedFacts: ExtractedFact[], acceptedRelations: ExtractedRelation[]) => {
    const book = books.find((item) => item.id === extractBookId);
    if (!book) return;

    const scoped = bookCharacters(book.id);
    const bookWorlds = worlds.filter((entry) => entry.bookId === book.id);
    const characterByName = new Map(scoped.map((character) => [nameKey(character.name), character]));
    const worldByName = new Map(bookWorlds.map((entry) => [nameKey(entry.title), entry]));

    const newFacts: CanonFact[] = [];
    let skippedFacts = 0;
    for (const fact of acceptedFacts) {
      if (fact.entityType === "character") {
        const character = characterByName.get(nameKey(fact.entityName));
        if (!character) {
          skippedFacts += 1;
          continue;
        }
        newFacts.push({
          id: newFactId(),
          kind: fact.kind,
          entityId: character.id,
          entityType: "character",
          statement: fact.statement,
          establishedIn: fact.establishedIn,
        });
        continue;
      }
      const entry = worldByName.get(nameKey(fact.entityName));
      if (!entry) {
        skippedFacts += 1;
        continue;
      }
      newFacts.push({
        id: newFactId(),
        kind: fact.kind,
        entityId: entry.id,
        entityType: "world",
        statement: fact.statement,
        establishedIn: fact.establishedIn,
        hard: fact.hard,
      });
    }

    const newRelations: CharacterRelation[] = [];
    let skippedRelations = 0;
    for (const relation of acceptedRelations) {
      const from = characterByName.get(nameKey(relation.fromName));
      const to = characterByName.get(nameKey(relation.toName));
      if (!from || !to || from.id === to.id) {
        skippedRelations += 1;
        continue;
      }
      newRelations.push({
        id: newRelationId(),
        fromId: from.id,
        toId: to.id,
        kind: relation.kind,
        intensity: relation.intensity,
        note: relation.note,
        secret: relation.secret,
        establishedIn: relation.establishedIn,
      });
    }

    if (newFacts.length > 0) onFactsChange([...facts, ...newFacts]);
    if (newRelations.length > 0) onRelationsChange([...relations, ...newRelations]);

    const parts = [
      newFacts.length > 0 ? `${newFacts.length} Fakten` : "",
      newRelations.length > 0 ? `${newRelations.length} Beziehungen` : "",
    ].filter(Boolean);
    const skipped = skippedFacts + skippedRelations;
    showToast(
      parts.length > 0
        ? `${parts.join(" · ")} übernommen${skipped > 0 ? ` (${skipped} ohne Zuordnung übersprungen)` : ""}`
        : "Nichts übernommen — keine Figur zuordenbar",
      parts.length > 0 ? "ok" : "error",
    );
    setCandidates(null);
  };

  const unknownEntities = facts.filter((fact) => nameOf(fact.entityId) === "(unbekannt)").length;

  return (
    <div>
      <ViewHeader
        eyebrow="Kanon"
        title="Kontinuität"
        subtitle={`${facts.length} Fakten · ${relations.length} Beziehungen — verbindlich für alle Prüf-Pässe.`}
        actions={
          <>
            <Select value={extractBookId} onValueChange={setExtractBookId}>
              <SelectTrigger size="sm" className="glass w-48 border-white/10">
                <SelectValue placeholder="Projekt wählen" />
              </SelectTrigger>
              <SelectContent className="glass-strong border-white/10">
                {books.map((book) => (
                  <SelectItem key={book.id} value={book.id}>
                    {book.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="glass rounded-lg border-white/10"
              onClick={() => void runExtract()}
              disabled={extractBusy || books.length === 0}
              title="Fakten und Beziehungen aus Storyboard und Register ableiten — Vorschläge erscheinen live"
            >
              {extractBusy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              Vorschläge ableiten
            </Button>
            <Button
              size="sm"
              variant={duplicateCanonCount > 0 ? "default" : "outline"}
              className={cn(
                "rounded-lg",
                duplicateCanonCount > 0
                  ? "bg-gradient-to-r from-brand-amber to-brand-rose font-semibold text-white"
                  : "glass border-white/10",
              )}
              onClick={removeDuplicateCanon}
              disabled={facts.length + relations.length < 2}
              title="Fakten und Beziehungen mit gleicher Aussage zusammenfassen"
            >
              <Wand2 className="size-3.5" />
              {duplicateCanonCount > 0 ? `Dubletten entfernen (${duplicateCanonCount})` : "Dubletten entfernen"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="glass rounded-lg border-white/10 text-muted-foreground hover:border-brand-rose/40 hover:text-brand-rose"
              onClick={() => {
                const total = facts.length + relations.length;
                const confirmed = window.confirm(
                  `Gesamten Kanon löschen (${facts.length} Fakten · ${relations.length} Beziehungen)?\n\n` +
                    "Der Kanon ist die verbindliche Grundlage aller Prüf-Pässe — Figuren und Weltenbau bleiben erhalten, " +
                    "nur Fakten und Beziehungen verschwinden. Er lässt sich jederzeit neu ableiten.",
                );
                if (!confirmed) return;
                onClearAll();
                showToast(total === 1 ? "1 Kanon-Eintrag gelöscht" : `${total} Kanon-Einträge gelöscht`, "ok");
              }}
              disabled={facts.length + relations.length === 0}
              title="Alle Fakten und Beziehungen dieses Profils löschen"
            >
              <Trash2 className="size-3.5" />
              Alle löschen
            </Button>
          </>
        }
      />

      {extractError ? (
        <div className="mb-4 rounded-xl border border-brand-rose/30 bg-brand-rose/10 px-3 py-2 text-sm text-brand-rose">
          {extractError}
        </div>
      ) : null}

      {unknownEntities > 0 ? (
        <div className="mb-4 rounded-xl border border-brand-amber/30 bg-brand-amber/10 px-3 py-2 text-sm text-brand-amber">
          {unknownEntities} Fakt(en) verweisen auf gelöschte Entitäten — bitte entfernen.
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-white/10 bg-white/5 p-1">
          {(
            [
              { id: "facts", label: `Fakten (${facts.length})` },
              { id: "relations", label: `Beziehungen (${relations.length})` },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200",
                tab === item.id
                  ? "bg-gradient-to-r from-brand-violet to-brand-indigo text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === "facts" ? "Fakten durchsuchen…" : "Beziehungen durchsuchen…"}
            className="glass h-10 rounded-xl pl-9"
          />
        </div>

        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger size="sm" className="glass w-48 border-white/10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="glass-strong border-white/10">
            <SelectItem value="all">Alle Projekte</SelectItem>
            {series.map((entry) => (
              <SelectItem key={entry.id} value={`s:${entry.id}`}>
                Reihe: {entry.name} ({entry.volumeIds.length})
              </SelectItem>
            ))}
            {books.map((book) => (
              <SelectItem key={book.id} value={`b:${book.id}`}>
                {book.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {tab === "facts" ? (
          <>
            <Select
              value={kindFilter}
              onValueChange={(value) => setKindFilter(value as FactKind | "all")}
            >
              <SelectTrigger size="sm" className="glass w-40 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="glass-strong border-white/10">
                <SelectItem value="all">Alle Kategorien</SelectItem>
                {FACT_KINDS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {FACT_KIND_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={scopeFilter}
              onValueChange={(value) => setScopeFilter(value as FactEntityType | "all")}
            >
              <SelectTrigger size="sm" className="glass w-36 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="glass-strong border-white/10">
                <SelectItem value="all">Figur + Welt</SelectItem>
                <SelectItem value="character">Nur Figuren</SelectItem>
                <SelectItem value="world">Nur Welt</SelectItem>
              </SelectContent>
            </Select>
          </>
        ) : null}
      </div>

      {tab === "facts" ? (
        visibleFacts.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="size-6" />}
            title="Keine Fakten gefunden"
            description="Filter anpassen — oder über „Vorschläge ableiten“ Fakten aus dem Storyboard holen."
          />
        ) : (
          <div className="space-y-2">
            {visibleFacts.map((fact) => (
              <div
                key={fact.id}
                className="glass flex items-start gap-3 rounded-xl border border-white/10 p-3 transition-colors hover:border-white/20"
              >
                <Badge tone={FACT_KIND_TONE[fact.kind]}>{FACT_KIND_LABELS[fact.kind]}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold">{nameOf(fact.entityId)}</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {fact.entityType === "world" ? "Welt" : "Figur"}
                    </span>
                    {fact.hard ? <Badge tone="amber">hart</Badge> : null}
                    {fact.establishedIn ? (
                      <span className="text-[11px] text-muted-foreground">
                        {fact.establishedIn}
                      </span>
                    ) : null}
                  </div>
                  <Input
                    value={fact.statement}
                    onChange={(event) =>
                      onFactsChange(
                        facts.map((item) =>
                          item.id === fact.id ? { ...item, statement: event.target.value } : item,
                        ),
                      )
                    }
                    className="glass mt-1.5 h-8 rounded-lg border-white/10 text-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onFactsChange(facts.filter((item) => item.id !== fact.id))}
                  className="mt-1 shrink-0 rounded-lg border border-white/10 p-1.5 text-muted-foreground transition-colors hover:text-brand-rose"
                  title="Fakt löschen"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-5">
          <div className="glass rounded-2xl border border-white/10 p-4">
            {graph.nodes.length < 2 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Mindestens zwei Figuren nötig, um Beziehungen zu zeigen.
              </p>
            ) : (
              <>
                <svg
                  viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
                  className="h-auto w-full"
                  role="img"
                  aria-label="Beziehungsgraph"
                >
                  <defs>
                    <marker
                      id="relation-arrow"
                      viewBox="0 0 10 10"
                      refX="9"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(255,255,255,0.45)" />
                    </marker>
                  </defs>

                  {graph.drawn.map(({ relation, from, to }) => (
                    <g key={relation.id}>
                      <path
                        d={edgePath(from, to)}
                        fill="none"
                        stroke={RELATION_COLORS[relation.kind]}
                        strokeWidth={edgeWidth(relation.intensity)}
                        strokeOpacity={edgeOpacity(relation.intensity)}
                        strokeDasharray={relation.secret ? "5 4" : undefined}
                        markerEnd="url(#relation-arrow)"
                      >
                        <title>
                          {`${from.name} → ${to.name}: ${RELATION_KIND_LABELS[relation.kind]} (${formatIntensity(relation.intensity)})${relation.note ? ` — ${relation.note}` : ""}`}
                        </title>
                      </path>
                    </g>
                  ))}

                  {graph.nodes.map((node) => (
                    <g key={node.id}>
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={16}
                        fill="hsl(258 90% 62% / 0.18)"
                        stroke="hsl(258 90% 66% / 0.65)"
                        strokeWidth={1.5}
                      />
                      <text
                        x={node.x}
                        y={node.y + 34}
                        textAnchor="middle"
                        className="fill-current text-[11px]"
                        style={{ fontSize: 11 }}
                      >
                        {truncate(node.name)}
                      </text>
                    </g>
                  ))}
                </svg>

                <div className="mt-2 flex flex-wrap gap-3">
                  {[...new Set(graph.drawn.map((entry) => entry.relation.kind))].map((kind) => (
                    <span
                      key={kind}
                      className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
                    >
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: RELATION_COLORS[kind as RelationKind] }}
                      />
                      {RELATION_KIND_LABELS[kind as RelationKind]}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          {visibleRelations.length === 0 ? (
            <EmptyState
              icon={<Users className="size-6" />}
              title="Keine Beziehungen erfasst"
              description="Beziehungen pflegst du im Charakter-Editor — oder über „Vorschläge ableiten“."
            />
          ) : (
            <div className="space-y-2">
              {visibleRelations.map((relation) => (
                <div
                  key={relation.id}
                  className="glass flex items-center gap-3 rounded-xl border border-white/10 p-3"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: RELATION_COLORS[relation.kind] }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs">
                      <span className="font-semibold">{nameOf(relation.fromId)}</span>
                      <span className="text-muted-foreground"> → </span>
                      <span className="font-semibold">{nameOf(relation.toId)}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {RELATION_KIND_LABELS[relation.kind]} (
                        {hasArc(relation)
                          ? `Verlauf ${formatIntensity(arcDelta(relation.arc ?? []))}`
                          : formatIntensity(relation.intensity)}
                        )
                        {relation.secret ? " · geheim" : ""}
                        {relation.establishedIn ? ` · ${relation.establishedIn}` : ""}
                      </span>
                    </p>
                    {relation.note ? (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{relation.note}</p>
                    ) : null}
                  </div>
                  {hasArc(relation) ? (
                    <RelationSparkline arc={relation.arc ?? []} color={RELATION_COLORS[relation.kind]} />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onRelationsChange(relations.filter((item) => item.id !== relation.id))}
                    className="shrink-0 rounded-lg border border-white/10 p-1.5 text-muted-foreground transition-colors hover:text-brand-rose"
                    title="Beziehung löschen"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Beziehungen: {relations.length} · Arten: {RELATION_KINDS.length} verfügbar
          </p>
        </div>
      )}

      <ContinuityExtractDialog
        open={candidates !== null}
        facts={candidates?.facts ?? []}
        relations={candidates?.relations ?? []}
        running={extracting}
        bookTitle={books.find((book) => book.id === extractBookId)?.title ?? ""}
        onClose={() => setCandidates(null)}
        onAccept={acceptExtraction}
      />
    </div>
  );
}

