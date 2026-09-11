/**
 * Kontinuitäts-Datenbank: Fakten zu Figuren/Welt und Beziehungen zwischen Figuren.
 *
 * Prüf-Pässe arbeiten sonst mit Freitext — das Modell muss Widersprüche selbst *erkennen*.
 * Fakten und Beziehungen werden einmal explizit erfasst und den Prüfungen als **harte
 * Vorgaben** mitgegeben (`canonBlock`), damit gegen Fakten geprüft statt geraten wird.
 */

export type FactKind = "attribute" | "history" | "skill" | "possession" | "world" | "rule";

export type FactEntityType = "character" | "world";

export interface CanonFact {
  id: string;
  kind: FactKind;
  /** Betroffene Entität: Charakter-ID oder Welteintrag-ID. */
  entityId: string;
  entityType: FactEntityType;
  /** Kurze, überprüfbare Aussage. */
  statement: string;
  /** Kapitel/Bereich, in dem der Fakt etabliert wurde (optional). */
  establishedIn?: string;
  /** Nur für world: harte Regeln, die nie gebrochen werden dürfen. */
  hard?: boolean;
}

export type RelationKind =
  | "loyalty"
  | "love"
  | "friendship"
  | "distrust"
  | "debt"
  | "rivalry"
  | "mentorship"
  | "family"
  | "enmity";

export interface CharacterRelation {
  id: string;
  /** Charakter-ID (Quelle). */
  fromId: string;
  /** Charakter-ID (Ziel). */
  toId: string;
  kind: RelationKind;
  /** −1 (feindselig) … 1 (zugewandt). */
  intensity: number;
  note?: string;
  secret?: boolean;
  establishedIn?: string;
}

/** Vorschlag aus der Extraktion — der Client mappt Namen auf IDs. */
export interface ExtractedFact {
  kind: FactKind;
  entityName: string;
  entityType: FactEntityType;
  statement: string;
  establishedIn?: string;
  hard?: boolean;
}

export interface ExtractedRelation {
  fromName: string;
  toName: string;
  kind: RelationKind;
  intensity: number;
  note?: string;
  secret?: boolean;
  establishedIn?: string;
}

export interface ExtractedContinuity {
  facts: ExtractedFact[];
  relations: ExtractedRelation[];
}

export const FACT_KINDS: FactKind[] = [  "attribute",
  "history",
  "skill",
  "possession",
  "world",
  "rule",
];

export const FACT_KIND_LABELS: Record<FactKind, string> = {
  attribute: "Eigenschaft",
  history: "Vergangenheit",
  skill: "Fähigkeit",
  possession: "Besitz",
  world: "Welt",
  rule: "Regel",
};

export const RELATION_KINDS: RelationKind[] = [
  "loyalty",
  "love",
  "friendship",
  "distrust",
  "debt",
  "rivalry",
  "mentorship",
  "family",
  "enmity",
];

export const RELATION_KIND_LABELS: Record<RelationKind, string> = {
  loyalty: "Loyalität",
  love: "Liebe",
  friendship: "Freundschaft",
  distrust: "Misstrauen",
  debt: "Schuld",
  rivalry: "Rivalität",
  mentorship: "Mentorschaft",
  family: "Familie",
  enmity: "Feindschaft",
};

/** Farbe je Beziehungstyp für den Graphen (HSL, damit keine UI-Importe nötig sind). */
export const RELATION_COLORS: Record<RelationKind, string> = {
  loyalty: "hsl(158 84% 46%)",
  love: "hsl(342 90% 62%)",
  friendship: "hsl(186 100% 52%)",
  distrust: "hsl(38 95% 58%)",
  debt: "hsl(258 70% 62%)",
  rivalry: "hsl(20 90% 58%)",
  mentorship: "hsl(232 85% 64%)",
  family: "hsl(280 70% 62%)",
  enmity: "hsl(0 84% 58%)",
};

function randomId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function newFactId(): string {
  return randomId("fact");
}

export function newRelationId(): string {
  return randomId("rel");
}

export function emptyFact(
  entityId: string,
  entityType: FactEntityType = "character",
  kind: FactKind = "attribute",
): CanonFact {
  return { id: newFactId(), kind, entityId, entityType, statement: "" };
}

/** Stabile Sortierung: Entität, dann Kategorie, dann Kapitel. */
export function sortFacts(facts: CanonFact[]): CanonFact[] {
  return [...facts].sort(
    (a, b) =>
      a.entityId.localeCompare(b.entityId) ||
      a.kind.localeCompare(b.kind) ||
      (a.establishedIn ?? "").localeCompare(b.establishedIn ?? ""),
  );
}

export function factsForEntity(facts: CanonFact[], entityId: string): CanonFact[] {
  return facts.filter((fact) => fact.entityId === entityId);
}

/** Fakten, die zu einem Projekt gehören (Figuren und Welt dieses Buchs). */
export function factsForBook(
  facts: CanonFact[],
  characterIds: Set<string>,
  worldIds: Set<string>,
): CanonFact[] {
  return facts.filter((fact) =>
    fact.entityType === "character" ? characterIds.has(fact.entityId) : worldIds.has(fact.entityId),
  );
}

/** Beziehungen, deren beide Enden zu diesem Projekt gehören. */
export function relationsForBook(
  relations: CharacterRelation[],
  characterIds: Set<string>,
): CharacterRelation[] {
  return relations.filter(
    (relation) => characterIds.has(relation.fromId) && characterIds.has(relation.toId),
  );
}

