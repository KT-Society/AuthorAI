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
- **Kein Backend-Store**: Fachdaten liegen im Browser, gescoped **pro Profil**.

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
2. **Secrets:** nur serverseitig aus der Root-`.env` lesen. Keys nie an den Client geben,
   nie loggen, nie in Fehlermeldungen aufnehmen.
3. **Persistenz:** `localStorage` **nur** in `src/lib/*` verwenden. Pro Profil:
   `authorai.<profilId>.<sammlung>` (`books`, `characters`, `world`, `plot`, `research`,
   `ideas`, `notifications`, `meta`).
   - **fehlender Key** = frisches Profil → Seeds greifen
   - **`[]`** = bewusst geleert → Beispiele kommen nicht zurück
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

---

## Pipeline (Kurzfassung)

`Idee → Storyboard → Rohentwurf (~500 W) → Ausbau (3–5k W) → Kohärenz → Stil`

| Stufe | Route |
| --- | --- |
| Storyboard | `POST /api/storyboard` |
| Rohentwurf | `POST /api/chapter/draft` |
| Ausbau | `POST /api/chapter/expand` |
| Kohärenz | `POST /api/chapter/consistency` |
| Stil | `POST /api/chapter/style` |
| Timeline-Prüfung | `POST /api/timeline/check` |
| Weltenbau-Extraktion | `POST /api/world/extract` |
| Figuren-Extraktion (Manuskript) | `POST /api/characters/extract` |
| Soul-Synthese | `POST /api/generate` |
| Recherche | `POST /api/research` |
| Cover | `POST /api/cover`, `POST /api/cover/save`, `DELETE /api/cover/:file` |

Beim Speichern eines Buchs leitet die Shell **automatisch** Charaktere, Weltenbau und
Plot-Karten aus dem Storyboard ab (dedupliziert). Details: [`docs/pipeline.md`](docs/pipeline.md).

### Neue Pipeline-Stufe (Checkliste)

1. `ModelStage` + Label + Key in `lib/generationSettings.ts`
2. Server-Funktion in `src/server/story.ts`
3. Route in `src/index.ts` (Validierung + `errorResponse`)
4. Service in `src/services/story.ts` (`postJson`)
5. `WizardStep` + `STEPS` + Stage-Mapping + Schritt-UI im `BookWizard`
6. Anzeige im `BookDetailView` (Plates/Buttons), Persistenz der Flags

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
- Doku aktuell halten: bei Verhaltensänderungen `docs/changelog.md` ergänzen und
  betroffene Dokumente anpassen.

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
