# AGENTS.md

Kurzanleitung für KI-Agenten, die in diesem Repository arbeiten.
Ausführliche Doku: [`docs/`](docs/README.md) — insbesondere
[`development.md`](docs/development.md) (Konventionen & Verifikation) und
[`architecture.md`](docs/architecture.md) (Schichten).

**Repository:** <https://github.com/KT-Society/AuthorAI>
**Entwickler:** KT-Society & Echo · **Lizenz:** MIT (siehe [`LICENSE`](LICENSE))

---

## Commands

```bash
bun install                  # Root + alle Workspaces (immer im Repo-Root!)
bun run dev                  # Root-App :3000 + promptgen :3001 (HMR)
bun run build                # Root + Workspaces nach dist/
bun run start                # Produktions-Builds servieren

bun run dev:root             # nur Root-App
bun run --cwd packages/promptgen dev   # nur promptgen
ALL_DRY=1 bun run scripts/all.ts dev   # Tasks nur auflisten
bun run check                # Syntax-, Import- und Markdown-Link-Checks
bun run version:bump <x.y.z> # App-Version an allen Stellen setzen (--dry-run zum Prüfen)
```

Ports: Root **3000**, promptgen **3001** (`PORT` überschreibbar).

---

## Aufbau

- **Root-App (AuthorAI)**: Bun + React 19 + Tailwind v4 + shadcn/Radix + lucide.
  Server in `src/index.ts` (`Bun.serve`), Bundling über `build.ts` (`Bun.build`).
- **`packages/promptgen`**: eigenes Paket (React 18 + MUI v5), eigener Server auf 3001.
  Die **Engine** (Environment, Config, Soul-Synthese) wird von der Root-App über den
  TS-Alias **`@promptgen/*`** genutzt.
- **Task-Runner**: `scripts/all.ts` führt `dev`/`build`/`start` für Root **und** Workspaces aus.
- **Server-Speicher**: Alle Fachdaten liegen in **SQLite** (`bun:sqlite`) unter
  `<runtimeRoot>/data/authorai.db` (gitignored) — kein `localStorage`-Limit mehr. Die App lädt
  sie beim Start einmal (`hydrateState`) und arbeitet im Speicher; geschrieben wird gebündelt
  über `/api/state`. Nur **Profile** und **geräteweite Einstellungen** (Modelle, Sprache,
  Stil-Profil) bleiben im `localStorage`.

```
src/
├── index.ts        Bun.serve: API-Routen + SPA
├── App.tsx         Profil-Gate + Dashboard
├── data/           Typen + Seeds (books, characters, world, plot, research, story)
├── lib/            Persistenz, Profile, Streak, Cover-Lifecycle, Settings, Notifications
├── server/         SERVER-ONLY: llm, story, cover, research
├── services/       Client-Wrapper für /api/*
└── components/     dashboard/ (Views & Dialoge), ui/ (shadcn-Basis)
```

---

## Harte Regeln

1. **Server-only-Grenze:** `src/server/*` **niemals** aus Client-Code importieren.
   `src/services/*` ruft **ausschließlich** lokale `/api/*`-Routen auf.
2. **Secrets:** nur serverseitig halten. Standard: Keys aus der Root-`.env`. Ein in den
   Einstellungen eingegebener Anbieter-Key wird **einmalig** an den lokalen Server geschickt und
   liegt dort in der Tabelle `provider` (nicht in `state`); er wird **nie** an den Client
   zurückgegeben, nie geloggt und nie in Fehlermeldungen aufgenommen.
3. **Persistenz:** Fachdaten gehören in die **SQLite-Datenbank** (`<runtimeRoot>/data/authorai.db`,
   Zugriff **nur** über `src/server/store.ts` + `/api/state`). Der Client liest synchron aus dem
   Cache in `src/lib/persistence.ts`; `localStorage` ist **nur** für Profile, geräteweite
   Einstellungen (Modelle, Sprache, Stil-Profil) und die Migrations-Flags erlaubt.
   - Sammlungsnamen stehen in `src/data/state.ts` (Whitelist für Client **und** Server).
   - **fehlende** Sammlung = frisches Profil → Seeds greifen
   - **`[]`** = bewusst geleert → Beispiele kommen nicht zurück
   - Alte `localStorage`-Daten werden beim ersten Start **automatisch übernommen**
     (`hydrateState` → `migrateFromLocalStorage`), solange die Datenbank leer ist.
4. **Modelle pro Stufe:** `authorai.model` (Standard) +
   `authorai.model.{storyboard|draft|expand|consistency|style}`. Freie OpenRouter-ID,
   kein Dropdown, kein Default — leer = erbt Standard.
