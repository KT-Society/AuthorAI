# Entwicklung

Alles, was du zum Mitarbeiten brauchst: Setup, Skripte, Konventionen und die
Verifikations-Workflows, mit denen Änderungen abgesichert werden.

Für den Beitrags-Workflow (Branch, Commit-Stil, PR-Regeln, Review):
siehe [`../CONTRIBUTING.md`](../CONTRIBUTING.md).

---

## Voraussetzungen

- **Bun** ≥ 1.3 (Runtime, Bundler, Paketmanager, Skript-Runner)
- Ein **OpenRouter-Key** (LLM), **Tavily-Key** (Recherche), **Pollinations-Key** (Cover)
- Windows/macOS/Linux (der Servercode ist plattformneutral)

---

## Setup

```bash
bun install                 # Root + alle Workspaces (immer im Repo-Root!)
cp .env.example .env        # falls vorhanden, sonst .env manuell anlegen
bun run dev                 # Root-App :3000, promptgen :3001
```

Keys siehe [`configuration.md`](configuration.md).

---

## Skripte

| Befehl | Wirkung |
| --- | --- |
| `bun run dev` | Root **und** Workspaces im Dev-Modus (HMR) |
| `bun run build` | Root **und** Workspaces bündeln (`dist/`) |
| `bun run build:binary` | Standalone-Release-Ordner `release/` (Binary + LICENSE/README/.env.example) |
| `bun run start` | Produktions-Builds servieren |
| `bun run dev:root` / `build:root` / `start:root` | nur die Root-App |
| `bun run --cwd packages/promptgen dev` | nur promptgen |
| `bun run version:bump <x.y.z>` | App-Version an allen Stellen + Changelog-Abschnitt setzen (`--dry-run`, `--force`) |
| `bun run check` | Syntax-, Import- und Markdown-Link-Checks (`scripts/check.ts`) |
| `python backup/backup.py` | Workspace-Archiv (RAR/ZIP) nach `backup/` — **kein** Bun-Task, operaterseitig (siehe unten) |
| `ALL_DRY=1 bun run scripts/all.ts dev` | Tasks nur auflisten (Dry-Run) |

Für Signierung, Installer und Auslieferung: [`release.md`](release.md)
(`scripts/release.ps1`, `scripts/sign-windows.ps1`, `scripts/build-installer.ps1`).

---

## Arbeitsweise in diesem Repo

- **Der Operator führt aus:** `bun install`, Builds, Git-Commits/Pushes, Backups.
  Der Agent **schreibt Code** und verifiziert statisch.
- **Zero-Warning-Haltung:** Warnungen (Build, Typen, Lint) gelten als Mangel und werden
  an der Wurzel behoben — nicht ignoriert.
- **Bestehende Testfehler** werden nicht eigenmächtig angefasst; neue Fehler schon.

---

## Workspace-Sicherung (`backup/backup.py`)

Ein **eigenständiges Python-Skript** (kein Bun-Task, kein App-Bestandteil) für den **Operator**:
Es packt den kompletten Repository-Stand in ein Archiv — als Sicherung **vor** Version-Bumps,
größeren Umbauten, Datenbank-Eingriffen oder einem Release.

```bash
python backup/backup.py                 # fragt interaktiv nach dem Format
python backup/backup.py --format rar    # RAR erzwingen (Fallback ZIP ohne WinRAR)
python backup/backup.py --format zip    # ZIP erzwingen
```

