# Architecture

## High-Level Flow

```
Browser (no secrets)
   │  POST /api/generate  { slug, model, language }
   ▼
Bun Server  (src/index.ts)
   │  injects keys from root .env
   ├─► searchTavily    → Tavily API
   └─► synthesizeSoul  → OpenRouter LLM
   │
   ▼
{ soul: { head, core, … } } → 12 Section Cards → Copy / Download (.txt)
```

Das `model` ist eine **freie OpenRouter-Model-ID** aus dem Client – es gibt keine hardcodierte Modellliste und keinen Server-seitigen Model-Default.

## Runtime & Bundling (Bun)

- `src/index.ts` – `Bun.serve` mit `routes`:
  - `GET /api/config` – nicht-geheime Statusabfrage (`{ tavily, openrouter, languages, defaultLanguage }`)
  - `POST /api/generate` – Research + Synthese serverseitig (verlangt `slug` + `model`)
  - `/*` – SPA (HTML-Bundle)
  - In Development aktiviert es `hmr: true` und `console: true`.
- `src/index.html` – HTML-Entry, lädt `frontend.tsx` als ES-Modul.
- `build.ts` – `Bun.build` mit dem Entry-Glob `src/**/*.html`, `bun-plugin-tailwind` und `target: "browser"`, Output nach `dist/`.
- `bunfig.toml` – registriert `bun-plugin-tailwind` für `serve.static`.

## Secrets & Config

- Keys liegen ausschließlich in der Repository-Root-`.env` (`D:\workplace\AuthorAI\.env`).
- `src/server/env.ts` lädt die Datei explizit (Bun lädt `.env` nur aus dem cwd) und liest `TAVILY_API_KEY`/`TAVILY_KEY` sowie `OPENROUTER_API_KEY`/`OPENROUTER_KEY`.
- `src/server/config.ts` liefert die öffentliche Config: Sprachen via `PROMPTGEN_LANGUAGES`, Default via `PROMPTGEN_DEFAULT_LANGUAGE`.
- `src/server/*` wird **niemals** vom Client importiert. Der Client ruft ausschließlich lokale `/api/*`-Routen auf – Keys verlassen den Server nicht.
- Upstream-Fehler werden zu generischen Meldungen normalisiert, damit weder Keys noch rohe API-Antworten leaken.

## Komponenten

### `frontend.tsx`

- Erstellt `darkTheme` (MUI `createTheme`)
  - Neon Cyan `#00f2ff`
  - Cyber Magenta `#ff00db`
  - Background `#0a0b10`
- Wrappt App mit `ThemeProvider` + `CssBaseline`
- HMR-sicherer Root via `import.meta.hot.data.root`

### `App.tsx`

**State**:

- `slug: string`
- `sections: PromptSection[]` (12 Einträge)
- `settings` (freie `model`-ID + `language`, persistiert in localStorage)
- `showSettings`, `loading`, `config`

**Funktionen**:

- `updateSetting` → State + localStorage
- `checkSentences(text)` → ≥ 3 Sätze?
- `handleGenerate` → validiert Model-ID → `generateSoul(...)` → Mapping + Validitäts-Check

**UI**:

- Settings-Dialog (freies Model-Eingabefeld + Sprachauswahl + Key-Status-Chips)
- Slug-Input + Generate-Button
- 12 Section-Cards (Grid 2-spaltig)
- Copy / Download Buttons

### `services/api.ts` (Client)

Thin wrapper: `fetchConfig()` und `generateSoul({ slug, model, language })` → `POST /api/generate`. Enthält **keine** Keys.

### `server/api.ts` (Server)

`searchTavily`, `synthesizeSoul`, `cleanJSON`, `generateSoul`. Liest Keys über `server/env.ts`.

## Styling

- Tailwind CSS v4: Design-Tokens in `src/index.css` unter `@theme` (u. a. `--color-brand-cyan`, `--color-brand-magenta`, `--color-dark-bg`) plus MUI `sx`
- `.glass`, `.neon-border`, `.neon-text` in `src/index.css`
- Dark Theme mit Cyan/Magenta Akzenten, Premium-Font `Outfit` (Fallback `Inter`)

## Datenfluss & Persistenz

- Nur `model` und `language` → `localStorage`. Keine API-Keys im Browser.
- Sections sind nur im Memory (außer nach Neuladen verloren)

## Erweiterungspunkte

- Sprachen über `PROMPTGEN_LANGUAGES` erweitern (ohne Rebuild)
- Beliebige OpenRouter-Modelle direkt im Eingabefeld nutzen
- Export-Formate (JSON, YAML, Markdown) können in den Download-Handler eingebaut werden
- Auth-Flow für Habitat-Integration möglich
