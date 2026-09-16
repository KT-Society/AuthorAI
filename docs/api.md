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
  "pollinations": true,
  "languages": ["German", "English", "Japanese", "French"],
  "defaultLanguage": "German"
}
```

Booleans spiegeln nur, **ob** Keys vorhanden sind — niemals deren Inhalt.

---

### `GET /api/provider`

Status des LLM-Anbieters — **ohne Key** (`hasKey` ist nur ein Boolean).

```json
{
  "mode": "custom",
  "baseUrl": "https://api.openai.com/v1",
  "hasKey": true,
  "openrouterAvailable": false,
  "effective": "custom",
  "effectiveBaseUrl": "https://api.openai.com/v1",
  "ready": true
}
```

`effective` berücksichtigt den Env-Override (`AUTHORAI_PROVIDER` / `AUTHORAI_BASE_URL` /
`AUTHORAI_API_KEY`).

### `PUT /api/provider`

Setzt die Konfiguration. Body: `{ mode: "openrouter" | "custom", baseUrl, apiKey? }`.

- `apiKey` nicht-leer → setzen · `null` → löschen · weglassen/leer → **behalten**
- ungültiges Schema (nicht `http(s)://`) → **HTTP 400**

Antwort wie `GET /api/provider`. Der Key wird **serverseitig** gespeichert und **nie**
zurückgegeben.

### `POST /api/provider/test`

Prüft **auch ungespeicherte** Werte gegen `{base}/models` (Key + URL gültig?).
Body: `{ mode?, baseUrl?, apiKey? }` → `{ ok: boolean, detail: string }`. Ohne `apiKey` wird der
gespeicherte bzw. der `.env`-Key benutzt.

---

## Charaktere

### `POST /api/generate`