| | |
| --- | --- |
| **Ablage** | `backup/WORKSPACE_v<version>_backup_<YYYYmmdd_HHMMSS>.<ext>` |
| **Version** | Überschrift `## [x.y.z]` aus dem Root-`CHANGELOG.md`, sonst `version` aus `package.json`; für den Dateinamen fallen alle Nicht-Alphanumerik-Zeichen weg (`0.5.9` → `v059`) |
| **Format** | RAR mit maximaler Kompression (`-m5`) über WinRAR aus `PATH` oder Standard-Installationspfad; ist kein WinRAR da → automatisch ZIP (Deflate Level 9). Ohne TTY und ohne `--format` ebenfalls ZIP |
| **Aufräumen** | Nach jedem Lauf bleiben die **50 neuesten** Archive in `backup/`, ältere werden gelöscht |
| **Log** | Vollständig auf stdout: Dateizahl, Gesamtgröße, Fortschritt alle 500 Dateien, Dauer |
| **Robustheit** | Nicht lesbare Dateien/Ordner werden übersprungen statt abzubrechen; RAR-Lauf mit 1 h Timeout |

**Nicht im Archiv:** `node_modules`, `.turbo`, `.build` und bereits vorhandene Archive
(`*.rar`, `*.zip`). Vom `backup/`-Ordner selbst wird nur der Inhalt übersprungen, der ein Archiv
ist — Dateien darin, die **keine** Archive sind, bleiben im Backup.

**Enthalten** (gitignorierte Laufzeitdaten ausdrücklich mit, weil das Skript das Dateisystem
scannt und nicht Git):

| Pfad | Warum es wichtig ist |
| --- | --- |
| `.env` | **Enthält die API-Keys** → Archive sind vertraulich, nie weitergeben oder hochladen |
| `data/` | `authorai.db` **plus** `-shm`/`-wal` — die Profildaten |
| `covers/`, `release/` | Erzeugte Cover und vorhandene Builds/Installer (treiben die Archivgröße) |
| `.git/` | komplette Repository-Historie |
| `.echo/` | persönliche Agent-Konfiguration (ebenfalls mit `.env` darin) |

> **Vor der Sicherung den Dev-Server stoppen.** SQLite läuft im WAL-Modus: bei laufendem Server
> können Schreibvorgänge noch in `-wal`/`-shm` stehen — eine Kopie im laufenden Betrieb ist
> unnötig riskant, obwohl beide Dateien mitgesichert werden.

> **`backup.py` reist mit.** Das Skript überspringt sein `backup/`-Verzeichnis, nimmt daraus aber
> jede Datei mit, die kein Archiv ist — `backup.py` selbst gehört dazu, damit ein wiederhergestellter
> Stand sofort weiter sichern kann. (Bis 0.5.9 war die Sonderregel im Code wirkungslos: der ganze
> Ordner wurde übersprungen, **bevor** sie greifen konnte — geprüft an einem echten Archiv.)
> `backup/backup.py` ist versioniert (Git, nicht ignoriert); die Archive sind über
> `*.rar`/`*.zip` in `.gitignore` abgedeckt.

**Wiederherstellen**

1. Archiv entpacken.
2. Den Inhalt über den Workspace legen (bestehende Dateien ersetzen).
3. `bun install` — `node_modules` ist bewusst nicht im Archiv.
4. Dev-Server starten; `.env`, `data/authorai.db` und `backup/backup.py` sind enthalten, das
   Profil ist also sofort da — und das Sicherungs-Skript auch.

Das ist **nicht** zu verwechseln mit dem **Projekt-Backup** der Anwendung: Das ist eine
App-Funktion und exportiert einzelne Profildaten als JSON aus dem Browser
(siehe [`architecture.md`](architecture.md)).

---

## Konventionen

### Server vs. Client (harte Grenze)

- **`src/server/*` ist server-only.** Diese Module dürfen **niemals** aus Client-Code
  importiert werden. Sie greifen auf `process.env` und Node-APIs zu.
- **`src/services/*` ist client-only** und spricht ausschließlich lokale `/api/*`-Routen.
- **Secrets** werden nie an den Client gegeben. Neue Keys: nur im Server lesen.
- TypeScript-Alias `@promptgen/*` bindet **nur** Server-Module der Engine.

### Neue API-Funktion (Muster)