5. **Sprache:** `authorai.language`. Jeder LLM-Prompt braucht den **Language-Lock**
   (System **und** User, mit Hinweis „nicht in späteren Abschnitten wechseln").
6. **Kein hardcodiertes Model** im Code (auch nicht als Beispiel-Placeholder).
7. **Covers:** serverseitig erzeugt (`covers/`, gitignored) und über `/covers/:file`
   ausgeliefert. Löschen nur **reference-counted** (`lib/coverStore.ts`); Seed-Cover sind
   geschützt.
8. **UI:** Primitives nutzen (`components/dashboard/primitives.tsx`), Design-Tokens statt
   Inline-Hexfarben, keine Platzhalter-Inhalte, klare Leerzustände.
9. **Doku-Pflicht:** Jede Änderung zieht die betroffenen Dokumente nach — siehe
   [Dokumentations-Update](#dokumentations-update). Besonders gilt: **Die Roadmap beschreibt
   nur Zukunft.** Wird ein Roadmap-Thema geliefert, wandert es ins Changelog und
   **verschwindet aus der Roadmap** — dabei mindestens eine **Anschluss-Idee** ergänzen.

---

## Pipeline (Kurzfassung)

`Idee → Storyboard → Rohentwurf (~500 W) → Ausbau (3–5k W) → Kohärenz → Stil`

| Stufe | Route |
| --- | --- |
| Storyboard | `POST /api/storyboard` · Stream (Fortschritt): `POST /api/storyboard/stream` · Ableitung aus Manuskript (Stream, gechunkt): `POST /api/storyboard/derive/stream` |
| Rohentwurf | `POST /api/chapter/draft` · Stream: `POST /api/chapter/draft/stream` |
| Ausbau | `POST /api/chapter/expand` · Stream: `POST /api/chapter/expand/stream` |
| Szenen ableiten | `POST /api/chapter/scenes/stream` (Beats + Zeit/Schauplatz/POV, gechunkt/gestreamt) |
| Kohärenz | `POST /api/chapter/consistency` · Stream: `POST /api/chapter/consistency/stream` |
| Stil | `POST /api/chapter/style` · Stream: `POST /api/chapter/style/stream` |
| Timeline-Prüfung | `POST /api/timeline/check` · Stream: `POST /api/timeline/check/stream` · Quick Fix: `POST /api/timeline/repair` · Stream: `POST /api/timeline/repair/stream` |
| Weltenbau-Extraktion | `POST /api/world/extract` · Stream: `POST /api/world/extract/stream` |
| Figuren-Extraktion (Manuskript) | `POST /api/characters/extract` · Stream: `POST /api/characters/extract/stream` |
| Kontinuität: Extraktion | `POST /api/continuity/extract/stream` (Kapitel für Kapitel, belegt, fortsetzbar) |
| Kontinuität: Fakten-Check | `POST /api/continuity/check` · Queue/Stream: `POST /api/continuity/check/stream` |
| Kontinuität: Quick Fix | `POST /api/continuity/repair` · Queue/Stream: `POST /api/continuity/repair/stream` |
| Soul-Synthese | `POST /api/generate` |
| Recherche | `POST /api/research` |
| Cover | `POST /api/cover`, `POST /api/cover/save`, `DELETE /api/cover/:file` |
| Speicher | `GET\|PUT\|DELETE /api/state`, `GET /api/store/info` |
| LLM-Anbieter | `GET\|PUT /api/provider` · Test: `POST /api/provider/test` |

Beim Speichern eines Buchs leitet die Shell **automatisch** Charaktere, Weltenbau und
Plot-Karten aus dem Storyboard ab (dedupliziert). Details: [`docs/pipeline.md`](docs/pipeline.md).

### Neue Pipeline-Stufe (Checkliste)

1. `ModelStage` + Label + Key in `lib/generationSettings.ts`
2. Server-Funktion in `src/server/story.ts`
3. Route in `src/index.ts` (Validierung + `errorResponse`) — **plus** `…/stream`-Variante,
   wenn die Stufe Prosa liefert oder lange läuft (siehe `docs/development.md`)
4. Service in `src/services/story.ts` (`postJson`; streaming: `streamEvents`)
5. `WizardStep` + `STEPS` + Stage-Mapping + Schritt-UI im `BookWizard`
6. Anzeige im `BookDetailView` (Plates/Buttons), Persistenz der Flags

---

## Dokumentations-Update

Doku ist Teil der Lieferung, nicht Nacharbeit. **Vor jedem „fertig"** prüfen, was die
Änderung berührt, und alle zutreffenden Stellen nachziehen:

| Änderung | Muss aktualisiert werden |
| --- | --- |
| Nutzbares Verhalten (Feature, Fix, UI, Prompt) | **`docs/changelog.md`** — unter `[Unreleased]`, Abschnitt `### Added` / `### Changed` / `### Fixed`, deutsch, Ursache + Wirkung |
| **Roadmap-Thema geliefert** | Es aus **`docs/roadmap.md`** **entfernen** (die Roadmap ist kein Release-Archiv) **und** mindestens eine **Anschluss-Idee** ergänzen |
| Neue/geänderte HTTP-Route | `docs/api.md` (Request/Response, Fehlerfälle) **+** Pipeline-Tabelle in `AGENTS.md` |
| Neue/geänderte Typen, Persistenz-Keys, Backup-Felder | `docs/data-model.md` |
| Pipeline-Verhalten, Prompts, Chunking, Kanon | `docs/pipeline.md` |
| Neue Module, Views, Dialoge, Schichten | `docs/architecture.md` (Modul-/View-Tabellen) |
| Env-Variablen, Settings-Keys, Modelle | `docs/configuration.md` |
| Filtern/Suchen/Sortieren, neue Einstellungen | `docs/development.md` bzw. die betroffene Feature-Doku |
| **Version** | `bun run version:bump <x.y.z>` — schreibt `package.json`, promptgen, beide Installer, README, `docs/README.md`, `SECURITY.md` und den Changelog-Abschnitt |
| Release, Signierung, Installer | `docs/release.md` |
| Commands, Checklisten, harte Regeln | **diese Datei** (`AGENTS.md`) |

**Faustregeln**

- **Changelog ist Historie, Roadmap ist Zukunft.** Nie dasselbe in beiden. Geliefertes steht
  ausschließlich im Changelog.
- **Kein leerer Release:** erst Inhalte unter `[Unreleased]` sammeln, dann bumpen.
- **Links prüfen:** `bun run check` validiert relative Markdown-Links mit — ein umbenanntes
  Dokument ohne Link-Fix fällt dort auf.
- **Nicht anfassen:** `META_VERSION` (`data/author.ts`) und `BACKUP_VERSION` (`lib/backup.ts`)
  sind Datenformat-Versionen, keine App-Versionen.
- **Pläne:** `.echo/plans/new_*` → nach Abschluss auf `done_*` umbenennen.

---

## Verifikation

Vor jedem „fertig":

1. **`bun run check`** — Syntax (Bun-Transpiler) über `src/` **und**
   `packages/promptgen/src`, Import-Auflösung und Markdown-Links. Muss grün sein.
2. **Kritische Pfade real testen** (temporäres Skript in `src/`, danach löschen):
   Cover-Erzeugung, ein LLM-Pfad, pure Logik (z. B. `computeStreak`).
3. **Markdown-Links** prüft der Check automatisch mit.

**Zero-Warning-Haltung:** Warnungen (Typen, Lint, Build) sind Mängel und werden an der
Wurzel behoben. **Bestehende** Testfehler werden nicht eigenmächtig angefasst — vorher fragen.

---

## Arbeitsweise in diesem Repo

- **Der Operator führt aus:** `bun install`, Builds, Datenbank-/Cover-Backups,
  Git-Commits und Pushes.
- **Der Agent schreibt:** Code, Fixes, Pläne, Implementierungen — und verifiziert statisch.
- Neue Pläne unter `.echo/plans/` beginnen mit `new_`; nach Abschluss auf `done_` umbenennen.
- **Doku aktuell halten** — welche Datei bei welcher Änderung nachgezogen wird, steht in
  [Dokumentations-Update](#dokumentations-update).

---

## Wo steht was

| Thema | Datei |
| --- | --- |
| Einstieg & Navigation | [`docs/README.md`](docs/README.md) |
| Architektur & Grenzen | [`docs/architecture.md`](docs/architecture.md) |
| Pipeline im Detail | [`docs/pipeline.md`](docs/pipeline.md) |
| Typen & Persistenz-Keys | [`docs/data-model.md`](docs/data-model.md) |
| HTTP-API | [`docs/api.md`](docs/api.md) |
| Env, Modelle, Profile | [`docs/configuration.md`](docs/configuration.md) |
| Konventionen & Verifikation | [`docs/development.md`](docs/development.md) |
| Release, Signierung, Installer | [`docs/release.md`](docs/release.md) |
| Fehlerbehebung | [`docs/troubleshooting.md`](docs/troubleshooting.md) |
| Historie & Planung | [`docs/changelog.md`](docs/changelog.md), [`docs/roadmap.md`](docs/roadmap.md) |
| Beitragen | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Verhaltenskodex / Sicherheit | [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md), [`SECURITY.md`](SECURITY.md) |
| Paket-Anleitung promptgen | [`packages/promptgen/AGENTS.md`](packages/promptgen/AGENTS.md) |

