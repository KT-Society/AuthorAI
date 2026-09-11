# API Reference

Die App spricht **nur** mit dem lokalen Bun-Server. Upstream-Aufrufe (Tavily/OpenRouter) passieren serverseitig; API-Keys verlassen den Server nie. Das Model ist eine freie OpenRouter-Model-ID aus dem Client.

## Server-Routen

### `GET /api/config`

Nicht-geheime Statusabfrage + konfigurierbare Optionen für die UI.

**Response**:

```json
{
  "tavily": true,
  "openrouter": true,
  "languages": ["German", "English", "Japanese", "French"],
  "defaultLanguage": "German"
}
```

Reine Booleans und öffentliche Listen – kein Key-Inhalt, keine Länge, kein Prefix. Es gibt **keine** Modellliste: das Model wird frei eingegeben.

---

### `POST /api/generate`

Führt Research + Synthese serverseitig aus.

**Request Body**:

```json
{ "slug": "Harley Quinn", "model": "<openrouter-model-id>", "language": "German" }
```

- `slug` (required) – Character-Slug
- `model` (required) – freie OpenRouter-Model-ID
- `language` (optional) – fällt auf den Server-Default zurück

**Response** (Erfolg):

```json
{ "soul": { "head": "…", "core": "…", "bio": "…" } }
```

**Response** (Fehler): `{ "error": "<message>" }` mit passendem HTTP-Status (400/500/502). Fehlermeldungen sind generisch und enthalten keine Keys oder rohen Upstream-Bodies.

---

## Environment

Keys werden aus der Repository-Root-`.env` gelesen (`D:\workplace\AuthorAI\.env`), via `src/server/env.ts`:

| Variable | Aliases | Benötigt für |
| --- | --- | --- |
| `TAVILY_API_KEY` | `TAVILY_KEY` | Research (`/search`) |
| `OPENROUTER_API_KEY` | `OPENROUTER_KEY` | Synthese (`/chat/completions`) |

Optionale, nicht-geheime Konfiguration via `src/server/config.ts`:

| Variable | Default | Beschreibung |
| --- | --- | --- |
| `PROMPTGEN_LANGUAGES` | `German,English,Japanese,French` | Auswählbare Ausgabesprachen |
| `PROMPTGEN_DEFAULT_LANGUAGE` | `German` | Fallback-Sprache, wenn der Client keine sendet |

Reale Prozess-Env-Variablen haben Vorrang vor der Datei (dotenv-Semantik).

---

## Upstream-Aufrufe (server-only)

### Tavily Search

**Endpoint**: `POST https://api.tavily.com/search`

```json
{
  "api_key": "<TAVILY_API_KEY>",
  "query": "Explain the character canon of <slug> in detail. Focus on biography, personality, and relationships.",
  "search_depth": "advanced",
  "include_answer": true,
  "max_results": 5
}
```

Wird in `src/server/api.ts:searchTavily` aufgerufen.

### OpenRouter Chat Completions

**Endpoint**: `POST https://openrouter.ai/api/v1/chat/completions`

**Headers**:

- `Authorization: Bearer <OPENROUTER_API_KEY>`
- `HTTP-Referer: https://habitatai.biz` (optional)
- `Content-Type: application/json`

**Request Body**:

```json
{
  "model": "<model-id>",
  "messages": [
    { "role": "system", "content": "<systemPrompt>" },
    { "role": "user", "content": "<userPrompt>" }
  ],
  "response_format": { "type": "json_object" }
}
```

**System Prompt** (gekürzt):

- Fordert JSON mit genau 12 Keys: `head, core, bio, trivia, appearance, personality, relationships, occupation, skills, speech, goals, emotes`
- Jede Section ≥ 3 Sätze
- Sprache = übergebenes `language`
- Kein Markdown, keine Comments, nur reines JSON

**Response Handling** (`src/server/api.ts:cleanJSON`):

1. Entfernt ` ```json ` / ` ``` `
2. Extrahiert ersten `{` bis letzten `}`
3. `JSON.parse`

---

## Error Handling

- Fehlende Keys → HTTP 500 mit Hinweis, welche Variable in der `.env` fehlt
- Fehlende Model-ID → HTTP 400
- Tavily/OpenRouter HTTP-Fehler → HTTP 502 mit generischer Meldung
- Ungültiges JSON vom LLM → spezifische Fehlermeldung mit Emoji
- Client zeigt Serverfehler via `alert` an

---

## Rate Limits & Kosten

- Tavily: kostenpflichtig pro Query
- OpenRouter: je nach gewähltem Model

Keys liegen server-seitig in der `.env` und werden nicht an den Browser ausgeliefert.