1. **Server:** Funktion in `src/server/*` (nutzt `chatCompletion` / `ApiError`).
2. **Route:** Handler in `src/index.ts` mit `readJson`, Validierung, `errorResponse`.
3. **Service:** dünner Wrapper in `src/services/*` über `postJson`.
4. **UI:** View/Dialog konsumiert nur den Service.

**Transport zuerst entscheiden (Stream-First).** Eine neue LLM-Funktion bekommt ihren Transport
**vor** dem Bau festgelegt, nicht nachgerüstet. Drei Trigger — trifft **einer** zu, ist die
`…/stream`-Variante **primär** und wird mit dem Feature geliefert:

1. **Ausgabe > ~1.000 Token** oder Prosa.
2. **Iteration über mehr als ein Kapitel / ein Element** (Batch über alle Kapitel, Kapitelschleife).
3. **Dauer unbestimmt oder potenziell > ~20 s** — alles, was man bestellt und nie am Stück ansieht.

Trifft keiner zu (eine kleine JSON-Antwort, ein einzelnes Kapitel), bleibt der normale Aufruf der
richtige Weg — ein Stream ist kein Selbstzweck. Der Entscheid gehört als Zeile
`Transport: Stream (Trigger 2 — Kapitel-Iteration)` in den Plan, damit er nicht im Kopf verloren
geht. **Nachrüsten kostet doppelt**: Server-Refactor *plus* komplette Client-Verkabelung
(Job-Center, Fortschritt, Abbrechen, `streamEvents`).

**Das Muster: ein Kern, zwei Transporte.** Der Server-Pfad kennt den Transport nicht — die
Handler-Callbacks (`onDelta`, `onPartStart`, …) sind optional, und der Sync-Weg ruft **denselben**
Code ohne Callback (siehe `expandChapter`):

- Server: `sseResponse(async (emit) => …)` + Handler-Callbacks.
- Route: eigener Handler `…/stream`, Validierung **vor** dem Stream (Fehler dort = HTTP 400).
  **Keine Sync-Route ohne echten Aufrufer** — 0.5.9 hat `POST /api/continuity/extract` genau
  deshalb gelöscht; eine Leiche im Router ist teurer als eine Route weniger.
- Service: `streamEvents("/api/…/stream", body, handler)` statt `postJson`; das Ergebnis kommt
  aus dem `done`-Ereignis (siehe `streamPass`, `streamStoryboard`).
- UI: `StreamPreview` für Text, `Job.detail` für Zähler und **Abbrechen** — von Anfang an, nicht
  nachgerüstet.

**Welcher Stream-Typ:** Lange **Prosa** streamt `delta` (Rohentwurf, Ausbau, Kohärenz, Stil).
**Listen und Befunde** über viele Objekte nutzen das **JSONL-Muster** (Timeline-Prüfung und
-Korrektur, Weltenbau, Figuren, Kanon — unten). Ein **Batch über Kapitel** meldet dagegen
**Fortschritt** (`phase`/`chapter`/`chapterDone`), keinen Text (Storyboard, Kanon-Scan). Ein
einzelnes kurzes Objekt ohne Fortschritt bleibt ein normaler `postJson`-Aufruf.

### JSONL-Muster (Listen live melden)

Für Antworten, die aus **vielen gleichartigen Objekten** bestehen (Befunde, Figuren, Welt-Einträge,
Fakten), gibt es statt eines JSON-Dokuments eine JSONL-Variante: ein Objekt pro Zeile.

- Server: `createJsonlConsumer(handle)` aus `src/server/jsonl.ts` an `chatCompletionStream` hängen
  — `push` puffert über Textstück-Grenzen, `flush` verarbeitet den Rest. Der Prompt bekommt den
  Formatblock aus `jsonlFormatBlock(...)`.
- **Auftrag und Feldregeln gehören in einen geteilten Brief** (`timelineCheckBrief`, `worldBrief`, …),
  den JSON- und JSONL-Prompt gemeinsam nutzen — sonst driften die Varianten auseinander.
