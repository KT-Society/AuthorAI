# Contributing

Danke, dass du zu AuthorAI beitragen willst! Dieses Dokument erklärt, wie du am
besten beiträgst — und worauf wir Wert legen.

**Maintainer:** KT-Society & Echo · **Lizenz:** MIT (siehe [`LICENSE`](LICENSE))
· **Verhaltenskodex:** [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)

---

## Projektwerte

Drei Prinzipien ziehen sich durch alles — bitte respektiere sie in Beiträgen:

1. **Local-first & privat.** Inhalte bleiben im Browser, Secrets bleiben serverseitig.
   Kein Cloud-Zwang, keine Telemetrie.
2. **Zero-Warning.** Warnungen (Typen, Lint, Build) sind Mängel und werden an der Wurzel
   behoben, nicht ignoriert.
3. **Die Kette zählt.** Jede KI-Ausgabe soll im richtigen Bereich landen, editierbar,
   prüfbar und persistent sein.

---

## Wie du beitragen kannst

| Art | Vorgehen |
| --- | --- |
| **Fehler melden** | Issue mit Reproduktion (Schritte, erwartet vs. tatsächlich), Umgebung, relevante Log-Auszüge |
| **Idee vorschlagen** | Issue mit Problem + Nutzen; gern mit Skizze/Screenshot |
| **Code** | Pull Request (siehe unten) |
| **Doku** | PR gegen `README.md` / `docs/*` — Tippfehler sind genauso willkommen |
| **Presets & Inhalte** | Kuratierte Prompt-Packs, Genres, Beispielwelten (siehe Roadmap) |
| **Übersetzen** | Sprachen/Locale-Vorschläge willkommen |

**Gute erste Aufgaben:** siehe [`docs/roadmap.md`](docs/roadmap.md) — z. B. Kapitel
per Drag & Drop, EPUB-Export, Projekt-Backup, Cover-Varianten.

---

## Setup

```bash
bun install        # immer im Repo-Root
bun run dev        # Root-App :3000, promptgen :3001
```

Details, Skripte und Konventionen: [`docs/development.md`](docs/development.md).

---

## Pull-Request-Workflow

1. **Branch** von `main` (sprechender Name: `feat/kapitel-dragdrop`, `fix/wochen-balken`).
2. **Fokussiert** arbeiten: ein Thema pro PR. Große Umbauten bitte vorher als Issue abstimmen.
3. **Verifizieren** (siehe unten) — ohne grüne Checks kein Merge.
4. **Commit-Messages** im Stil *Conventional Commits* mit deutscher Beschreibung:

   ```
   feat(ui): Kapitel per Drag & Drop sortieren
   fix(story): Kapitelanzahl bei großen Storyboards garantieren
   docs(readme): Screenshots ergänzen
   ```

   Typen: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `perf`.
   Scopes z. B.: `ui`, `story`, `world`, `plot`, `cover`, `streak`, `persistence`.
5. **PR-Beschreibung**: Was, Warum, Wie getestet. Bei UI-Änderungen **Screenshots**.

---

## Verifikation (Pflicht)

```bash
bun run check      # Syntax + Imports + Markdown-Links — ohne Dependencies
```

Zusätzlich für **kritische Pfade** (temporäres Skript in `src/`, danach löschen):
Cover-Erzeugung, ein LLM-Pfad, pure Logik (z. B. `computeStreak`).

Die exakten Befehle stehen in [`docs/development.md`](docs/development.md).

> Bestehende Testfehler bitte **nicht** eigenmächtig „mitreparieren" — erst im Issue klären.

---

## Code-Konventionen (Kurzfassung)

Diese Regeln sind nicht verhandelbar, weil sie Sicherheit und Datenintegrität betreffen:

- **Server/Client-Grenze:** `src/server/*` ist server-only und wird **nie** aus Client-Code
  importiert. `src/services/*` spricht ausschließlich lokale `/api/*`-Routen.
- **Secrets:** nur serverseitig aus der Root-`.env`. Nie an den Client geben, nie loggen,
  nie in Fehlermeldungen aufnehmen.
- **Persistenz:** `localStorage` **nur** in `src/lib/*`, gescoped pro Profil
  (`authorai.<profilId>.<sammlung>`). „fehlender Key = frisch" vs. „`[]` = bewusst geleert".
- **Modelle pro Stufe:** freie OpenRouter-ID, **kein** Dropdown, **kein** Default,
  nirgends ein hartcodiertes Model.
- **Sprache:** Jeder LLM-Prompt braucht den **Language-Lock** (System *und* User).
- **UI:** vorhandene Primitives nutzen (`components/dashboard/primitives.tsx`),
  Design-Tokens statt Inline-Hexfarben, keine Platzhalter-Inhalte, klare Leerzustände.

Ausführlich: [`docs/architecture.md`](docs/architecture.md),
[`docs/data-model.md`](docs/data-model.md), [`AGENTS.md`](AGENTS.md).

---

## Was eher nicht ins Projekt passt

- Cloud-Zwang, Accounts als Voraussetzung, Telemetrie
- Keys im Client oder eingebettete Schlüssel
- Hartcodierte Modelle oder Anbieter-Lock-in
- Breaking Changes an Persistenz-Keys ohne Migration

(Offen für Diskussion — als Issue anstoßen, bevor du größer baust.)

---

## Review & Merge

- Reviews durch die Maintainer (KT-Society & Echo).
- Wir prüfen: Korrektheit, Grenzen (Secrets/Persistenz), Doku/Changelog, Verifikation.
- Bei Verhaltensänderungen erwarten wir einen Eintrag in
  [`docs/changelog.md`](docs/changelog.md).

---

## Sicherheit

Bitte **keine** öffentlichen Issues für Sicherheitslücken (z. B. Key-Leaks).
Meldeweg, Umfang und Grundsätze: [`SECURITY.md`](SECURITY.md).

---

## Lizenz

Mit deinem Beitrag stimmst du zu, dass er unter der **MIT-Lizenz** dieses Projekts
veröffentlicht wird. Ein separater CLA ist nicht nötig.
