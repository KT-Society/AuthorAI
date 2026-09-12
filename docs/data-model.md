# Datenmodell & Persistenz

Alle Fachtypen liegen in `src/data/*`, alle Persistenz-Logik in `src/lib/*`.
Es gibt **keine Datenbank** — die Quelle der Wahrheit ist der Browser-Speicher, gescoped
**pro Profil**.

---

## Kern-Typen

### Book (`src/data/author.ts`)

```ts
type BookStatus = "idea" | "draft" | "editing" | "published";

interface Book {
  id: string;
  title: string;
  subtitle: string;
  genre: string;
  status: BookStatus;
  words: number;            // Summe (ausgebaute bevorzugt, sonst Rohentwurf)
  goalWords: number;        // Summe der Kapitel-Zielwörter
  chapters: number;
  chaptersDone: number;     // Kapitel mit Text
  updatedAt: string;        // ISO
  coverFrom: string;        // HSL-Fallback-Gradient
  coverTo: string;
  tags: string[];
  synopsis: string;
  coverUrl?: string;        // "/covers/<datei>.png" (server-gespeichert)
  coverBackUrl?: string;    // optionales Back-/Rückseiten-Cover
  coverLayers?: CoverTextLayer[];      // persistierte Front-Text-Layer
  coverBackLayers?: CoverTextLayer[];  // persistierte Back-Text-Layer
  defaultTargetWords?: number;         // Projekt-Vorgabe je Kapitel
  storyboard?: Storyboard;
  manuscript?: ChapterContent[];
}
```

### Storyboard (`src/data/story.ts`)

```ts
interface Storyboard {
  title: string; subtitle: string; genre: string;
  logline: string; synopsis: string;
  themes: string[]; tone: string; pov: string;
  characters: StoryCharacter[];   // { name, role, description }
  world?: StoryWorld;             // optional (ältere Storyboards)
  chapters: ChapterPlan[];
}

interface ChapterPlan {
  index: number; title: string; summary: string;
  pov: string; setting: string;
  beats: string[]; foreshadowing: string[];
}

interface StoryWorld {
  locations: WorldItem[];   // { name, description }
  factions: WorldItem[];
  magic: WorldItem[];
  artifacts: WorldItem[];
  lore: WorldItem[];
}
```

### ChapterContent (Manuskript)

```ts
interface ChapterContent {
  index: number;
  title: string;
  draft: string;               // Rohentwurf
  expanded: string;            // Ausbau
  targetWords?: number;        // Kapitel-Ziel (sonst Buch-Vorgabe)
  characterIds?: string[];     // Figuren im Kapitel
  beatCharacters?: string[][]; // Figuren je Szene (parallel zu storyboard.beats)
  sceneMeta?: SceneMeta[];     // POV/Schauplatz/Zeit/Wortziel je Szene
  consistencyNotes?: string;   // Prüfbericht (zeilenweise)
  consistencyChecked?: boolean;
  styleNotes?: string;
  styleChecked?: boolean;
}

/** Metadaten je Szene (parallel zur Beat-Liste). */
interface SceneMeta {
  pov?: string;
  setting?: string;
  time?: string;
  words?: number;   // Wortziel dieser Szene
}

/** Verbindliche Szene, wie sie an den Server geht. */
interface SceneConstraint {
  text: string;
  characters: string[];  // Namen
  pov?: string;
  setting?: string;
  time?: string;
  words?: number;
}
```

### Cover-Text (`src/data/cover.ts`)

```ts
interface CoverTextLayer {
  id: string;
  role: "title" | "author" | "free";
  text: string;
  x: number; y: number;        // Prozent (Ankerpunkt)
  size: number;                // Anteil der Bildbreite
  fontFamily: string;
  fontWeight: number;
  color: string;
  align: "left" | "center" | "right";
  letterSpacing: number;
  uppercase: boolean;
  italic: boolean;
  shadow: boolean;
}
```

Dazu `COVER_PRESETS` (Schriftpaare), `COVER_LAYOUTS` und `applyCoverPreset`/`applyCoverLayout`.

### Domänen

