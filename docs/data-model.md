# Datenmodell & Persistenz

Alle Fachtypen liegen in `src/data/*`, alle Persistenz-Logik in `src/lib/*`.
Fachdaten liegen **serverseitig in SQLite** (`<runtimeRoot>/data/authorai.db`), gescoped
**pro Profil**; nur **Profile** und **geräteweite Einstellungen** (Modelle, Sprache,
Stil-Profil) bleiben im Browser.

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
  /** Storyboard einmalig in die Sammlungen gespiegelt (Figuren/Welt/Plot) — siehe unten. */
  storyboardImported?: boolean;
  /** Bis zu welchem Kapitel (Anzahl) der Kanon aus dem Manuskript gescannt wurde. */
  canonScannedChapters?: number;
  storyboard?: Storyboard;
  manuscript?: ChapterContent[];
}
```

**`canonScannedChapters`** macht den Kanon-Scan **fortsetzbar**: Er wird beim Übernehmen der
Vorschläge auf den erreichten Kapitelstand gesetzt. Der nächste Scan bietet an, dort weiterzumachen
und schickt nur die offenen Kapitel (Versatz `startChapter` → absolute Kapitel-Labels). Ein
abgebrochener Lauf kostet damit nur das, was noch nicht bestätigt war; „alles neu scannen" ist
weiterhin möglich.

**`storyboardImported`** verhindert, dass Löschungen von selbst zurückkommen: Die Shell leitet
fehlende Storyboard-Daten (Figuren, Weltenbau, Plot-Karten) beim Start nach — aber nur für Bücher
**ohne** diesen Merker. Gesetzt wird er beim Anlegen/Import eines Buchs und beim Nachziehen
bestehender Profile; damit ist ein geleerter Bereich (`[]`) dauerhaft leer. Die Storyboards selbst
bleiben unverändert und lassen sich jederzeit erneut ableiten ("Storyboard ableiten").

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
  beatCharacters?: string[][]; // Figuren-IDs je Szene (parallel zu storyboard.beats)
  sceneMeta?: SceneMeta[];     // POV/Schauplatz/Zeit/Wortziel je Szene
  consistencyNotes?: string;   // Prüfbericht (zeilenweise)
  consistencyChecked?: boolean;
  styleNotes?: string;
  styleChecked?: boolean;
  canonCheck?: ChapterCanonCheck; // letzter Fakten-Check (Prüf-Historie)
}

/** Ergebnis des letzten Fakten-Checks an einem Kapitel (Prüf-Historie). */
interface ChapterCanonCheck {
  at: string;        // Zeitpunkt (ISO)
  ok: boolean;       // keine Widersprüche gefunden
  count: number;     // Anzahl gemeldeter Widersprüche
  summary: string;   // Kurzfassung des Berichts
  scope?: string;    // Umfang (z. B. „Gesamter Kanon" oder ein Figurenname)
  hash: string;      // Hash des geprüften Texts (erkennt „unverändert seit dem Check")
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

`sceneMeta` und die Beat-Liste (`storyboard.chapters[i].beats`) sind **parallel**: Index `n` in
`sceneMeta` gehört zu Beat `n`. Genau diese beiden liest die **Timeline-Prüfung** und schreibt der
**Timeline-Quick-Fix** (`time`/`setting` in `sceneMeta`, korrigierte Szenen-Texte im Beat) —
deshalb liegt eine solche Korrektur außerhalb der Kapitel-Version (siehe `roadmap.md`,
„Szenen-Struktur versionieren").

`beatCharacters` ist die **dritte** parallele Liste (Index `n` = Figuren der Szene `n`) und speichert
**Figuren-IDs**. Gefüllt wird sie von der Szenen-Ableitung: Das Modell liefert nur **Namen** (es kennt
keine Figurenliste), die Zuordnung Name → ID macht der Client über `lib/characterMatch.ts`. Alle drei
Listen müssen beim Schreiben dieselbe Länge behalten, sonst verrutschen die Indizes.

**Import:** Ein importiertes Manuskript liegt in **`expanded`** (`draft` bleibt leer, weil es
keinen Rohentwurf gibt). So liest es die gesamte Kette (`manuscriptOf` → `expanded || draft`)
ohne Sonderfall: Pässe, Exporte, Wortzahlen, Prüfungen.

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
  quote?: string;                // wörtlicher Beleg aus dem Manuskript (server-geprüft)
  establishedIn?: string;        // Kapitel-Label, vom Server gesetzt
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

**`CanonFact.quote`** entsteht bei der Ableitung: Jeder Vorschlag muss ein wörtliches Zitat aus
dem Kapitel mitbringen, das der Server gegen genau diesen Text prüft (Toleranz nur bei Weißraum,
Zeichensetzung und typografischen Anführungszeichen). Ohne belegbaren Beleg wandert der Fakt
**nicht** in den Kanon — deshalb ist der Kanon nachprüfbar statt bloß plausibel. Manuell im
Charakter-Editor angelegte Fakten haben keinen Beleg; das Feld ist optional.

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

## Persistenz

### Fachdaten — SQLite (`<runtimeRoot>/data/authorai.db`)

Alle Sammlungen liegen **serverseitig** in SQLite (`bun:sqlite`), Tabelle `state`:

```sql
CREATE TABLE state (
  profile_id TEXT NOT NULL,
  collection TEXT NOT NULL,
  json       TEXT NOT NULL,   -- die Sammlung als JSON
  updated_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, collection)
);
```

| Sammlung | Inhalt |
| --- | --- |
| `books` | `Book[]` (inkl. Storyboard + Manuskript) |
| `characters` | `Character[]` |
| `world` | `WorldEntry[]` |
| `plot` | `PlotCard[]` |
| `research` | `ResearchNote[]` |
| `ideas` | `Idea[]` (Plot-Funken) |
| `coverPresets` | `SavedCoverPreset[]` (eigene Cover-Text-Presets) |
| `notifications` | `AppNotification[]` |
| `facts` | `CanonFact[]` (Kontinuität) |
| `relations` | `CharacterRelation[]` (Beziehungen) |
| `series` | `Series[]` (Reihen / Mehrbänder) |
| `meta` | `DashboardMeta` (Objekt, kein Array) |

Ablauf: `App.tsx` ruft beim Profilwechsel `hydrateState(profileId)` → `GET /api/state` füllt den
Cache in `lib/persistence.ts`; die App liest danach **synchron** daraus. Geschrieben wird
gebündelt (`schedule`, 400 ms) über `PUT /api/state`. Sammlungsnamen sind in
`src/data/state.ts` als Whitelist hinterlegt (Client **und** Server).

- **fehlende** Sammlung = frisches Profil → Seeds greifen
- **`[]`** = bewusst geleert → Beispiele kommen nicht zurück
- Ohne Server läuft die App weiter und liest den alten `localStorage`-Stand (nur lesend).
- Frühere `localStorage`-Daten werden beim ersten Start **einmalig** in die Datenbank
  übernommen (`migrateFromLocalStorage`, Flag `authorai.<profilId>.migrated`).

### Profile & Einstellungen (weiterhin `localStorage`)
| Key | Inhalt |
| --- | --- |
| `authorai.profiles` | `Profile[]` (`{ id, name, createdAt }`) |
| `authorai.currentProfile` | aktive Profil-ID |
| `authorai.model` | Standard-Model (Fallback) |
| `authorai.model.storyboard` \| `draft` \| `expand` \| `consistency` \| `style` | Model je Stufe |
| `authorai.language` | Ausgabesprache |
| `authorai.styleProfile` | Zielstimme: `{ presetId, custom }` (Stil-Pass) |
| `authorai.canonWarn` | Kanon-Warnung beim Kapitelwechsel (`"0"` = aus; Standard an) |
| `authorai.<profilId>.migrated` | Flag der einmaligen Datenübernahme |

> Profile und Generierungs-Einstellungen sind bewusst **geräteweit** und winzig — sie bleiben im
> Browser. Alles Große (Manuskripte, Historie) liegt in der Datenbank.
>
> **Nicht hier:** die LLM-Anbieter-Konfiguration (Base-URL + API-Key). Der Key liegt
> **serverseitig** in der SQLite-Tabelle `provider` — bewusst **nicht** in der Sammlung `state`,
> damit er weder über `/api/state` noch über Backups nach außen gelangt (siehe
> [`configuration.md`](configuration.md)).


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
| `localStorage` → SQLite | Datenbank leer **und** `authorai.<profilId>.*`-Daten vorhanden | einmalige Übernahme in die Datenbank (Flag `authorai.<profilId>.migrated`); danach dient `localStorage` nur noch als lesender Notnagel |
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