/** Beziehungen einer Figur (in beide Richtungen). */
export function relationsForCharacter(
  relations: CharacterRelation[],
  characterId: string,
): CharacterRelation[] {
  return relations.filter(
    (relation) => relation.fromId === characterId || relation.toId === characterId,
  );
}

/** −1 … 1 als Text mit Vorzeichen, z. B. „−0,6". */
export function formatIntensity(value: number): string {
  const clamped = Math.max(-1, Math.min(1, value));
  const text = Math.abs(clamped).toFixed(1).replace(".", ",");
  if (clamped > 0) return text;
  if (clamped < 0) return `−${text}`;
  return text;
}

export interface CanonBlockInput {
  facts: CanonFact[];
  relations: CharacterRelation[];
  /** Liefert den Anzeigenamen zu einer Entitäts-ID (Figur oder Welteintrag). */
  nameOf: (entityId: string) => string;
}

/**
 * Verbindlicher Prompt-Block (Englisch, damit er in den System-Prompts nicht untergeht).
 * Liefert "" wenn keine Fakten/Beziehungen vorliegen — dann taucht kein leerer Header auf.
 */
export function canonBlock({ facts, relations, nameOf }: CanonBlockInput): string {
  const sections: string[] = [];

  if (facts.length > 0) {
    const lines = sortFacts(facts)
      .filter((fact) => fact.statement.trim().length > 0)
      .map((fact) => {
        const name = nameOf(fact.entityId) || fact.entityId;
        const scope = fact.entityType === "world" ? `WORLD: ${name}` : name;
        const flags = [FACT_KIND_LABELS[fact.kind].toLowerCase()];
        if (fact.hard) flags.push("hard");
        const chapter = fact.establishedIn?.trim() ? ` (${fact.establishedIn.trim()})` : "";
        return `- [${scope}] (${flags.join(", ")}) ${fact.statement.trim()}${chapter}`;
      });
    if (lines.length > 0) {
      sections.push(
        `CANON FACTS (binding — never contradict these; if the text does, name the fact and chapter in <NOTES>):\n${lines.join("\n")}`,
      );
    }
  }

  if (relations.length > 0) {
    const lines = relations
      .filter((relation) => relation.fromId !== relation.toId)
      .map((relation) => {
        const from = nameOf(relation.fromId) || relation.fromId;
        const to = nameOf(relation.toId) || relation.toId;
        const note = relation.note?.trim() ? ` — ${relation.note.trim()}` : "";
        const chapter = relation.establishedIn?.trim() ? ` (${relation.establishedIn.trim()})` : "";
        const secret = relation.secret ? " [secret]" : "";
        return `- ${from} → ${to}: ${relation.kind} (${formatIntensity(relation.intensity)})${secret}${note}${chapter}`;
      });
    if (lines.length > 0) {
      sections.push(
        `RELATIONS (binding — keep these dynamics consistent):\n${lines.join("\n")}`,
      );
    }
  }

  return sections.join("\n\n");
}

/* ───────────────────────────── Seeds (frisches Profil) ───────────────────────────── */

/** Beispiel-Fakten zu den Seed-Figuren/-Welten — reale Aussagen aus deren Soul-Daten. */
export const CONTINUITY_FACTS: CanonFact[] = [
  {
    id: "fact-seed-1",
    kind: "history",
    entityId: "seraphine-vhalor",
    entityType: "character",
    statement:
      "Wurde mit sechzehn verbannt, nachdem ihre Schwester unter ungeklärten Umständen starb.",
    establishedIn: "Kapitel 2",
  },
  {
    id: "fact-seed-2",
    kind: "possession",
    entityId: "seraphine-vhalor",
    entityType: "character",
    statement: "Trägt die Aschekrone, deren Wille ihren eigenen langsam überschreibt.",
    establishedIn: "Kapitel 1",
  },
  {
    id: "fact-seed-3",
    kind: "history",
    entityId: "kiro-tanaka",
    entityType: "character",
    statement: "Wurde mit neunzehn für ein Konzern-Experiment angeworben, dessen Akten heute brennen.",
    establishedIn: "Kapitel 3",
  },
  {
    id: "fact-seed-4",
    kind: "skill",
    entityId: "kiro-tanaka",
    entityType: "character",
    statement: "Verkauft ihre Waffe an den Meistbietenden — ihre Erinnerungen an niemanden.",
  },
  {
    id: "fact-seed-5",
    kind: "history",
    entityId: "pfarrer-milos",
    entityType: "character",
    statement:
      "Wurde vor drei Jahren ohne Papiere und ohne Erinnerung unter dem Eis von Sankt Kalt gefunden.",
    establishedIn: "Kapitel 1",
  },
  {
    id: "fact-seed-6",
    kind: "history",
    entityId: "alina-kraeh",
    entityType: "character",
    statement: "Verließ Krähenfeld als Jugendliche, nachdem ihre beste Freundin verschwand.",
    establishedIn: "Kapitel 1",
  },
  {
    id: "fact-seed-7",
    kind: "rule",
    entityId: "w-aschenthron",
    entityType: "world",
    statement:
      "Wer zu lange auf dem Aschenthron sitzt, hört auf, zwischen Krone und eigener Stimme zu unterscheiden.",
    hard: true,
  },
  {
    id: "fact-seed-8",
    kind: "world",
    entityId: "w-konzerne",
    entityType: "world",
    statement:
      "Drei Konzerne kontrollieren zusammen die Speichertechnologie — offiziell ein Kartell, inoffiziell ein Staat.",
  },
];

/** Noch keine Seed-Beziehungen: die Seed-Bücher haben je nur eine Figur. */
export const CONTINUITY_RELATIONS: CharacterRelation[] = [];

