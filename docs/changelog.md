# Changelog

Alle nennenswerten Änderungen an AuthorAI.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/), Versionierung nach
[Semantic Versioning](https://semver.org/lang/de/).

---

## [Unreleased]

### Added

- **Toast-System**: globale, dezente Rückmeldungen (unten mittig, nicht im Druck) für
  Kopier- und Export-Aktionen — `src/lib/toast.ts` + `components/dashboard/ToastHost.tsx`.
- **Zwischenablage mit Fallback** (`src/lib/clipboard.ts`): versucht
  `navigator.clipboard`, fällt auf `textarea`/`execCommand` zurück und meldet echtes
  Erfolg/Fehlschlag statt still zu scheitern.
- **Prosa-Extraktion** (`src/lib/prose.ts`) für Server und Client: extrahiert `<TEXT>`-Blöcke
  robust und erkennt mitten im Satz abgebrochene Texte.
- **Pollinations-Status**: Die Einstellungen zeigen jetzt auch den Cover-Key an
  (`Pollinations: verbunden/fehlt`) — `GET /api/config` liefert dafür `pollinations`.
- **Figuren aus dem Manuskript** (`POST /api/characters/extract`): Die Charaktere-Ansicht
  leitet benannte Figuren direkt aus den Kapiteltexten ab — so landen auch Figuren im
  Register, die erst beim Schreiben auftauchen (z. B. „Kael") und im Storyboard nie standen.
  Vorschläge werden vor der Übernahme in einem Review-Dialog einzeln an-/abgewählt; bereits
  getrackte Namen filtert der Server heraus (Tag „Manuskript", verknüpft mit dem Projekt).

### Changed

- **Kapiteltext-Editor ist jetzt zuklappbar**: Der ausführliche Kapiteltext steckt in einem
  `<details>`-Bereich wie Rohentwurf/Versionen — Wortzahl und Speicherstatus bleiben in der
  Kopfzeile sichtbar, auch wenn er zugeklappt ist. Standard: aufgeklappt.

### Fixed

- **Performance: PDF-Export und Dublettenprüfung** (DevTools `'click' handler took N ms`):
  - `lib/pdf.ts`: Der Zeilenumbruch maß für **jedes** Wort den kompletten Kandidaten neu
    (O(n²)) und `charWidth` suchte pro Zeichen in zwei Strings. Jetzt läuft die Breite
    inkrementell über eine `Uint8Array`-Lookup-Tabelle. Gemessen an einem Buch mit
    55 Kapiteln × 3.257 Wörtern (~1 MB Prosa): **484 ms → 91 ms**; bei 12 Kapiteln
    (~240 KB): **113 ms → 22 ms**. Ergebnis identisch (Round-Trip-Test: Text, Umlaute,
    Anführungszeichen, Seitenstruktur).
  - `lib/worldMatch.ts`: Titel wurden in der O(n²)-Dublettenprüfung hundertfach neu
    normalisiert (Regex + `NFD`). Jetzt mit gebundenem Normalisierungs-Cache:
    **43 ms → 15 ms** bei 200 Einträgen. Verhalten unverändert.
- **Stil-/Kohärenz-Berichte mit No-Op-Notizen**: Kleine Modelle notierten „Änderungen", bei
  denen beide Seiten identisch waren (z. B. `"ein Schlund … schien" wurde zu "ein Schlund …
  schien" zur Verbesserung des Satzflusses`). Solche Zeilen dokumentieren nichts und
  verstopfen den Prüfbericht. `lib/passNotes.ts` erkennt sie (Vorher/Nachher-Zitat plus
  Änderungs-Marker, Vergleich ohne Satzzeichen/Leerraum) und entfernt sie; echte Notizen
  bleiben. Die Prompts fordern zusätzlich ausdrücklich: nur Zitate, deren Wortlaut sich
  wirklich geändert hat, sonst exakt „Keine Auffälligkeiten.".
- **Kohärenz/Stil bei langen Kapiteln (502 „Antwort unvollständig")**: Beide Pässe verlangten
  die **komplette** überarbeitete Prosa in *einer* Antwort. Bei 3.000–5.000 Wörtern lief das
  ins Ausgabelimit (9000 Tokens angefragt, Modell stoppt früher) → Abbruch mitten im Kapitel.
  Jetzt zerlegt `splitIntoChunks()` das Kapitel an Absatzgrenzen in Teile von ~1.000 Wörtern
  (max. 1.400, überlange Absätze an Satzgrenzen), jeder Teil wird einzeln umgeschrieben —
  Nachbarteile nur als Kontext-Anker — und wieder zusammengesetzt. Ausgabelimit pro Teil
  4.000 Tokens. Gibt ein Modell den falschen Abschnitt zurück, wird einmal nachgefasst, danach
  mit klarer Meldung abgebrochen (statt Text zu duplizieren). `<NOTES>` aller Teile werden
  gesammelt und dedupliziert. Betrifft `POST /api/chapter/consistency` **und**
  `POST /api/chapter/style`.
- **Server-Idle-Timeout** auf 180 s erhöht — mehrteilige Pässe, Ausbau und Cover-Varianten
  laufen nicht mehr Gefahr, mitten im Lauf getrennt zu werden.
- **Dubletten beim Welten-Scan**: Wiederholte Scans legten denselben Stoff immer wieder an
  („Kinder der Asche" mehrfach, „Die Zerstörung der Welt" neben „Die Zerstörung der alten
  Welt"). Drei Ebenen greifen jetzt:
  - Der Scan schickt die bereits getrackten Einträge mit (`knownEntries`); Prompt und Server
    liefern bzw. behalten sie nicht erneut (auch nicht in anderer Kategorie).
  - `lib/worldMatch.ts` vergleicht Titel **normalisiert** (Artikel/Case/Umlaute egal) plus
    Token-Überlappung; ähnliche Vorschläge sind im Review-Dialog vorab abgewählt und als
    „ähnlich zu …" markiert — kein stiller Datenverlust, der Nutzer entscheidet.
  - Neuer Button **„Dubletten entfernen"** in der Weltenbau-Ansicht räumt bestehende Listen auf
    (Bestätigung, behält je Konzept den ersten Eintrag).
  - Der Storyboard-Prompt fordert keine Füll-Einträge mehr an („2-4 pro Kategorie ist normal")
    und verbietet Doppelnennungen ausdrücklich — das war die Hauptquelle des Rauschens.
- **Abgeschnittene Kapitel**: Antworten, die mitten im Satz enden (Token-Limit oder
  „lite"-Modelle), werden erkannt und über eine gezielte Fortsetzung zu Ende geschrieben —
  für Rohentwurf, Ausbau, Kohärenz und Stil. Läuft es weiterhin ins Limit, benennt der
  Prüfbericht das Problem, statt es zu verschweigen.
- **Prosa-Verlust durch `<NOTES>`**: Der Parser schnitt bisher am ersten `<NOTES>`-Marker
  alles ab — auch echten Prosatext. Jetzt hat ein geschlossener `<TEXT>`-Block Vorrang;
  Notes-Inhalte werden gezielt entfernt, niemals Prosa.
- **„Manuskript kopieren" war unvollständig**: kopiert wurde nur der gespeicherte Stand,
  während der Editor den laufenden Text in verzögerten Autosave-Puffern hält. Kopieren und
  alle Exporte (`.txt`, Markdown, EPUB, DOCX, PDF) führen die Puffer jetzt vorher zusammen.
- **Kopieren ohne Rückmeldung**: Kopier-/Exportaktionen melden nun Erfolg oder Fehler;
  unvollständige Kapitel werden beim Kopieren namentlich benannt.

---

## [0.2.0] — 2026-09-11

### Schreiben & Struktur

- **Added** **Szenen-Ziele**: Wortziel pro Szene — im Szenen-Editor pflegbar und als
  verbindliche Vorgabe im Prompt (`Target: ~N words`).
- **Added** **Timeline-Validierung & -Ansicht**: `POST /api/timeline/check` prüft die
  Zeitangaben der Szenen gegen die Kapitelreihenfolge (Rückwärtssprünge, unplausible
  Reise-/Vorbereitungszeiten, Tag/Nacht, Daten). Ein Dialog zeigt die vollständige
  Chronologie (Zeit/Schauplatz/POV je Szene) und markiert betroffene Kapitel.
- **Added** **Kapitel-Versionierung**: automatische Momentaufnahme vor jeder Generierung,
  zusätzlich manuelle Versionen — mit Zeitstempel, Wortzahl und „Wiederherstellen".
- **Added** **Szenen-Vorlagen**: wiederverwendbare Muster (Verfolgungsjagd, Konfrontation,
  Enthüllung, ruhige Szene, Kampf/Belagerung) zum Einfügen.
- **Changed** Der Kohärenz-Pass berücksichtigt den Szenen-Block inklusive Zeitangaben und Worten.

### Export & Ausgabe

- **Added** **DOCX-Export** (Office Open XML, clientseitig) mit Titelblatt, Kapitel-
  überschriften inkl. Seitenumbruch und Absätzen — für klassische Lektorats-Workflows.
- **Added** **Direkter PDF-Export** (PDF 1.4, eigener Writer, WinAnsi/Helvetica) mit
  Titelblatt und Kapitelumbruch — ohne Druckdialog.
- **Added** **Teil-Export**: Gesamtbuch, Akt I–III oder das aktuelle Kapitel — wahlweise als
  Markdown, EPUB, DOCX oder PDF.
- **Added** **Cover-Auswahl im EPUB**: Front-, Back-Cover oder keins.
- **Added** **Backup als neues Profil**: Import kann die Daten in ein **neues** Profil legen,
  statt den aktuellen Stand zu ersetzen (Backup-Merge).

### Covers

- **Added** **Cover-Varianten**: mehrere Entwürfe generieren; sie bleiben als **Kandidaten**
  im Buch und lassen sich dort vergleichen („Als Cover" / einzeln löschen).
- **Added** **Text-Presets** (Schriftpaare: Klassisch/Modern/Thriller/Roman), **Layout-Presets**
  und **eigene Presets** (pro Profil speicherbar).
- **Added** **Front- und Back-Cover** inkl. Umschalter im Cover-Editor und Vorschau-Thumbnail.
- **Added** **ISBN/EAN-13-Barcode** als Cover-Layer (echte Prüfziffer, gültig/t ungültig wird erkannt).
- **Added** **Cover-Text-Layer werden persistiert** („Nur Text speichern") und beim erneuten
  Öffnen wieder geladen — Text bleibt editierbar statt nur eingebrannt.

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
- **Added** Kapitel **hinzufügen / löschen**; **Sortieren per Drag & Drop** (ersetzt ▲/▼,
  Storyboard + Manuskript synchron, Re-Index).
- **Added** **Szenen-Ebene**: Beats pro Kapitel editierbar (Text, hinzufügen/entfernen/verschieben)
  inkl. Figuren je Szene — Änderungen fließen in Rohentwurf und Ausbau.
- **Added** **Szenen-Metadaten**: POV, Schauplatz und Zeit je Szene.
- **Added** **Szenen als verbindliche Vorgabe** in allen Text-Prompts (Rohentwurf, Ausbau,
  Kohärenz) — Reihenfolge, POV/Schauplatz/Zeit und auftretende Figuren werden beachtet.
- **Added** **Autosave** im Editor (debounced, 800 ms) mit „speichert…/automatisch gespeichert"-
  Anzeige, zusätzlich zum impliziten Speichern bei Generierungen.
- **Added** **Projekt-Vorgabe für Ziel-Wörter pro Kapitel** (Kapitel können sie überschreiben).
- **Added** **Ziel-Wörter pro Kapitel** (fließt in Ausbau und Fortschritt).
- **Added** **Charaktere an Kapitel und einzelne Szenen** hängen.
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

### Standalone-Build

- **Added** `bun run build:binary` — versandfertiger Ordner `release/` mit ausführbarer
  Datei (Server + UI), `LICENSE`, `README.md` und `.env.example`; inklusive
  Tailwind-Plugin und Produktions-Defines.
- **Added** laufzeit-sichere Pfade: `runtimeRoot()` (Entwicklung: cwd · Binary: Binary-Verzeichnis)
  und `runtimePort()` (Standard 3000, `PORT` überschreibbar).
- **Changed** Cover-Ablage und `.env`-Suche funktionieren auch neben einem Standalone-Binary.
- **Changed** Release-Ordner ist `release/` (gitignored) — bewusst nicht `dist/`, weil der
  Web-Build `dist/` leert.

### Release-Kette (Windows)

- **Added** Inno-Setup-Skript `installer/authorai.iss`: Per-User-Installation (kein UAC),
  Start-Menü/Desktop-Verknüpfung, erste `.env` aus `.env.example`, Lizenz-Anzeige und
  Deinstallation mit optionalem Entfernen von Covern/`.env`.
- **Added** `scripts/release.ps1` (Ein-Befehl-Release), `scripts/build-installer.ps1`,
  `scripts/sign-windows.ps1` (PFX oder Zertifikat-Thumbprint, SHA-256 + Zeitstempel, Verify).
  Signierung ist **optional** — ohne Zertifikat wird sie übersprungen, der Rest läuft weiter.
- **Added** Browser-Auto-Start im Standalone-Binary (`AUTHORAI_OPEN=0` schaltet ab).
- **Added** Dokumentation [`docs/release.md`](release.md) mit Checkliste und Troubleshooting.
- **Fixed** Installer-Skript: `InitializeUninstall` ist eine `function … : Boolean` (vorher
  „Invalid prototype") und das Build-Skript meldet Inno-Fehler jetzt korrekt (Exit-Code-Prüfung).
- **Noted** Lizenzhinweis zu Inno Setup für **kommerziellen** Vertrieb (ZIP/NSIS als Alternativen).

### Export & Backup

- **Added** **EPUB-Export** (EPUB 3) clientseitig mit eigenem ZIP-Writer — Cover, Titelblatt,
  Kapitel, CSS, `nav.xhtml` und `toc.ncx`; `mimetype` korrekt als erster, unkomprimierter Eintrag.
- **Added** **Markdown-Export** (Titel, Untertitel, Kapitelüberschriften, Absätze, Tags).
- **Added** **Druck-CSS** für den Reader: `Strg+P` liefert ein sauberes PDF ohne Sidebar/Chrome,
  mit Seitenumbrüchen je Kapitel (`@page`, `data-print-area`).
- **Added** **Projekt-Backup**: alle Profildaten (Bücher, Charaktere, Welt, Plot, Recherche,
  Ideen, Notifications, Metriken) als JSON exportieren/importieren — Import mit Bestätigung
  und Referenz-Counted-Cover-Freigabe.

### Fixed

- Storyboard liefert jetzt **exakt** die gewünschte Kapitelzahl (vorher Abbruch durch Output-Limit).
- Sprachdrift in späten Kapiteln und Soul-Sektionen behoben (Language-Lock in allen Prompts).
- `<TEXT>`-Marker leckten in den Kapiteltext (robuster Parser + Prosa-Bereinigung).
- „Geprüft"-Status hing an Notizen → jetzt eigene Flags; Queues wiederholen nichts.
- Ausbau erreicht die Ziel-Länge (Continuation-Loop).
- Wochen-Balken unsichtbar (Prozent-Höhe ohne festen Parent).
- `loadRootEnv` zeigte auf `packages/.env` statt auf das Repo-Root (Eltern-Suche statt fixer Pfad).

### Docs, Richtlinien & Tooling

- **Added** vollständige Dokumentation unter `docs/` (Architektur, Pipeline, Datenmodell,
  API, Konfiguration, Entwicklung, Troubleshooting, Changelog, Roadmap).
- **Added** Root-`README.md`, `AGENTS.md`, `LICENSE` (MIT), `CHANGELOG.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`.
- **Added** Screenshots in der README (`public/static/*.png`).
- **Added** Community-Setup: Issue-Templates (Bug/Feature), PR-Template, PR-Checkliste.
- **Added** `bun run check` (`scripts/check.ts`): Syntax, Imports, Markdown-Links — ohne Dependencies.
- **Added** CI (`.github/workflows/ci.yml`): Install, Check, Build bei Push/PR.
- **Added** `.env.example`, `.editorconfig`, `.gitattributes`.
- **Changed** `.echo/` ist ignoriert (persönliche Agent-Konfiguration wird nicht veröffentlicht).
- **Changed** Begrüßung nutzt den **Profilnamen** statt eines festen Namens.
- **Changed** Entwickler-Angabe durchgängig: **KT-Society & Echo**.

---

## [0.0.0] — 2026-09-11

- **Added** Repository-Initialisierung (`bun init`), Bun-React-Template als Basis.
