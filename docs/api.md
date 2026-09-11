# API-Referenz

Alle Routen stellt der **Bun-Server** (`src/index.ts`, Root-App) bereit.
Der Client ruft ausschließlich diese lokalen Routen auf — API-Keys bleiben serverseitig.

- **Basis:** `http://localhost:3000`
- **Fehlerformat:** `{ "error": "<message>" }` mit passendem HTTP-Status
  (`400` Validierung, `413` zu groß, `500` fehlende Konfiguration, `502` Upstream-Fehler)
- **Content-Type:** `application/json` (außer Bild-Upload)

---

## Konfiguration

### `GET /api/config`

Nicht-geheime Statusabfrage für die UI.

```json
{
  "tavily": true,
  "openrouter": true,
  "languages": ["German", "English", "Japanese", "French"],
  "defaultLanguage": "German"
}
```

Booleans spiegeln nur, **ob** Keys vorhanden sind — niemals deren Inhalt.

---

## Charaktere

### `POST /api/generate`

Erzeugt über die promptgen-Engine (Tavily-Recherche + OpenRouter) einen 12-teiligen
Soul-Prompt.

**Request**

```json
{ "slug": "Harley Quinn", "model": "anthropic/claude-3.5-sonnet", "language": "German" }
```

**Response**

```json
{ "soul": { "head": "…", "core": "…", "bio": "…" } }
```

### `POST /api/characters/extract`

Leitet benannte Figuren aus dem **Manuskript** ab — inklusive Figuren, die erst beim Schreiben
auftauchen und im Storyboard nie standen. Bereits getrackte Namen werden serverseitig gefiltert.

**Request**

```json
{
  "bookTitle": "Die Aschekrone",
  "genre": "Dark Fantasy",
  "chapters": [{ "title": "Kapitel 1", "text": "…" }],
  "knownCharacters": ["Elias"],
  "model": "<model-id>",
  "language": "German"
}
```

**Response**

```json
{ "characters": [{ "name": "Kael", "role": "Verbündeter", "description": "…" }] }
```

Fehlt Manuskript-Text, antwortet die Route mit **HTTP 400**; schneidet das Token-Limit die
Antwort ab, mit **HTTP 502** und klarer Meldung.

---

## Kontinuität

### `POST /api/continuity/extract`

Leitet **Fakten** (zu Figuren und Welteinträgen) und **Beziehungen** (zwischen Figuren) aus
Storyboard und Figuren-Register ab. Die Antwort enthält **Namen**, keine IDs — die Zuordnung
auf Charakter-/Welt-IDs macht der Client (Review-Dialog vor der Übernahme).
Bereits erfasste Aussagen und Beziehungen werden über `knownStatements`/`knownRelations`
ausgeschlossen; erfundene Entitäten filtert der Server heraus.

**Request**

```json
{
  "storyboard": { … },
  "characters": [{ "name": "Elias Thorne", "role": "Protagonist" }],
  "worldNames": ["Kinder der Asche"],
  "knownStatements": ["Elias ist Schmied."],
  "knownRelations": ["Elias→Sylar:distrust"],
  "model": "<model-id>",
  "language": "German"
}
```

**Response**

```json
{
  "facts": [
    { "kind": "history", "entityName": "Elias Thorne", "entityType": "character",
      "statement": "Verlor seine Familie beim Brand der Schmiede.", "establishedIn": "Kapitel 1" }
  ],
  "relations": [
    { "fromName": "Elias Thorne", "toName": "Sylar", "kind": "distrust",
      "intensity": -0.6, "note": "seit dem Verrat im Hafen" }
  ]
}
```

Schneidet das Token-Limit die Antwort ab, antwortet die Route mit **HTTP 502** und klarer Meldung.
Fakten/Beziehungen gehen als `canon`-Block zusätzlich an `chapter/draft`, `chapter/expand`,
`chapter/consistency`, `chapter/style` und `timeline/check`.

---

## Buch-Pipeline

### `POST /api/storyboard`

Zweiphasige Storyboard-Erzeugung (Outline + gechunkte Details).

**Request**

```json
{ "idea": "…", "model": "<model-id>", "language": "German", "chapters": 30 }
```

**Response**

```json
{
  "storyboard": {
    "title": "…", "subtitle": "…", "genre": "…",
    "logline": "…", "synopsis": "…",
    "themes": ["…"], "tone": "…", "pov": "…",
    "characters": [{ "name": "…", "role": "…", "description": "…" }],
    "world": {
      "locations":  [{ "name": "…", "description": "…" }],
      "factions":   [], "magic": [], "artifacts": [], "lore": []
    },
    "chapters": [{ "index": 0, "title": "…", "summary": "…", "pov": "…", "setting": "…", "beats": ["…"], "foreshadowing": ["…"] }]
  }
}
```

Garantiert **exakt `chapters` Einträge** (Aufrunden/Auffüllen serverseitig).

---

### `POST /api/chapter/draft`

Rohentwurf (~500 Wörter).

```json
{ "storyboard": { … }, "chapterIndex": 0, "model": "<model-id>", "language": "German" }
```

**Response:** `{ "draft": "…" }`

---

### `POST /api/chapter/expand`

Ausbau auf Ziel-Länge (Continuation-Loop bis ≥ 90 % des Ziels).

