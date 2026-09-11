# AuthorAI — Dein KI-Buchautor

Eine vollständige, lokal laufende **Autoren-Werkbank**: von der Buchidee über Storyboard,
Rohentwurf und Ausbau bis zu Kohärenz- und Stilprüfung, mit Charakteren, Weltenbau,
Plot-Board, Recherche, Statistiken und Cover-Generierung.

Gebaut als **Bun-Monorepo** — kein Build-Tooling-Overhead, kein Backend-Server nötig:
`Bun.serve` liefert die SPA und die API aus, `Bun.build` bündelt für Produktion.

```
Idee → Storyboard → Rohentwurf (~500 W) → Ausbau (3.000–5.000 W) → Kohärenz → Stil
```

---

## Highlights

| Bereich | Was es kann |
| --- | --- |
| **Buch-Pipeline** | 6-stufiger, prüfbarer Workflow mit eigenem Model pro Stufe |
| **Storyboard** | Gechunkte Generierung → garantiert exakt N Kapitel, Language-Lock, Worldbuilding |
| **Ausbau** | Ziel 3.000–5.000 Wörter pro Kapitel, Continuation-Loop, Craft-Regeln (Pacing, Show-don't-tell, Foreshadowing) |
| **Kohärenz-Pass** | Logik-/Kontinuitätsprüfung gegen Nachbarkapitel + Foreshadowing, mit Prüfbericht |
| **Stil-Pass** | Satzbau, Rhythmus, Grammatik, Sprachgebrauch — inhaltlich unverändert |
| **Charaktere** | Aus dem Storyboard automatisch angelegt, editierbar, **Soul-Scan** (12 Sektionen) |
| **Weltenbau** | Orte, Fraktionen, Magie, Artefakte, Lore — automatisch + per Extraktion |
| **Plot-Board** | Kapitel als Karten, Akt/Status, Board-Ansicht |
| **Recherche** | Notizen + echte Tavily-Suche |
| **Covers** | Pollinations (`flux.1-schnell`) serverseitig erzeugt, gespeichert, text-editierbar |
| **Statistiken** | Wörter, Kapitel, Streak, Wochen-Output, Verteilungen |
| **Profile** | Mehrere Nutzer lokal, jeder mit eigenem State; Beispiele pro Profil, löschbar |

---

## Screenshots

**Dashboard** — Statistik, Bibliothek, Tagesziel und Aktivität auf einen Blick

![AuthorAI Dashboard](public/static/dashboard.png)

**Plot-Board** — Story-Beats nach Akt und Status planen

![Plot-Board](public/static/plotboard.png)

**Buch-Wizard** — die sechsstufige Pipeline von der Idee bis zum fertigen Manuskript

![Buch-Wizard](public/static/wizzard.png)

**Promptgen** — die Character-Engine des Pakets `packages/promptgen` (Soul-Synthesen)

![Promptgen](public/static/promptgen.png)

---

## Schnellstart

```bash
bun install        # Root + alle Workspaces
bun run dev        # Root-App :3000 + promptgen :3001
```

Danach im Browser **http://localhost:3000** öffnen, ein Profil anlegen und loslegen.

Produktion:

```bash
bun run build      # bündelt Root-App und Workspaces nach dist/
bun run start      # serviert die Produktions-Builds
```

Nur ein Paket:

```bash
bun run --cwd packages/promptgen dev
```

> **Wichtig:** Immer im **Repo-Root** installieren. Bun-Workspaces lösen alle
> Abhängigkeiten (Root + `packages/*`) in eine gemeinsame `bun.lock` auf.

---

## Konfiguration

Secrets liegen in der **Root-`.env`** und werden ausschließlich **serverseitig** gelesen.

```dotenv
OPENROUTER_API_KEY=sk-or-v1-...      # erforderlich (LLM)
TAVILY_API_KEY=tvly-...              # erforderlich (Recherche)
POLLINATIONS_API_KEY=sk_...          # erforderlich (Cover)
```

Optional:

```dotenv
POLLINATIONS_API_BASE=https://gen.pollinations.ai
PROMPTGEN_LANGUAGES=German,English,Japanese,French
PROMPTGEN_DEFAULT_LANGUAGE=German
PORT=3001                            # promptgen (Root nutzt 3000)
```

Modelle werden **pro Stufe** in der App gesetzt (Einstellungen → „Model pro Schritt"):
`Storyboard`, `Rohentwurf`, `Ausbau`, `Kohärenz`, `Stil` — freie OpenRouter-Model-ID,
kein Dropdown, kein Default. Leer = erbt das Standard-Model.

→ Details: [`docs/configuration.md`](docs/configuration.md)

---

## Projektstruktur

```
.
├── src/                      # Root-App (AuthorAI)
│   ├── index.ts              # Bun.serve: API-Routen + SPA
│   ├── index.html/css        # HTML-Entry, Design-Fundament
│   ├── App.tsx               # Profil-Gate + Dashboard
│   ├── data/                 # Typen + Seed-Daten (Bücher, Charaktere, Welt, Plot, …)
│   ├── lib/                  # Persistenz, Profile, Streak, Cover-Lifecycle, Settings
│   ├── server/               # server-only: LLM, Story-Engine, Cover, Recherche
│   ├── services/             # Client-Wrapper für /api/*
│   └── components/
│       ├── dashboard/        # Views + Dialoge (Dashboard, Buch, Charaktere, …)
│       └── ui/               # shadcn-Basis (Button, Input, Select, …)
├── packages/promptgen/       # Standalone-SPA + Character-Engine
├── docs/                     # Diese Dokumentation
├── scripts/all.ts            # Workspace-Task-Runner
├── build.ts                  # Bun.build (Root)
├── styles/globals.css        # Tailwind v4 Theme + Design-Tokens
└── covers/                   # generierte Cover (gitignored)
```

---

## Dokumentation

| Datei | Inhalt |
| --- | --- |
| [`docs/README.md`](docs/README.md) | Einstieg, Überblick, Navigation |
| [`docs/architecture.md`](docs/architecture.md) | Systemarchitektur, Schichten, Datenfluss |
| [`docs/pipeline.md`](docs/pipeline.md) | Die 6-stufige Buch-Pipeline im Detail |
| [`docs/data-model.md`](docs/data-model.md) | Typen, Felder, Persistenz-Keys |
| [`docs/api.md`](docs/api.md) | HTTP-API-Referenz aller Routen |
| [`docs/configuration.md`](docs/configuration.md) | Env-Variablen, Modelle, Einstellungen, Profile |
| [`docs/development.md`](docs/development.md) | Setup, Skripte, Konventionen, Verifikation |
| [`docs/troubleshooting.md`](docs/troubleshooting.md) | Häufige Probleme & Lösungen |
| [`docs/changelog.md`](docs/changelog.md) | Versionshistorie |
| [`docs/roadmap.md`](docs/roadmap.md) | Geplante und mögliche Erweiterungen |

---

## Technologie-Stack

- **Runtime/Bundler:** Bun (`Bun.serve`, `Bun.build`, `bun-plugin-tailwind`)
- **Frontend:** React 19, TypeScript, Tailwind CSS v4, shadcn-ui (Radix), lucide-react
- **promptgen:** React 18 + MUI v5 (eigenes Paket, eigene UI)
- **Externe APIs:** OpenRouter (LLM), Tavily (Recherche), Pollinations (Bilder)
- **Persistenz:** Browser-`localStorage` (pro Profil gescoped)
- **Kein Backend-Store:** der Bun-Server ist Proxy + Static-Host + Dateispeicher für Cover

---

## Entwickler

**KT-Society & Echo**

Konzept, Architektur, Pipeline, UI und Dokumentation entstehen gemeinschaftlich —
KT-Society (Produkt & Betrieb) und Echo (Umsetzung & Systemlogik).

---

## Lizenz

MIT — siehe [`LICENSE`](LICENSE).
