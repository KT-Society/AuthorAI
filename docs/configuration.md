# Konfiguration

AuthorAI wird über die **Root-`.env`** (Secrets) und die **App-Einstellungen**
(Modelle, Sprache) konfiguriert. Es gibt keine Konfigurationsdatei für Fachdaten —
die liegen pro Profil im Browser.

---

## Umgebungsvariablen (Root-`.env`)

Die Datei liegt im Repository-Root und ist **gitignored**. Sie wird serverseitig geladen
(robuste Suche inkl. Elternverzeichnissen), nie an den Browser ausgeliefert.

### Erforderlich

| Variable | Alias | Für | Beschreibung |
| --- | --- | --- | --- |
| `OPENROUTER_API_KEY` | `OPENROUTER_KEY` | LLM | Alle Textgenerierungen (Storyboard, Ausbau, Prüfungen, Soul) |
| `TAVILY_API_KEY` | `TAVILY_KEY` | Recherche | Charakter-Recherche + `/api/research` |
| `POLLINATIONS_API_KEY` | `POLLINATIONS_TOKEN` | Cover | Bilderzeugung |

### Optional

| Variable | Default | Wirkung |
| --- | --- | --- |
| `POLLINATIONS_API_BASE` | `https://gen.pollinations.ai` | API-Basis für Bilder |
| `PROMPTGEN_LANGUAGES` | `German,English,Japanese,French` | Auswählbare Sprachen (promptgen-Config) |
| `PROMPTGEN_DEFAULT_LANGUAGE` | `German` | Fallback-Sprache |
| `PORT` | `3001` (promptgen) | Port des promptgen-Servers; Root nutzt 3000 |

**Beispiel**

```dotenv
OPENROUTER_API_KEY=sk-or-v1-…
TAVILY_API_KEY=tvly-…
POLLINATIONS_API_KEY=sk_…
```

> Fehlt ein Key, antworten die betroffenen Routen mit **HTTP 500** und einer klaren
> deutschen Meldung. `GET /api/config` zeigt den Status als Booleans.

---

## Modelle pro Stufe

Modelle werden **pro Pipeline-Stufe** gesetzt — freie OpenRouter-Model-ID, **kein Dropdown,
kein Default**. Leer = erbt das Standard-Model.

| Stufe | Key | Empfehlung |
| --- | --- | --- |
| Standard (Fallback) | `authorai.model` | solides Allround-Modell; auch für Soul-Scan |
| Storyboard | `authorai.model.storyboard` | stärkeres Modell (Struktur + Sprache) |
| Rohentwurf | `authorai.model.draft` | schnell/„lite" genügt |
| Ausbau | `authorai.model.expand` | mittel–hoch (Continuation fängt Länge ab) |
| Kohärenz | `authorai.model.consistency` | stark (Reasoning) |
| Stil | `authorai.model.style` | mittel (Sprachgefühl) |

**Setzen:** Einstellungen (Sidebar → „Einstellungen") oder direkt im Buch-Wizard
(die Leiste zeigt das Model der aktiven Stufe).

---

## Sprache

- Key: `authorai.language` (Default `German`).
- Wirkt auf **alle** Generierungen (Storyboard, Kapitel, Prüfungen, Soul-Scan).
- Die Prompts enthalten einen **Language-Lock** (System + User), damit gerade längere
  Ausgaben nicht in die Prompt-Sprache (Englisch) driften.

---

## Profile

- Profile werden lokal verwaltet (`authorai.profiles`, `authorai.currentProfile`).
- Beim ersten Start ohne Profile, aber mit alten globalen Daten wird automatisch ein
  Profil **„Autor"** angelegt und die Daten dorthin migriert.
- Profil löschen entfernt dessen gescopte Daten **und** gibt dessen eindeutige Cover frei
  (geteilte Seed-Cover bleiben).

---

## Tagesziel

- Key: `DashboardMeta.goal` (Default **1500** Wörter).
- Der Zähler „Heute" (`todayWords`) wird durch Generieren **und** „+250" erhöht und
  bei neuem Tag automatisch zurückgesetzt.
- „Beispielwerte zurücksetzen" (Statistiken) nullt Metriken und setzt das Datum auf heute.

---

## Cover

| Aspekt | Wert |
| --- | --- |
| Model (Default) | `black-forest-labs/flux.1-schnell` |
| Größe (Default) | 768 × 1024 (geklemmt 256–1536) |
| Ablage | `covers/` im Root (gitignored) |
| Auslieferung | `GET /covers/:file` |
| Upload-Limit | 15 MB (`POST /api/cover/save`) |

---

## Tooling-Konfiguration

| Datei | Zweck |
| --- | --- |
| `bunfig.toml` | `bun-plugin-tailwind` für `serve.static`, `BUN_PUBLIC_*`-Exposure |
| `tsconfig.json` | Bundler-Mode, `@/*` → `src/*`, `@promptgen/*` → `packages/promptgen/src/*` |
| `build.ts` | `Bun.build` (HTML-Entry, Tailwind-Plugin, minify, sourcemaps) |
| `scripts/all.ts` | Workspace-Task-Runner (`dev`/`build`/`start`) |
| `components.json` | shadcn-Aliase (`@/components`, `@/lib`) |

> Hinweis: Es gibt bewusst **kein** `tailwind.config.js` — Tailwind v4 konfiguriert über
> `@theme` in `styles/globals.css`.