- **Am Ende immer dieselbe Normalisierung** wie im Nicht-Streaming-Weg laufen lassen (ein
  `…Result(parsed, input)`-Helfer), damit Live- und Endfassung identisch streng sind. Live-Objekte
  sind **roh und unvalidiert** — die Oberfläche darf erst gegen den `done`-Inhalt schreiben.
- Fallback-Kette einbauen: **live** sammeln → kam nichts an (Anbieter ohne echte Textstücke),
  den fertigen Text mit `consumeJsonlText(content, …)` **nachträglich** durch denselben Parser
  schicken → erst zuletzt wie bisher ein JSON-Dokument parsen. Live gemeldete Objekte dabei
  **nicht** doppelt verarbeiten (Replay nur, wenn live nichts ankam).
- Regel für die Streaming-Schicht: Ein Rückfall auf den normalen Aufruf muss den Callback
  **trotzdem** bedienen (siehe `chatCompletionStream`), sonst laufen JSONL-Sammler und
  Prosa-Vorschauen ins Leere.

### Export & Import sprechen dieselbe Form

Formate werden **paarweise** gepflegt: Wer `lib/epub.ts`, `lib/docx.ts`, `lib/markdown.ts` oder
`lib/pdf.ts` anfasst, prüft die Gegenrichtung mit (`lib/markdownImport.ts` liest Markdown und den
TXT-Export). Regeln dabei:

- Der Export bleibt die Referenz: Struktur (Überschriftsebenen, Trenner, Metazeilen) wird **nicht**
  beiläufig geändert, sonst bricht der Import still.
- Der Import muss **verlustfrei** zurücklesen: Titel, Untertitel, Genre, Tags, Synopsis, Kapitel
  und Wortzahlen. Das ist mit einem Round-Trip-Test zu belegen (`buildMarkdown` → `parse` →
  `buildImportedBook`), nicht per Augenmaß.
- Fremde Dateien sind der Normalfall: Was nicht erkannt wird (keine Überschriften, gemischte
  Ebenen), wird als **ein** Kapitel plus Hinweis aufgenommen — nie stillschweigend verworfen.

### Live-Vorschau & Fortschritt (Konventionen)
| Baustein | Datei | Wofür |
| --- | --- | --- |
| `StreamPreview` | `components/dashboard/StreamPreview.tsx` | Wachsender Text + Wortstand + Schritt-Info. `showWords={false}`/`render` für Nicht-Prosa (Storyboard-Titelliste) |
| `createJobStreamReporter` | `lib/jobs.ts` | Stream-Fortschritt **gedrosselt** in `Job.detail` (erstes Stück sofort, dann ≥ 300 ms; zählt Wörter über den ganzen Text, nicht je Token) |

Regeln: Die Vorschau ist **reine Anzeige** — geschrieben wird erst nach Abschluss (bzw. nach
Bestätigung im Vorschau-Dialog). Langläufe, die der Nutzer verlassen können soll, gehören als
**Job** ins Job-Center (Queue über alle Kapitel), kurzlebige Einzelläufe nicht.