```json
{
  "storyboard": { … }, "chapterIndex": 0,
  "model": "<model-id>", "language": "German",
  "draft": "…", "targetWords": 4000,
  "scenes": [
    {
      "text": "Der Aufbruch am Hafen",
      "characters": ["Kiro", "Sylar"],
      "pov": "Kiro", "setting": "Alt-Distrikt", "time": "Tag 1, Morgen", "words": 800
    }
  ]
}
```

`scenes` ist optional und **verbindlich**, wenn gesetzt (Reihenfolge, POV/Schauplatz/Zeit,
auftretende Figuren, Wortziel). `targetWords` wird auf 3000–5000 geklemmt.

**Response:** `{ "expanded": "…" }`

> `scenes` gilt für alle Textrouten: `/api/chapter/draft`, `/api/chapter/expand`,
> `/api/chapter/consistency`, `/api/chapter/style`.

---

### `POST /api/chapter/consistency`

Kohärenz-/Logikprüfung mit Korrektur.

```json
{ "storyboard": { … }, "chapterIndex": 0, "model": "<model-id>", "language": "German", "text": "<aktueller Kapiteltext>" }
```

**Response**

```json
{ "text": "<korrigierter Text>", "notes": ["…"], "changed": true }
```

- `notes`: behobene Auffälligkeiten (leer möglich).
- `changed`: ob sich der Text tatsächlich geändert hat (bei `false` enthält `notes` einen Hinweis).
- Fehler bei leerem/stark gekürztem Ergebnis.

---

### `POST /api/chapter/style`

Stil-/Sprachprüfung mit Korrektur — gleicher Payload und gleiche Response wie
`/api/chapter/consistency`.

---

### `POST /api/timeline/check`

Chronologische Prüfung über alle Kapitel/Szenen (nutzt konzeptionell das Kohärenz-Model).

**Request**

```json
{
  "storyboard": { … },
  "scenesByChapter": [
    [{ "text": "…", "characters": ["…"], "time": "Tag 1, Morgen", "setting": "Hafen" }]
  ],
  "model": "<model-id>",
  "language": "German"
}
```

**Response**

```json
{ "summary": "…", "findings": ["Kapitel 3, Szene 2 …"] }
```

`findings` ist leer, wenn die Chronologie konsistent ist.

---

## Weltenbau

### `POST /api/world/extract`

Leitet Orte, Fraktionen, Magie, Artefakte und Lore aus einem vorhandenen Storyboard ab.
Bereits getrackte Einträge (optional in `knownEntries`) schickt der Server ins Modell und filtert
sie zusätzlich aus der Antwort — so entstehen bei wiederholten Scans keine Dubletten.

```json
{
  "storyboard": { … },
  "model": "<model-id>",
  "language": "German",
  "knownEntries": [{ "title": "Kinder der Asche", "category": "Fraktion" }]
}
```

**Response**

```json
{
  "world": {
    "locations": [{ "name": "…", "description": "…" }],
    "factions": [], "magic": [], "artifacts": [], "lore": []
  }
}
```

---

## Recherche

### `POST /api/research`

Tavily-Suche (serverseitiger Key).

```json
{ "query": "mittelalterliche Belagerungstechnik", "maxResults": 5 }
```

`maxResults` wird auf 1–10 geklemmt.

**Response**

```json
{
  "answer": "…",
  "results": [{ "title": "…", "url": "…", "content": "…" }]
}
```

---

## Cover

### `POST /api/cover`

Erzeugt ein Cover über Pollinations und **speichert es auf dem Server**.

```json
{ "prompt": "professional book cover art, …", "model": "black-forest-labs/flux.1-schnell", "width": 768, "height": 1024, "seed": 12345 }
```

`model` default: `black-forest-labs/flux.1-schnell`; `width/height` werden auf 256–1536 geklemmt;
`seed` default zufällig.

**Response:** `{ "url": "/covers/cover-…png" }`

---

### `POST /api/cover/save`

Speichert ein **fertig komponiertes** PNG (z. B. aus dem Cover-Text-Editor).

- **Content-Type:** `image/png`
- **Body:** rohe PNG-Bytes (max. 15 MB)

**Response:** `{ "url": "/covers/cover-…png" }`

---

### `GET /covers/:file`

Liefert ein gespeichertes Cover.

- Dateiname wird validiert (`[a-zA-Z0-9._-]+\.png`), kein Path-Traversal.
- Response: `image/png` mit `Cache-Control: public, max-age=31536000, immutable`.
- `404`, wenn nicht vorhanden.

---

### `DELETE /api/cover/:file`

Löscht eine Cover-Datei (`force` — fehlt sie, ist es trotzdem OK).

- Clientseitig wird das **nur** aufgerufen, wenn die Datei nirgends mehr referenziert wird
  (`lib/coverStore.ts`).
- **Response:** `{ "ok": true }`

---

## SPA

### `GET /*`

Liefert für alle übrigen Pfade die Single-Page-App (HTML-Bundle).

In Development aktiv: **HMR** und Browser-Console-Spiegelung (`development: { hmr, console }`).

---

## promptgen (eigener Server, Port 3001)

Das Paket `packages/promptgen` läuft eigenständig und bietet dieselben
Character-Routen unter eigener Basis:

- `GET /api/config`
- `POST /api/generate`

→ `http://localhost:3001`. Eigenständig nutzbar über `bun run --cwd packages/promptgen dev`.