Erzeugt über die promptgen-Engine (Tavily-Recherche + LLM-Anbieter) einen 12-teiligen
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
Live-Variante: `POST /api/characters/extract/stream` (JSONL, siehe Abschnitt „Streaming für Prüfungen & Extraktionen").

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

### `POST /api/continuity/extract/stream`

Leitet **Fakten** (zu Figuren und Welteinträgen) und **Beziehungen** (zwischen Figuren) aus dem
**Manuskript** ab — **Kapitel für Kapitel**, gestreamt (JSONL, ein Objekt pro Zeile). Jeder
Vorschlag muss ein **wörtliches Zitat** aus dem jeweiligen Kapitel mitbringen (`quote`): Der Server
prüft es gegen genau den Text, den das Modell gesehen hat, und **verwirft** Vorschläge mit
erfundenem, paraphrasiertem oder fehlendem Beleg. `establishedIn` setzt der Server selbst
(Kapitel-Label inkl. Titel). Die Antwort enthält **Namen**, keine IDs — die Zuordnung auf
Charakter-/Welt-IDs macht der Client (Review-Dialog vor der Übernahme).

**Request**

```json
{
  "chapters": [{ "title": "Der Aufbruch", "text": "…" }],
  "startChapter": 0,
  "characters": [{ "name": "Elias Thorne", "role": "Protagonist" }],
  "worldNames": ["Kinder der Asche"],
  "knownStatements": ["Elias ist Schmied."],
  "knownRelations": ["Elias→Sylar:distrust"],
  "model": "<model-id>",
  "language": "German"
}
```

`startChapter` ist der **Versatz** fürs Weiterlaufen: Wie viele Kapitel davor bereits gescannt
wurden (dann zählt der Server absolut — Kapitel 7 bleibt Kapitel 7).

**Ereignisse**

```
data: {"type":"chapter","index":3,"total":12}                     ← Kapitel wird jetzt gelesen
data: {"type":"item","item":"fact","raw":{ … }}                    ← Vorschlag (live, ungeprüft)
data: {"type":"item","item":"relation","raw":{ … }}
data: {"type":"chapterDone","index":3,"facts":2,"relations":1}     ← Kapitel ist durch
data: {"type":"warning","message":"Kapitel 4 (…): …"}              ← übersprungen, Lauf geht weiter
data: {"type":"done","facts":[ … ],"relations":[ … ],"warnings":[ … ]}
data: {"type":"error","error":"…"}
```

Lange Kapitel werden absatzsicher geteilt (~2.500 Wörter) und **je Teil** gegen dessen Text
geprüft. Zwei Absicherungen: Zeilen werden auch über **Chunk-Grenzen** hinweg zusammengesetzt, und
wenn das Modell JSONL ignoriert, fällt der Server auf normales JSON zurück. **Ein Kapitel kann den
Lauf nicht mehr zerreißen** — unbrauchbare Antworten landen als `warning` im Ergebnis, alles davor
bleibt erhalten. Ohne (nicht-leeren) Kapiteltext → **HTTP 400 vor dem Stream**.

### `POST /api/continuity/check`

**Fakten-Check**: prüft ein Kapitel **nur gegen den Kanon** — getrennt von der Kohärenz.
Das Kapitel wird serverseitig gechunkt und je Teil einmal geprüft.

**Request**

```json
{
  "storyboard": { … },
  "chapterIndex": 0,
  "text": "…",
  "canon": "CANON FACTS (binding):\n- [Elias] (eigenschaft) Elias ist 27 …",
  "model": "<model-id>",
  "language": "German"
}
```

**Response**

```json
{
  "ok": false,
  "summary": "2 Widersprüche zum Kanon gefunden.",
  "violations": [
    { "fact": "Elias ist 27", "quote": "Elias, ein alter Mann", "fix": "Alter korrigieren.", "part": 1 }
  ]
}
```

Ohne Kanon antwortet die Route mit **HTTP 400**, bei Token-Abbruch mit **HTTP 502**.
Der Aufruf ist **cachebar** (identische Prüfung = keine neuen Kosten).

### `POST /api/continuity/check/stream`

Prüft **alle Kapitel** in einem Aufruf und schickt jedes Ergebnis, sobald es fertig ist
(Server-Sent Events). Der Server arbeitet mit **begrenzter Parallelität** (`concurrency`,
Standard 3, max 6) — sequenziell wäre die Wartezeit die Summe aller Kapitel.

```json
{
  "storyboard": { … },
  "chapters": [{ "index": 0, "text": "…" }],
  "canon": "CANON FACTS (binding):\n…",
  "model": "<model-id>",
  "language": "German",
  "concurrency": 3
}
```

Ereignisse:

```
data: {"type":"started","chapterIndex":0}
data: {"type":"result","chapterIndex":0,"result":{ … }}
data: {"type":"result","chapterIndex":1,"error":"…"}   ← nur dieses Kapitel scheitert
data: {"type":"done"}
```

Fehlender Kanon oder fehlende Kapitel → **HTTP 400 vor dem Stream**; Fehler einzelner Kapitel
beenden den Lauf nicht.

### `POST /api/continuity/repair`

**Quick Fix**: behebt die gemeldeten Widersprüche in einem Kapitel. Nur Textteile, in denen
ein gemeldetes Zitat wirklich vorkommt, gehen ans Modell — alles andere bleibt wortgleich.
Ausgabelimit am Teil, Wachstumsgrenze ~⅓, abgeschnittene Antworten werden verworfen.

```json
{
  "storyboard": { … },
  "chapterIndex": 0,
  "text": "…",
  "violations": [{ "fact": "Elias ist 27", "quote": "Elias, ein alter Mann", "fix": "Alter korrigieren." }],
  "canon": "…",
  "model": "<model-id>",
  "language": "German"
}
```

```json
{ "text": "…korrigiert…", "changed": true, "applied": 1, "unassigned": 0 }
```

`unassigned` zählt Widersprüche, deren Stelle nicht sicher zugeordnet werden konnte (oder deren
Korrektur verworfen wurde) — die Oberfläche meldet das und prüft das Kapitel nach der Korrektur
**erneut**, damit kein alter Stand stehen bleibt.

### `POST /api/continuity/repair/stream`

Gestreamte Variante des Quick Fix für **mehrere** Kapitel: der Server korrigiert mit begrenzter
Parallelität (`concurrency`, Standard 2) und prüft jedes Kapitel **direkt danach erneut** — das
frische Prüfergebnis kommt mit demselben Ereignis zurück.

```json
{
  "storyboard": { … },
  "canon": "…",
  "model": "<model-id>",
  "language": "German",
  "chapters": [
    { "index": 0, "text": "…", "violations": [{ "fact": "…", "quote": "…", "fix": "…" }] }
  ],
  "concurrency": 2
}
```

```
data: {"type":"started","chapterIndex":0}
data: {"type":"result","chapterIndex":0,"text":"…","changed":true,"applied":1,"unassigned":0,"result":{ … }}
data: {"type":"result","chapterIndex":1,"error":"…"}
data: {"type":"done"}
```

Scheitert die **Nachprüfung**, wird die Korrektur trotzdem geliefert (`text`), im Ereignis steht
dann nur `error` — so geht keine Arbeit verloren. `POST /api/continuity/repair` bleibt als
nicht-streamende Variante für **ein** Kapitel bestehen.

---

### `POST /api/chapter/draft/stream` und `POST /api/chapter/expand/stream`

Streaming-Varianten von `chapter/draft` und `chapter/expand` (Server-Sent Events). Gleiche
Validierung und gleicher Body; die Antwort ist `text/event-stream` mit:

```
data: {"type":"delta","text":"…"}      ← Textstück für die Live-Vorschau
data: {"type":"done","text":"…"}       ← fertiger (nachbearbeiteter) Text
data: {"type":"error","error":"…"}     ← Fehler nach dem Start (HTTP bleibt 200)
```

**Fehler vor dem Start** (fehlendes Model, ungültiges Storyboard) kommen weiterhin als
**HTTP 400 + JSON**. Liefert der Provider kein SSE, fällt der Server intern auf den normalen
Aufruf zurück — der Client bekommt dann nur das `done`-Ereignis.

Beim **Ausbau** (`…/expand/stream`) streamt nicht nur die erste Antwort: Der **Continuation-Loop**
(bis zu 3 Fortsetzungen) und die abschließende Satz-Vervollständigung melden ihre Textstücke über
denselben Kanal, damit die Vorschau bis zum Kapitelende mitwächst. `targetWords` ist optional und
nutzt denselben Standard wie `/api/chapter/expand` (`EXPAND_DEFAULT_WORDS`, 4.000).

### `POST /api/chapter/consistency/stream` und `POST /api/chapter/style/stream`

Streaming-Varianten der beiden Überarbeitungen. Der Server **chunkt** das Kapitel wie bisher
(~1.000 Wörter je Teil) und schickt Teil-Ereignisse, damit die Vorschau mitwächst; am Ende kommt
das vollständige Ergebnis samt Notizen. Gleiche Sicherungen wie ohne Streaming (Wachstumsgrenze,
Fortsetzung nur bei hartem Token-Limit) — es gibt deshalb **keine** stillen Änderungen.

```
data: {"type":"part-start","part":1,"parts":4}
data: {"type":"part-delta","text":"…"}      ← Textstück des laufenden Teils
data: {"type":"part-done","part":1,"text":"…"}   ← fertiger (geprüfter) Teil
data: {"type":"done","text":"…","notes":["…"],"changed":true}
data: {"type":"error","error":"…"}          ← z. B. „Teil 2 von 4 wurde stark gekürzt"
```

Fehlender Kapiteltext oder Model → **HTTP 400 vor dem Stream**. Die nicht-streamenden Routen
(`/api/chapter/consistency`, `/api/chapter/style`) bleiben unverändert bestehen.

### `GET | PUT | DELETE /api/state`

Fachdaten-Speicher (SQLite). **Der einzige Weg** an die Datenbank — der Client liest beim Start
einmal alles und schreibt gebündelt zurück.

| Methode | Request | Antwort |
| --- | --- | --- |
| `GET` | `?profile=<id>` | `{ "collections": { "books": […], … } }` |
| `PUT` | `{ profileId, collection, value }` | `{ ok, bytes, updatedAt }` |
| `PUT` | `{ profileId, entries: { books: […], … } }` | `{ ok, written }` (Bulk, für Migration/Backup) |
| `DELETE` | `?profile=<id>` | `{ ok, deleted }` |

Unbekannte Sammlungen → **HTTP 400**; im Bulk werden sie still übersprungen (Whitelist in
`src/data/state.ts`). Es gibt **kein Size-Limit** — ein 1-MB-Buch ist ein normaler Schreibvorgang
(vorher scheiterte genau das am ~5-MB-`localStorage`).

### `GET /api/store/info`

Belegung der Datenbank für die Einstellungen: `{ file, sizeBytes, profiles, totalRows, rows[] }`.
`sizeBytes` enthält **auch** `-wal`/`-shm` (WAL schreibt verzögert — sonst wäre die Anzeige zu
klein).

---

## Buch-Pipeline
### `POST /api/storyboard`

Zweiphasige Storyboard-Erzeugung (Outline + gechunkte Details). Mit `seriesContext` entsteht ein
**Folgeband**: die Vorbände (Titel, Handlung, Figuren, Schauplätze) und ihr Kanon gehen in beide
Phasen ein, damit die Reihe fortgeführt statt neu erzählt wird.

**Request**

```json
{
  "idea": "…",
  "model": "<model-id>",
  "language": "German",
  "chapters": 30,
  "seriesContext": "SERIES: this book is the next volume of „…\" … (optional)"
}
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

### `POST /api/storyboard/stream`

Streaming-Variante des Storyboard-Entwurfs (Server-Sent Events). Gleicher Body und gleiche
Validierung wie `POST /api/storyboard`; die Antwort ist `text/event-stream` mit **Fortschritt
statt Text** (die Modellantworten sind JSON — ein Prosa-Delta wäre wertlos):

```
data: {"type":"phase","phase":"outline"}        ← Metadaten + Kapiteltitel
data: {"type":"titles","titles":["…","…"]}      ← Titelliste steht fest
data: {"type":"phase","phase":"chapters"}       ← Kapitel-Details (Batches)
data: {"type":"batch","done":1,"total":3}       ← ein Detail-Batch ist fertig
data: {"type":"done","storyboard":{…}}          ← fertiges Storyboard
data: {"type":"error","error":"…"}              ← Fehler nach dem Start (HTTP bleibt 200)
```

Fehlende Idee oder fehlendes Model → **HTTP 400 vor dem Stream**. Die nicht-streamende Route
bleibt unverändert bestehen.

### Streaming für Prüfungen & Extraktionen (JSONL)

Vier Routen haben eine `…/stream`-Variante, die das Modell um **JSONL** bittet (ein Objekt pro
Zeile). Jeder fertige Eintrag kommt sofort als eigenes Ereignis, am Ende folgt die **validierte**
Fassung — identisch zum Nicht-Streaming-Ergebnis (gleiche Normalisierung, Filterung, Dedupe).

```json
data: {"type":"finding","finding":{"chapter":2,"scene":1,"issue":"…","fix":"…"}}
data: {"type":"done","summary":"…","findings":[ … ]}
```

| Route | Ereignisse | `done`-Feld |
| --- | --- | --- |
| `POST /api/timeline/check/stream` | `finding` (je Befund) | `summary`, `findings` |
| `POST /api/timeline/repair/stream` | `chapter` (`raw`: Kapitel-Vorschlag) | `fixes`, `notes` |
| `POST /api/world/extract/stream` | `entry` (`category`, `name`, `description`) | `world` |
| `POST /api/characters/extract/stream` | `character` (`{name, role, description}`) | `characters` |

Body und Validierung entsprechen exakt der jeweiligen Nicht-Streaming-Route. Die **Live-Objekte
sind Rohdaten des Modells** und damit ungeprüft (z. B. kann eine genannte Szene außerhalb des
Kapitels liegen oder ein Kapitel fehlen); verbindlich ist ausschließlich der `done`-Inhalt.
Liefert das Modell trotzdem ein einzelnes JSON-Dokument, greift derselbe Weg wie ohne Streaming
(dann kommen nur `done`-Ereignisse).

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
{
  "summary": "…",
  "findings": [
    { "chapter": 3, "scene": 2, "issue": "Rückwärtssprung: …", "fix": "Szene 2 auf Tag 3 verschieben." }
  ]
}
```

`findings` ist leer, wenn die Chronologie konsistent ist. `chapter`/`scene` sind **1-basiert**,
`chapter: 0` heißt „nicht zuordenbar", `scene` fehlt bei kapitelweiten Problemen. Antworten mit
reinen Strings werden weiterhin akzeptiert (die Kapitelnummer wird dann aus dem Text gelesen).
Live-Variante: `POST /api/timeline/check/stream` (JSONL, Befunde einzeln — siehe Abschnitt „Streaming für Prüfungen & Extraktionen").

### `POST /api/timeline/repair`

Quick Fix der Chronologie: korrigiert die **Szenen-Struktur** (Zeit, Schauplatz, Szenen-Text) der
gemeldeten Widersprüche — genau die Daten, die `timeline/check` liest. Ein Aufruf, kein Streaming
(die Korrektur ist klein). Der Server prüft alle Nummern gegen Storyboard und Szenen-Matrix und
meldet **nur tatsächliche Änderungen** zurück.

```json
{
  "storyboard": { … },
  "scenesByChapter": [[{ "text": "…", "characters": [], "time": "Tag 1", "setting": "Hafen" }]],
  "findings": [{ "chapter": 1, "scene": 2, "issue": "…", "fix": "…" }],
  "model": "<model-id>",
  "language": "German",
  "canon": "… (optional)"
}
```

**Response**

```json
{
  "fixes": [
    { "chapter": 1, "note": "Zeiten angeglichen",
      "scenes": [{ "scene": 2, "time": "Tag 3", "setting": "Bucht", "text": "…" }] }
  ],
  "notes": ["Nicht reparierbare Hinweise (optional)"]
}
```

In `scenes` stehen **nur die geänderten Felder** — fehlt `time`, bleibt die Zeit; fehlt `text`,
bleibt der Szenen-Text. Unbekannte Kapitel/Szenen und unveränderte Werte werden verworfen (leeres
`fixes` = nichts zu tun). Keine Befunde oder fehlendes Model → **HTTP 400** (vor dem Modell-Aufruf).
Live-Variante: `POST /api/timeline/repair/stream` (JSONL, ein Ereignis je Kapitel — siehe Abschnitt „Streaming für Prüfungen & Extraktionen").

---

## Weltenbau

### `POST /api/storyboard/derive/stream`

Gegenrichtung zu `POST /api/storyboard`: leitet die Storyboard-Angaben aus einem **fertigen
Manuskript** ab (für importierte Bücher). **Gechunkt und gestreamt** (SSE, JSONL-basiert) — ein
Aufruf über alle Kapitel würde bei längeren Büchern ins Ausgabelimit laufen, deshalb zwei Phasen
und Batches à 8 Kapitel.

**Request**

```json
{
  "title": "Mein Buch",
  "genre": "Roman",
  "chapters": [{ "title": "Kapitel 1", "text": "…" }],
  "model": "<model-id>",
  "language": "German",
  "seriesContext": "… (optional)"
}
```

**Ereignisse**

```json
data: {"type":"start","chapters":40,"batches":5}
data: {"type":"phase","phase":"meta"}                       ← Phase 1: Meta + Figuren
data: {"type":"meta","meta":{ … }}
data: {"type":"character","character":{"name":"…","role":"…","description":"…"}}
data: {"type":"phase","phase":"chapters"}                   ← Phase 2: Kapitel-Batches
data: {"type":"chapter","plan":{"index":2,"summary":"…","pov":"…","setting":"…","foreshadowing":["…"]}}
data: {"type":"batch","done":1,"total":5}
data: {"type":"done","meta":{ … },"characters":[ … ],"chapters":[ … ]}
```

Live-Objekte sind **ungeprüft**; verbindlich ist `done`. `themes` ist auf 6 Einträge begrenzt,
`characters` auf 40, Dubletten nach Namen fallen weg. Kapitel werden über ihre Nummer zugeordnet —
fehlende Einträge bleiben **leer** statt zu verrutschen (ein Modell, das Kapitel auslässt, ergibt
also keine verschobenen Kurzfassungen). Ohne Manuskript-Text → **HTTP 400 vor dem Stream**
(leeres `chapters` ist ein Aufrufer-Fehler, kein Stream-Fall).

### `POST /api/chapter/scenes/stream`

Leitet die **Szenen eines Kapitels** aus seiner Prosa ab (Beats mit Zeit, Schauplatz, POV) — die
Grundlage für Timeline-Prüfung und Szenen-Editor. Gestreamt (JSONL); lange Kapitel zerlegt der
Server vorher **absatzsicher** in Teile von ~2.500 Wörtern. Für ein ganzes Buch läuft das im
Editor als Job über alle Kapitel.

**Request**

```json
{
  "chapterTitle": "Kapitel 1",
  "text": "… voller Kapiteltext …",
  "hint": "… Kurzfassung als Kontext (optional) …",
  "model": "<model-id>",
  "language": "German"
}
```

**Ereignisse**

```json
data: {"type":"start","parts":2}
data: {"type":"part","done":1,"total":2}                    ← bei mehrteiligen Kapiteln
data: {"type":"scene","scene":{"text":"…","time":"…","setting":"…","pov":"…"}}
data: {"type":"done","scenes":[ … ]}
```

`text` ist eine **Plan-Zeile** (max ~25 Wörter), nicht die Prosa. `time`/`setting`/`pov` sind leer,
wenn der Text sie nicht hergibt. Szenen ohne `text` werden verworfen; identische Zeilen über eine
Teil-Grenze hinweg werden **nicht** gedoppelt (live wie im Ergebnis). Liefert das Modell **keine**
Szenen → **502**; leerer Kapiteltext → **HTTP 400** (ohne Modell-Aufruf).

### `POST /api/world/extract`

Leitet Orte, Fraktionen, Magie, Artefakte und Lore aus einem vorhandenen Storyboard ab.
Bereits getrackte Einträge (optional in `knownEntries`) schickt der Server ins Modell und filtert
sie zusätzlich aus der Antwort — so entstehen bei wiederholten Scans keine Dubletten.
Live-Variante: `POST /api/world/extract/stream` (JSONL, Vorschlag für Vorschlag — siehe Abschnitt „Streaming für Prüfungen & Extraktionen").

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

