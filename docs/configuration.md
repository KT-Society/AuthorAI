# Konfiguration

AuthorAI wird über die **Root-`.env`** (Secrets) und die **App-Einstellungen**
(Modelle, Sprache) konfiguriert. Es gibt keine Konfigurationsdatei für Fachdaten —
die liegen pro Profil in der SQLite-Datenbank `<runtimeRoot>/data/authorai.db`.

---

## Umgebungsvariablen (Root-`.env`)

Die Datei liegt im Repository-Root und ist **gitignored**. Sie wird serverseitig geladen
(robuste Suche inkl. Elternverzeichnissen), nie an den Browser ausgeliefert.

### Erforderlich

| Variable | Alias | Für | Beschreibung |
| --- | --- | --- | --- |
| `OPENROUTER_API_KEY` | `OPENROUTER_KEY` | LLM | Alle Textgenerierungen (Storyboard, Ausbau, Prüfungen, Soul) — **entfällt**, wenn ein eigener Anbieter konfiguriert ist (siehe unten) |
| `TAVILY_API_KEY` | `TAVILY_KEY` | Recherche | Charakter-Recherche + `/api/research` |
| `POLLINATIONS_API_KEY` | `POLLINATIONS_TOKEN` | Cover | Bilderzeugung |

### Optional

| Variable | Default | Wirkung |
| --- | --- | --- |
| `POLLINATIONS_API_BASE` | `https://gen.pollinations.ai` | API-Basis für Bilder |
| `AUTHORAI_PROVIDER` | — | `openrouter` erzwingt OpenRouter (Override vor der gespeicherten Konfiguration) |
| `AUTHORAI_BASE_URL` | — | Base-URL eines eigenen OpenAI-kompatiblen Anbieters (nur mit `AUTHORAI_API_KEY`) |
| `AUTHORAI_API_KEY` | — | Key für den eigenen Anbieter (Override; wird **nie** geloggt) |
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
> deutschen Meldung. `GET /api/config` liefert den Status als Booleans (`tavily`,
> `openrouter`, `pollinations`) — die Einstellungen zeigen ihn als Badges an.

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

> **Ein Model trägt mehr als eine Aufgabe:** Das **Kohärenz**-Model
> (`authorai.model.consistency`) wird außer für den Kohärenz-Pass auch für **Fakten-Check,
> Kanon-Quick-Fix, Timeline-Prüfung und Timeline-Quick-Fix** genutzt (Reasoning-Qualität zahlt
> sich hier aus). Alles andere läuft genau über die Stufe, die im Wizard sichtbar ist.

---

## Anbieter (LLM)

In den Einstellungen lässt sich zwischen **OpenRouter** (Standard) und einem **eigenen
OpenAI-kompatiblen Anbieter** umschalten. Bei „Eigener Anbieter" kommen **Base-URL** und
**API-Key** hinzu; „Verbindung testen" prüft die Werte gegen `{base}/models`.

- **OpenRouter:** Key aus der Root-`.env` (`OPENROUTER_API_KEY`).
- **Eigener Anbieter:** Base-URL (z. B. `https://api.openai.com/v1` — `/chat/completions` wird
  ergänzt, ein vollständiger Pfad bleibt) und Key. Die **Model-IDs je Stufe** bleiben Freitext
  und müssen zum Anbieter passen.
- **Speicherort:** Der Key liegt **serverseitig** in der SQLite-Tabelle `provider` — **nicht**
  in `state`, also **nicht** über `/api/state` lesbar und **nicht** in Client-Backups. `GET
  /api/provider` liefert nur `hasKey: boolean`; der Key geht **nie** zurück an den Browser, wird
  nie geloggt und nie in Fehlermeldungen aufgenommen.
- **Env-Override** (headless/Standalone): Sind `AUTHORAI_BASE_URL` + `AUTHORAI_API_KEY` gesetzt,
  gewinnen sie vor der gespeicherten Konfiguration; `AUTHORAI_PROVIDER=openrouter` erzwingt
  OpenRouter.
- **Cache:** Der Antwort-Cache ist anbieterabhängig (Anbieterwechsel liefert keine alten Treffer).

---

## Sprache

- Key: `authorai.language` (Default `German`).
- Wirkt auf **alle** Generierungen (Storyboard, Kapitel, Prüfungen, Soul-Scan).
- Die Prompts enthalten einen **Language-Lock** (System + User), damit gerade längere
  Ausgaben nicht in die Prompt-Sprache (Englisch) driften.

---

## Kanon-Warnung

- Key: `authorai.canonWarn` (`"0"` = aus; Standard **an**), geräteweit.
- Wirkt beim **Kapitelwechsel**: das verlassene Kapitel wird still gegen den Kanon geprüft; bei
  Widersprüchen erscheint eine **nicht blockierende** Warnung mit direktem Weg in den Fakten-Check.
- Modell: die Stufe **Kohärenz** (`authorai.model.consistency`) — sie trägt auch Fakten-Check und
  Quick Fix.
- Unveränderte Kapitel kosten nichts (Text-Hash `lib/textHash.ts` + Antwort-Cache;
  `AUTHORAI_CACHE=0` schaltet den Cache ab).

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

## Single-Binary (Standalone)

`bun run build:binary` erzeugt einen **versandfertigen Ordner** `release/` mit einer
ausführbaren Datei (Server **und** UI) plus Beigaben:

```
release/
├─ authorai(.exe)   Server + UI in einer Datei
├─ LICENSE          MIT — bei Weitergabe beilegen
├─ README.md
└─ .env.example
```

`release/` ist gitignored. Bewusst **nicht** in `dist/`, weil der Web-Build
(`bun run build`) `dist/` leert.

| Aspekt | Verhalten |
| --- | --- |
| **Keys** | `.env` **neben dem Binary** (oder Umgebungsvariablen) — Lookup: cwd → Binary-Verzeichnis → Elternverzeichnisse |
| **Cover** | werden in `covers/` **beim Binary** abgelegt (nicht im Repo) |
| **Port** | `PORT` (Standard **3000**) |
| **Aufruf** | Binary starten, dann `http://localhost:3000` öffnen |
| **Daten** | in `data/authorai.db` **neben dem Binary** (SQLite, pro Profil) — siehe [`data-model.md`](data-model.md) |
| **Größe** | ~90–100 MB (Bun-Runtime enthalten), komprimiert deutlich kleiner |

```bash
bun run build:binary
cd release
./authorai          # Windows: .\authorai.exe
```

> Damit ist AuthorAI ohne Bun/Node auslieferbar — die Grundlage für eine
> Desktop-Ausgabe an Endnutzer. Für **Windows-Warnungen** (SmartScreen) ist der
> nächste Schritt eine Code-Signatur des Binaries.

---

## Kosten & Offline

| Vorgang | Externer Aufruf |
| --- | --- |
| Storyboard, Kapitel, Prüfungen, Timeline, Soul-Scan, Weltenbau-Extraktion | LLM (OpenRouter oder eigener Anbieter) |
| Recherche (Notiz-Suche, Charakter-Scan) | Tavily |
| Cover / Cover-Varianten | Pollinations (Varianten: **3 Bilder pro Durchlauf**) |
| **EPUB / DOCX / Markdown / PDF / Backup** | **keiner — läuft komplett im Browser** |

Exporte und das Projekt-Backup funktionieren also auch ohne Netz (Cover im EPUB braucht
allerdings das zuvor geladene Bild).

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
