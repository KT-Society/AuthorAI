# Changelog

Alle nennenswerten Änderungen an AuthorAI.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/), Versionierung nach
[Semantic Versioning](https://semver.org/lang/de/).

---

## [Unreleased]

_Nichts offen — nächste Themen siehe [`roadmap.md`](roadmap.md)._

---

## [0.1.0] — 2026-09-11

Erster vollständiger Stand: von der Buchidee bis zum geprüften Manuskript, inklusive
Charakteren, Welt, Plot, Recherche, Covern, Profilen und Statistiken.

### Monorepo & Tooling

- **Added** Bun-Workspaces (`packages/*`) — ein `bun install` versorgt Root und Pakete.
- **Added** Workspace-Task-Runner `scripts/all.ts` für `dev`/`build`/`start`
  (Root + alle Workspaces, Dry-Run via `ALL_DRY=1`).
- **Changed** promptgen von Vite/npm auf **Bun-native** umgestellt
  (`bun --hot`, `Bun.build`, `bun-plugin-tailwind`, `bunfig.toml`).
- **Added** Port-Trennung: Root **3000**, promptgen **3001** (`PORT` überschreibbar).
- **Added** TS-Alias `@promptgen/*` → Engine server-only, ohne Cross-Package-Install.

### Root-App (AuthorAI)

- **Added** Dashboard als Einstiegs-UI: KPIs, „Aktuelles Projekt", Bibliothek, Tagesziel,
  Aktivität, Plot-Funken.
- **Added** Navigation & Views: **Bibliothek**, **Kapitel**, **Charaktere**, **Weltenbau**,
  **Plot-Board**, **Recherche**, **Statistiken**.
- **Added** Design-System: Tailwind v4 `@theme`-Tokens (Brand-HSL-Palette), Glassmorphism,
  Aurora-Hintergrund, Outfit/Inter/JetBrains Mono, Micro-Animationen.
- **Added** `ViewHeader`, `Panel`, `Badge`, `ProgressBar`, `Sparkline`, `EmptyState` als Primitives.

### Buch-Pipeline (6 Stufen)

- **Added** **Storyboard** — zweiphasig (Outline mit **exakt N** Kapiteltiteln + Batch-Details),
  Language-Lock, Drei-Akt-/Closure-Regeln, `world`-Sektion.
- **Added** **Rohentwurf** (~500 Wörter) je Kapitel.
- **Added** **Ausbau** (3.000–5.000 Wörter) mit Craft-Regeln, Continuation-Loop,
  Heading-Cleanup.
- **Added** **Kohärenz-Pass** (Logik/Kontinuität, Nachbarkapitel-Kontext) mit Prüfbericht.
- **Added** **Stil-Pass** (Satzbau/Sprache) mit Prüfbericht.
- **Added** Schutzmechanismen der Pässe: Leer-/Kürzungs-Fehler, „unverändert"-Warnung,
  robuster `<TEXT>/<NOTES>`-Parser.
- **Added** **Model pro Stufe** (Storyboard, Rohentwurf, Ausbau, Kohärenz, Stil) — freie
  OpenRouter-ID, kein Dropdown, kein Default.
- **Added** **Book-Wizard** mit Zwischenspeichern, Schutz gegen ungespeichertes Schließen,
  Cover-Vorschau und Auto-Cover.

### Buch-Editor & Reader

- **Added** **BookDetailView** mit Kapitel-Liste, Editor, Reader-Modus (Serif-Typografie, Drucken).
- **Added** Kapitel **hinzufügen / verschieben / löschen** (Storyboard + Manuskript synchron, Re-Index).
- **Added** **Ziel-Wörter pro Kapitel** (fließt in Ausbau und Fortschritt).
- **Added** **Charaktere an Kapitel und einzelne Beats** hängen.
- **Added** Queues: **Alles ausbauen**, **Alle Kohärenz**, **Alle Stil** — mit Fortschritt
  und Persistenz nach jedem Kapitel.
- **Added** Status-**Plates** pro Kapitel (Ausgebaut / Kohärenz / Stil) und Prüfberichte.
- **Added** Manuskript kopieren & als `.txt` exportieren.

### Charaktere, Welt, Plot, Recherche

- **Added** **Charakter-Generator** (promptgen-Engine: Tavily + OpenRouter) und
  **Charakter-Editor** mit **Soul-Scan** über die 12 Soul-Sektionen.
- **Added** **Weltenbau** mit Kategorien Ort/Fraktion/Magie/Artefakt/Lore und
  **Extraktion aus dem Storyboard** (`/api/world/extract`).
- **Added** **Plot-Board** (Akte, Status, Board-Spalten) inkl. Ableitung aus Kapiteln.
- **Added** **Recherche** mit Notizen und echter **Tavily-Suche** (`/api/research`).
- **Added** **Auto-Import aus dem Storyboard**: Charaktere, Welt, Plot — dedupliziert,
  beim Buch-Anlegen und einmalig für bestehende Bücher.

### Covers

- **Added** serverseitige Cover-Erzeugung via **Pollinations**
  (`black-forest-labs/flux.1-schnell`), Ablage in `covers/`, Auslieferung über `/covers/:file`.
- **Added** **Cover-Text-Editor** (Canvas-Bake) für Titel/Autor: Schrift, Größe, Farbe,
  Ausrichtung, Laufweite, Großbuchstaben, Kursiv, Schatten, freies Positionieren per Drag.
- **Added** **Reference-Counted Löschen** von Covern (Seed-Cover geschützt, geteilte Dateien bleiben).

### Profile, Metriken, Benachrichtigungen

- **Added** **lokale Profile** mit gescopten Daten (`authorai.<profil>.<sammlung>`) und
  „leer vs. nie gesetzt"-Semantik; Legacy-Migration in Profil „Autor".
- **Added** **echter Schreib-Streak** (`writingDays`, Wochenwerte, Tages-Reset, Bestwert)
  inkl. Migration bestehender Metriken.
- **Added** **Notifications** mit Glocke, Ungelesen-Zähler, Panel, Aktionen und
  Auto-Events (neues Buch/Charakter/Welt/Plot/Notiz).
- **Added** **Statistiken**: Wörter, Kapitel, aktive Tage, Wörter pro Buch, Wochen-Balken,
  Status-/Plot-Verteilungen.

### Fixed

- Storyboard liefert jetzt **exakt** die gewünschte Kapitelzahl (vorher Abbruch durch Output-Limit).
- Sprachdrift in späten Kapiteln und Soul-Sektionen behoben (Language-Lock in allen Prompts).
- `<TEXT>`-Marker leckten in den Kapiteltext (robuster Parser + Prosa-Bereinigung).
- „Geprüft"-Status hing an Notizen → jetzt eigene Flags; Queues wiederholen nichts.
- Ausbau erreicht die Ziel-Länge (Continuation-Loop).
- Wochen-Balken unsichtbar (Prozent-Höhe ohne festen Parent).
- `loadRootEnv` zeigte auf `packages/.env` statt auf das Repo-Root (Eltern-Suche statt fixer Pfad).

---

## [0.0.0] — 2026-09-11

- **Added** Repository-Initialisierung (`bun init`), Bun-React-Template als Basis.
