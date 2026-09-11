# Canon-Slug-Generator

Bun + React + TypeScript + Tailwind v4 + MUI SPA zur Erzeugung hochpräziser, habitat-fähiger Character-Prompts.

## Überblick

Die App nimmt einen Character-Slug (z. B. „Harley Quinn“) entgegen und führt zwei Schritte aus:

1. Recherche via Tavily Search API
2. Synthese eines strukturierten 12-teiligen JSON-Prompts über OpenRouter LLMs

Recherche und Synthese laufen **serverseitig** (Bun). Die API-Keys kommen aus der Repository-Root-`.env` und erreichen den Browser nie. Das Model wird als **freie OpenRouter-Model-ID** eingegeben — es gibt bewusst keine hardcodierte Modellliste und keinen Dropdown.

Das Ergebnis ist ein vollständiger „Soul“-Prompt, der direkt in Habitat- oder andere LLM-Systeme kopiert werden kann.

## Technologie-Stack

- **Runtime & Bundler**: Bun (`Bun.serve` für Dev/Prod, `Bun.build` + `bun-plugin-tailwind` für den Build)
- **Frontend**: React 18, TypeScript
- **UI**: Material-UI v5 (dark theme, neon/cyberpunk styling), Tailwind CSS v4
- **APIs (server-only)**: Tavily Search, OpenRouter Chat Completions
- **Persistenz**: Browser `localStorage` für Model-ID und Sprache (keine Keys)

## Projektstruktur

```
src/
├── index.ts          # Bun-Server (Bun.serve) + /api/* + HMR
├── index.html        # HTML-Entry, lädt frontend.tsx
├── frontend.tsx      # MUI ThemeProvider + React-Root
├── App.tsx           # Haupt-UI + State-Management
├── services/
│   └── api.ts        # Client-Wrapper -> /api/* (keine Keys)
├── server/
│   ├── env.ts        # Root-.env laden + Keys lesen (server-only)
│   ├── config.ts     # Sprachen + öffentliche Config
│   └── api.ts        # Tavily + OpenRouter (server-only)
└── index.css         # Tailwind v4 (@theme) + Neon-Styles
```

## Wichtige Konzepte

### Sections (12 Stück)

Jede Section muss ≥ 3 Sätze enthalten, damit sie als „VALID“ markiert wird:

- `head` – System-Prompt / Identity Override
- `core` – Essenz des Charakters
- `bio` – Kanonische Hintergrundgeschichte
- `trivia` – Kleinigkeiten, Likes/Dislikes, Eigenheiten
- `appearance` – Visuelle Beschreibung + Aura
- `personality` – Psychologisches Profil
- `relationships` – Interaktion mit anderen
- `occupation` – Rolle / Tätigkeit
- `skills` – Fähigkeiten / Powers
- `speech` – Sprachstil + typische Vokabeln
- `goals` – Kurz- und Langzeit-Motivationen
- `emotes` – Emotions-Ausdruck in `*asterisks*`

### API-Flow

1. User gibt Slug + Model-ID ein → `handleGenerate`
2. Client: `POST /api/generate` mit `{ slug, model, language }`
3. Server: `searchTavily` → `synthesizeSoul` (Keys aus der Root-`.env`)
4. Client: Mapping in State + Validitäts-Check (`checkSentences`)

### Settings

- `model`: freie OpenRouter-Model-ID als Eingabefeld (localStorage, **kein** Default)
- `language`: Auswahl für die Ausgabesprache (Default `German`, server-seitig via `PROMPTGEN_LANGUAGES` konfigurierbar)

Unterstützte Sprachen kommen aus `/api/config`.

## Entwicklung

```bash
bun install
bun run dev          # Bun Dev Server (HMR)
bun run build        # Bun.build -> dist/
bun run start        # Production-Build serven
```

## Entwickler

**KT-Society & Echo**

## Lizenz

MIT – siehe `LICENSE` im Root.
