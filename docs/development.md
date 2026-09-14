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

**Braucht die Antwort Fortschritt oder Textstücke?** Dann zusätzlich eine **SSE-Variante**:

- Server: `sseResponse(async (emit) => …)` + Handler-Callbacks (`onDelta`, `onPartStart`, …);
  der Nicht-Streaming-Aufruf bleibt **derselbe Code-Pfad** ohne Callback (siehe `expandChapter`).
- Route: eigener Handler `…/stream`, Validierung **vor** dem Stream (Fehler dort = HTTP 400).
- Service: `streamEvents("/api/…/stream", body, handler)` statt `postJson`; das Ergebnis kommt
  aus dem `done`-Ereignis (siehe `streamPass`, `streamStoryboard`).
- UI: `StreamPreview` für Text, `Job.detail` für Zähler (siehe unten).

**Faustregel:** Lange **Prosa** streamt `delta` (Rohentwurf, Ausbau, Kohärenz, Stil).
Kleine **JSON**-Antworten (Fakten-Check-Verdikt, Timeline-Befund, Timeline-Korrektur) bleiben
ein normaler Aufruf — ein Delta auf JSON wäre wertlos. Ein laufender Batch-Prozess (Storyboard)
meldet dagegen **Fortschritt** (`phase`/`titles`/`batch`), keinen Text.

### Live-Vorschau & Fortschritt (Konventionen)

| Baustein | Datei | Wofür |
| --- | --- | --- |
| `StreamPreview` | `components/dashboard/StreamPreview.tsx` | Wachsender Text + Wortstand + Schritt-Info. `showWords={false}`/`render` für Nicht-Prosa (Storyboard-Titelliste) |
| `createJobStreamReporter` | `lib/jobs.ts` | Stream-Fortschritt **gedrosselt** in `Job.detail` (erstes Stück sofort, dann ≥ 300 ms; zählt Wörter über den ganzen Text, nicht je Token) |

Regeln: Die Vorschau ist **reine Anzeige** — geschrieben wird erst nach Abschluss (bzw. nach
Bestätigung im Vorschau-Dialog). Langläufe, die der Nutzer verlassen können soll, gehören als
**Job** ins Job-Center (Queue über alle Kapitel), kurzlebige Einzelläufe nicht.

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