**Review-Dialoge mit live wachsender Liste** (Weltenbau, Figuren, Timeline-Korrektur): Die Auswahl
des Nutzers muss das Wachstum überleben. Ein Effekt auf `[open, candidates]`, der die Auswahl neu
setzt, löscht sie bei jedem eintreffenden Vorschlag — deshalb nur auf `[open]` reagieren und
Vorauswahlen (z. B. „ähnlich zu Vorhandenem") je **neuem** Eintrag einmalig anwenden. Während
gesammelt wird: Übernehmen/Verwerfen/Escape sperren (`running`-Prop).

### Neue Pipeline-Stufe (Checkliste)

- [ ] `ModelStage` + Label + Key in `lib/generationSettings.ts`
- [ ] Server-Funktion in `src/server/story.ts`
- [ ] Route in `src/index.ts`
- [ ] Service in `src/services/story.ts`
- [ ] `WizardStep` (data/story.ts) + `STEPS` + Stage-Mapping im `BookWizard`
- [ ] Schritt-UI + Footer-Aktion + Save-Persistenz
- [ ] Feld-/Status-Anzeige im `BookDetailView` (Plates/Buttons)

### Neue Domäne (z. B. „Timeline")

- [ ] Typ + Seeds in `src/data/<domäne>.ts`
- [ ] Sammlung in `src/data/state.ts` (Whitelist) **und** Persistenz-Wrapper in
      `lib/persistence.ts` (`DataName` + `load*/save*`, `clearProfileData`)
- [ ] View in `components/dashboard/`
- [ ] Nav-Eintrag in `Sidebar.tsx` + Routing in `Dashboard.tsx`
- [ ] Optional: Auto-Import aus dem Storyboard

### UI

- Bestehende Primitives nutzen: `Panel`, `PanelHeader`, `ViewHeader`, `Badge`,
  `ProgressBar`, `Sparkline`, `EmptyState` (`components/dashboard/primitives.tsx`).
- Styling über Tailwind-Utilities + Brand-Tokens; **keine** Inline-Hexfarben wo Tokens existieren.
- Dialoge: Overlay + `glass-strong`, Escape schließt, Klick außerhalb schließt.
- Keine Platzhalter-Inhalte; reale Daten oder klarer Leerzustand.

### Persistenz

- Fachdaten laufen über `lib/persistence.ts` → `/api/state` → SQLite (`server/store.ts`,
  `<runtimeRoot>/data/authorai.db`). Neue Sammlungen in `src/data/state.ts` (Whitelist)
  **und** `lib/persistence.ts` (`DataName` + `load*/save*`) eintragen.
- **Nicht** direkt `localStorage` benutzen (außer in `lib/*`), und dort nur für **Profile**
  und **geräteweite Einstellungen** — Fachdaten gehören in die Datenbank.
- „leer vs. nie gesetzt"-Semantik beachten (siehe `data-model.md`).
- Objekt-Stores (z. B. `meta`) laufen über eigene `load*/save*`-Funktionen.

---

## Verifikation

Da im Repo statisch gearbeitet wird, ist ein Check Pflicht:

```bash
bun run check
```

`scripts/check.ts` prüft — ohne Dependencies, auch in CI:

1. **Syntax** — Bun-Transpiler über `src/` und `packages/promptgen/src`
2. **Imports** — relative, `@/*` und `@promptgen/*` müssen existieren
3. **Markdown-Links** — relative Ziele (inkl. Bilder) müssen existieren

Der Check läuft in CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml))
bei jedem Push und Pull Request.

### Echte Verifikation für kritische Pfade

Für Server-Logik mit externen APIs: **echter Test-Call** über ein temporäres Skript
in `src/` (teilt `tsconfig`-Aliase), danach wieder löschen.

Beispiel Cover:

```ts
import { loadRootEnv } from "@promptgen/server/env";
import { generateCover } from "./server/cover";
loadRootEnv();
console.log(await generateCover({ prompt: "professional book cover art, …" }));
```

Beispiel Streak (pure Logik):

```ts
import { computeStreak, todayIso, addDays } from "./lib/streak";
console.log(computeStreak([addDays(todayIso(), -1), todayIso()], todayIso()));
```

### Ohne API-Key testen: lokaler Stub-Provider

Streaming, Fortsetzungs-Schleifen und Fehlerpfade lassen sich **ohne Kosten und ohne echten Key**
prüfen: ein zweiter Bun-Server im Testskript antwortet OpenAI-kompatibel, und die App wird auf ihn
umgebogen (Env-Override, siehe [`configuration.md`](configuration.md)):