| Typ | Datei | Zweck |
| --- | --- | --- |
| `Character` | `characters.ts` | Figur inkl. `soul: Record<string,string>` (12 Sektionen) |
| `WorldEntry` | `world.ts` | Kategorie: `Ort \| Fraktion \| Magie \| Artefakt \| Lore` |
| `PlotCard` | `plot.ts` | Story-Beat: `act`, `status: idea \| planned \| written`, `order` |
| `ResearchNote` | `research.ts` | Notiz mit Quelle/URL, Tags |
| `CanonFact` | `continuity.ts` | Prüfbarer Fakt zu Figur/Welt (`kind`, `statement`, `establishedIn`, `hard`) |
| `CharacterRelation` | `continuity.ts` | Gerichtete Beziehung (`kind`, `intensity` −1…1, `note`, `secret`) |

### Kontinuität (`src/data/continuity.ts`)

```ts
type FactKind = "attribute" | "history" | "skill" | "possession" | "world" | "rule";
type FactEntityType = "character" | "world";

interface CanonFact {
  id: string;
  kind: FactKind;
  entityId: string;              // Charakter-ID oder Welteintrag-ID
  entityType: FactEntityType;
  statement: string;             // kurze, prüfbare Aussage
  establishedIn?: string;        // z. B. "Kapitel 4"
  hard?: boolean;                // nur world: nie brechbare Regel
}

type RelationKind = "loyalty" | "love" | "friendship" | "distrust" | "debt"
                  | "rivalry" | "mentorship" | "family" | "enmity";

interface CharacterRelation {
  id: string;
  fromId: string;                // Charakter-ID
  toId: string;                  // Charakter-ID
  kind: RelationKind;
  intensity: number;             // −1 (feindselig) … 1 (zugewandt)
  note?: string;
  secret?: boolean;
  establishedIn?: string;
}
```

`canonBlock({ facts, relations, nameOf })` rendert daraus den **verbindlichen Prompt-Block**
für alle Generierungs- und Prüf-Pässe; sind beide Listen leer, liefert er `""` (kein leerer
Header im Prompt). Beim Löschen einer Figur bzw. eines Welteneintrags räumt die Shell
zugehörige Fakten und Beziehungen mit auf.

### Reihen (`src/data/series.ts`)

```ts
interface Series {
  id: string;
  name: string;
  description?: string;
  volumeIds: string[];   // Buch-IDs in Lesereihenfolge (Band 1 … n)
  createdAt: string;
}
```

**Eine Quelle der Wahrheit:** die Reihe hält die Band-IDs — `Book` bekommt bewusst **kein**
`seriesId`, damit nichts auseinanderlaufen kann. Helfer: `seriesOfBook`, `volumeNumber`,
`volumeLabel`, `canonVolumeIds`, `availableVolumes`, `addableSeries`, `removeBookFromSeries`.

`canonVolumeIds(series, bookId)` liefert die Band-IDs, die für den Kanon eines Buchs gelten:
in einer Reihe **alle Bände** (gemeinsame Welt, Figuren-Historie und Fakten über die Bände),
sonst nur das Buch selbst. Beim Löschen eines Buchs wird es aus allen Reihen entfernt (die
Reihe bleibt bestehen).

### Dashboard-Metriken (`DashboardMeta`)

```ts
interface DashboardMeta {
  version: number;          // META_VERSION, steuert Migrationen
  streakCurrent: number;
  streakBest: number;
  weeklyWords: number[];    // 7 Slots, Mo–So
  todayWords: number;
  goal: number;             // Tagesziel (Default 1500)
  writingDays: string[];    // ISO-Daten mit Schreibaktivität
  weekStart: string;        // ISO-Datum des Montags zu weeklyWords
  todayDate: string;        // ISO-Datum zu todayWords
}
```

### Notifications

```ts
interface AppNotification {
  kind: "book" | "chapter" | "character" | "cover" | "world" | "plot" | "research" | "info";
  id: string; title: string; message: string;
  createdAt: string; read: boolean;
  view?: string;    // Ziel-Nav beim Klick
  bookId?: string;  // bevorzugt: Buch öffnen
}
```

---

## Persistenz-Keys

### Pro Profil — `authorai.<profilId>.<sammlung>`