```bash
# App gegen den Stub starten (Startzeit variabel) — der Stub läuft im Testskript
$env:PORT='3099'; $env:AUTHORAI_PROVIDER='custom'
$env:AUTHORAI_BASE_URL='http://127.0.0.1:4599/v1'; $env:AUTHORAI_API_KEY='test-key'
bun run src/index.ts
```

```ts
// src/tmp-check.ts — Stub: SSE für Streaming-Routen, JSON für den Rest
const stub = Bun.serve({
  port: 4599,
  async fetch(req) {
    const body = await req.json() as { stream?: boolean };
    if (body.stream) {
      const enc = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "Text " } }] })}\n\n`));
            c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "length" }] })}\n\n`));
            c.enqueue(enc.encode("data: [DONE]\n\n"));
            c.close();
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    }
    return Response.json({ choices: [{ message: { content: "{}" }, finish_reason: "stop" }] });
  },
});
// … fetch gegen http://127.0.0.1:3099/api/… und die Events/Deltas prüfen …
stub.stop(true);
```

Zwei Dinge dabei beachten: **immer** über einen eigenen Port testen (`PORT`), damit der
Entwicklungsserver auf 3000 unberührt bleibt, und den Testserver danach beenden. So kamen die
Checks für Ausbau-Fortsetzungen, Storyboard-Batches und Timeline-Korrektur zustande — inklusive
Nachweis, dass Textstücke **wirklich** als `delta` ankommen.

### Export-Formate prüfen
EPUB und DOCX sind ZIP-Container — nach dem Erzeugen einmal mit einem ZIP-Reader öffnen
und die Struktur kontrollieren (z. B. PowerShell):

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead("test.epub")
$zip.Entries | ForEach-Object { "{0} ({1} bytes)" -f $_.FullName, $_.Length }
```

Zusätzlich gilt: **EPUB** muss `mimetype` als **ersten**, **unkomprimierten** Eintrag
enthalten (`CompressedLength -eq Length`), und `word/document.xml` beim **DOCX** muss sich
als XML parsen lassen.

---

## Debugging

- **Server-Logs:** das Terminal, in dem `bun run dev` läuft. In Dev werden zusätzlich
  Browser-Console-Meldungen gespiegelt (`development.console`).
- **HMR:** Änderungen an UI/CSS erscheinen sofort; Server-Module werden mit `--hot`
  neu geladen; State bleibt bei reinen UI-Updates erhalten.
- **API direkt testen:** `curl`/PowerShell `Invoke-RestMethod` gegen `localhost:3000/api/...`.

---

## Daten-Inspektion & Reset

Fachdaten liegen in der SQLite-Datei `<runtimeRoot>/data/authorai.db` (Tabelle `state`,
JSON je Profil + Sammlung); nur **Profile** und **geräteweite Einstellungen** stehen im
Browser (DevTools → Application → Local Storage).

| Aktion | Vorgehen |
| --- | --- |
| Fachdaten ansehen | `data/authorai.db` öffnen (z. B. DB-Browser/`bun:sqlite`) → `SELECT profile_id, collection, length(json) AS bytes FROM state` |
| Belegung prüfen | Einstellungen → Datenbank, oder `GET /api/store/info` |
| Profil zurücksetzen | Profil löschen (UI) oder `DELETE /api/state?profile=<id>` |
| Alles zurücksetzen | `data/authorai.db` (inkl. `-wal`/`-shm`) entfernen und neu laden |
| Cover aufräumen | `covers/` prüfen; verwaiste Dateien manuell entfernen |

---

## Release-Checkliste

- [ ] Syntax- und Import-Checks grün
- [ ] Kritische Pfade real getestet (mind. Cover + ein LLM-Pfad)
- [ ] `docs/changelog.md` ergänzt
- [ ] `README.md` / Doku bei Verhaltensänderungen aktualisiert
- [ ] Keine Secrets in Dateien, `covers/` und `.env` bleiben ignoriert