| Key | Inhalt |
| --- | --- |
| `books` | `Book[]` (inkl. Storyboard + Manuskript) |
| `characters` | `Character[]` |
| `world` | `WorldEntry[]` |
| `plot` | `PlotCard[]` |
| `research` | `ResearchNote[]` |
| `ideas` | `Idea[]` (Plot-Funken) |
| `notifications` | `AppNotification[]` |
| `facts` | `CanonFact[]` (Kontinuität) |
| `relations` | `CharacterRelation[]` (Beziehungen) |
| `series` | `Series[]` (Reihen / Mehrbänder) |
| `meta` | `DashboardMeta` (Objekt, kein Array) |

### Profile & Einstellungen (geräteweit)

| Key | Inhalt |
| --- | --- |
| `authorai.profiles` | `Profile[]` (`{ id, name, createdAt }`) |
| `authorai.currentProfile` | aktive Profil-ID |
| `authorai.model` | Standard-Model (Fallback) |
| `authorai.model.storyboard` \| `draft` \| `expand` \| `consistency` \| `style` | Model je Stufe |
| `authorai.language` | Ausgabesprache |
| `authorai.styleProfile` | Zielstimme: `{ presetId, custom }` (Stil-Pass) |

> Generierungs-Einstellungen sind bewusst **geräteweit**, nicht pro Profil.

---

## Semantik: „leer" vs. „nie gesetzt"

- Key **fehlt** → frisches Profil → **Seeds** greifen (Beispiele erscheinen).
- Key existiert als **`[]`** → Nutzer hat bewusst geleert → Beispiele kommen **nicht** zurück.

Dadurch sind die Beispielinhalte für jedes neue Profil da, Löschungen bleiben jedoch
dauerhaft erhalten.

---

## Migrationen

| Migration | Auslöser | Verhalten |
| --- | --- | --- |
| Legacy → Profil | vorhandene globale Keys (`authorai.books` …), keine Profile | verschiebt Daten in neues Profil „Autor" |
| Meta v2 → v3 | `DashboardMeta.version < META_VERSION` | Beispiel-Metriken → 0; `todayWords` bleibt; es wird als Schreib-Tag + Wochenslot verbucht |
| Meta „neuer Tag" | `todayDate !== heute` | `todayWords` → 0 |
| Meta „neue Woche" | `weekStart !== Montag` | `weeklyWords` → Nullen |
| Seed-Cover-Backfill | Buch ohne `coverUrl`, ID passt zu Seed | Seed-Cover wird ergänzt |

---

## Abgeleitete Helfer

| Helfer | Datei | Wirkung |
| --- | --- | --- |
| `manuscriptOf(book)` | `lib/bookManuscript.ts` | Manuskript (aus Storyboard abgeleitet, falls fehlt); säubert `<TEXT>`/`<NOTES>`-Reste |
| `countWords(text)` | `data/story.ts` | Wortzahl |
| `manuscriptWordCount(chapters)` | `data/story.ts` | Summe (ausgebaut bevorzugt) |
| `chapterTargetWords(chapter)` | `data/story.ts` | Ziel inkl. Default |
| `progressOf(book)` | `data/author.ts` | Fortschritt in % |
| `computeStreak(days, today)` | `lib/streak.ts` | aktueller + bester Streak |
| `recordWords(meta, amount)` | `lib/streak.ts` | Tages-/Wochenwerte + Streak fortschreiben |
| `filledSectionCount(soul)` | `data/characters.ts` | gefüllte Soul-Sektionen (x/12) |
| `entriesFromStoryWorld(world, bookId)` | `data/world.ts` | Welt-Einträge aus Storyboard |

---

## Seed-Daten

Damit ein frisches Profil lebendig startet, enthalten die `data/*`-Module Beispiele:

- **6 Bücher** (mit generierten Beispiel-Covern unter `covers/`),
- **4 Charaktere**, **5 Welteneinträge**, **6 Plot-Karten**, **3 Recherchenotizen**,
- **4 Plot-Funken** (Ideen).

Seed-Cover sind als **geschützt** markiert und werden nie gelöscht (sie werden von allen
Profilen geteilt).
