# Changelog

Alle nennenswerten Änderungen an AuthorAI.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/), Versionierung nach
[Semantic Versioning](https://semver.org/lang/de/).

---

## [Unreleased]

### Kanon-Extraktion: belegt statt geraten

- **Fixed** **„Ich kann den Scan 20× machen und finde immer etwas anderes"**: Das war kein
  Modell-Problem, sondern ein Denkfehler in der Quelle. Die Extraktion bekam das **Storyboard**
  (Kurzfassungen, Figurenbeschreibungen, Synopsis) — daraus *musste* das Modell konkrete „Fakten"
  erfinden, und jeder Lauf erfand andere. Folgen: der Kanon füllte sich mit Behauptungen, und der
  Fakten-Check meldete bei jedem Durchlauf andere „Widersprüche" gegen diese Behauptungen.
  Jetzt liest die Extraktion den **Manuskript-Text, Kapitel für Kapitel**.
- **Added** **Belegpflicht — kein Fakt ohne Textbeleg**: Jeder Vorschlag muss ein **wörtliches
  Zitat** aus dem jeweiligen Kapitel mitbringen (5–25 Wörter). Der Server prüft jeden Beleg gegen
  genau den Text, den das Modell gesehen hat, und **verwirft** Vorschläge mit erfundenem,
  paraphrasiertem oder fehlendem Beleg. Der Vergleich toleriert Weißraum, Zeichensetzung und
  typografische Anführungszeichen (bekannte Falle in diesem Repo), aber keine Umformulierung.
  Damit ist der Kanon **nachprüfbar**: Der Beleg wird im Vorschlagsdialog mit angezeigt und im
  Fakt gespeichert (`CanonFact.quote`).
- **Changed** **Kapitel für Kapitel mit wachsendem Kontext**: Die Extraktion läuft je Kapitel
  (lange Kapitel absatzsicher geteilt, ~2.500 Wörter), meldet den Fortschritt
  („Kapitel 3/12 wird gelesen…") und gibt die bereits gefundenen Aussagen als „ALREADY TRACKED"
  in die folgenden Kapitel. `establishedIn` setzt jetzt **der Server** auf das gelesene Kapitel
  (mit Titel) — vorher war es eine Angabe des Modells.
- **Changed** **Ohne Manuskript keine Fakten**: Ein Projekt ohne geschriebenen Text wird mit einer
  klaren Meldung abgewiesen (HTTP 400, kein Modell-Aufruf), statt Fakten aus dem Plan zu erfinden.
  Die Route nimmt dafür `chapters` statt `storyboard`.

### Bereiche leeren („Alle löschen")

- **Added** **„Alle löschen" in Charaktere, Weltenbau und Kontinuität**: Die drei Bereiche haben
  jetzt einen Button im Kopf (`Trash2`, deaktiviert wenn leer) — mit **Rückfrage**, die Anzahl und
  Folgen nennt. Gelöscht wird mit **Kettenwirkung**: Figuren nehmen ihre Fakten und Beziehungen mit,
  Welteneinträge ihre Fakten, der Kanon beide Sammlungen. Die Storyboards der Projekte bleiben
  unangetastet; alles lässt sich dort (bzw. bei Figuren über die Figuren-Extraktion) neu ableiten.
- **Fixed** **Gelöschtes kam beim nächsten Start zurück**: Die Shell spiegelt fehlende
  Storyboard-Daten (Figuren, Weltenbau, Plot-Karten) bei **jedem** Start nach — ein geleerter
  Bereich wäre also beim nächsten Öffnen wieder aufgetaucht. Jedes Buch trägt jetzt den Merker
  **`storyboardImported`**: Gespiegelt wird nur, was noch keinen Merker hat, danach ist das Buch
  „erledigt". Damit ist „Alle löschen" dauerhaft, und auch **einzeln** gelöschte Figuren bzw.
  Welteneinträge bleiben gelöscht (vorher wurden sie beim nächsten Start nachgezogen). Bestehende
  Profile werden beim ersten Start nach dem Update einmalig markiert — dort ändert sich nichts.
- **Changed** **Leeren bleibt leer**: Eine bewusst geleerte Sammlung bleibt leer (Regel „`[]` =
  bewusst geleert"), es greifen also weder Seeds noch Storyboard-Ableitung.

### Manuskript-Import (Markdown)

- **Added** **Vorhandene Manuskripte importieren**: In der **Bibliothek** und in der Top-Bar gibt
  es jetzt **„Importieren"**. Der Dialog liest eine Markdown- oder Textdatei **im Browser**
  (nichts wird hochgeladen), zeigt vor dem Anlegen eine Vorschau — erkannte Kapitel mit
  Wortzahlen, Titel/Untertitel/Genre editierbar, Hinweise — und legt daraus ein **vollständiges
  Projekt** an: Manuskript, Storyboard mit Kapitelplan, Zählwerte und Ziel-Wörter. Ab da ist es
  ein ganz normales Buch: bearbeiten, Kohärenz/Stil prüfen, Fakten-Check, Figuren/Weltenbau
  ableiten, exportieren. Ursache: Bisher gab es nur den Weg über den Assistenten — ein Autor mit
  fertigem Manuskript hätte alles neu schreiben müssen.
- **Added** **Round-Trip mit dem eigenen Export**: Der Import erkennt die Form von
  `lib/markdown.ts` **exakt** (`# Titel`, optional `## Untertitel`, `*Genre · n Wörter ·
  n Kapitel*`, `> Synopsis`, `` `tag` ``, `---` + `## Kapitel n: Titel`) — ein aus AuthorAI
  exportiertes Manuskript kommt also verlustfrei zurück (Titel, Untertitel, Genre, Tags,
  Synopsis, Kapitel, Wortzahlen). Auch der **TXT-Export** wird gelesen (Kapitel als
  `Kapitel n: Titel`-Zeilen).
- **Added** **Fremde Manuskripte**: Kapitel werden heuristisch erkannt — die häufigste
  Überschriftsebene ist die Kapitel-Ebene, eine Überschrift darüber ist der Titel, Szenentrenner
  (`***`, `---`, `* * *`, `— — —`) werden zu **Szenen**, YAML-Frontmatter (`title`, `genre`,
  `tags`, `synopsis`) übernommen. Inline-Auszeichnung (`**fett**`, Links, Code) wird entfernt,
  die Prosa bleibt; `Neo_Kyoto` & Co. überleben. Ist gar keine Struktur da, wird alles **ein**
  Kapitel plus Hinweis — nichts geht verloren.
- **Added** **Szenen aus Szenentrennern** (abschaltbar): Jede Szene wird zu einem Beat mit dem
  ersten Satz des Abschnitts als Text — damit funktionieren **Timeline-Prüfung** und der
  Szenen-Editor auch für importierte Bücher.
- **Changed** **Ein Ort für Slug und Cover-Farben**: `slugify` (jetzt `lib/slug.ts`) und die
  Cover-Palette (jetzt `data/cover.ts`) lagen im Wizard — der Import braucht beides, also teilen
  sich Wizard und Import eine Quelle.
- **Fixed** **Kapitelnummern-Dubletten beim Re-Import**: Ein Export-Titel lautet
  `## Kapitel 1: Der Aufbruch` — der Parser entfernt die Numerierung (auch mehrfach gestapelt:
  „2. Kapitel: Das Ende"), sonst hieße das Kapitel nach dem Import „Kapitel 1: Kapitel 1:
  Der Aufbruch".

### Struktur aus dem Manuskript ableiten (Storyboard & Szenen)

- **Fixed** **„Storyboard-Ableitung wurde vom Token-Limit abgeschnitten"**: Ich hatte für das
  ganze Buch **einen** Aufruf gemacht — bei 40+ Kapiteln läuft jede Antwort zwangsläufig ins
  Ausgabelimit, egal welches Modell. Jetzt ist die Ableitung **gechunkt** wie die
  Storyboard-*Generierung*: Phase 1 liefert Metadaten + Figurenliste, Phase 2 die Kapitelpläne in
  **Batches à 8**. Jede Antwort bleibt klein, das Limit ist kein Thema mehr.
- **Added** **Beide Ableitungen sind jetzt gestreamt** (`/api/storyboard/derive/stream`,
  `/api/chapter/scenes/stream`, JSONL): Metadaten, **Figuren** und **Kapitel-Kurzfassungen**
  treffen einzeln ein und wachsen in der **Live-Vorschau** im Buch-Editor mit; lange Kapitel
  werden bei der Szenen-Ableitung in Teile zerlegt (je ~2.500 Wörter, absatzsicher) und der
  Teil-Fortschritt wird angezeigt. Dazu ein **Job** im Job-Center: Fortschritt über die Batches
  (`Kapitel-Batch 3/6`) bzw. `N Szenen` je Kapitel.
- **Added** **„Storyboard ableiten"** im Buch-Editor: Liest das Manuskript und füllt, was ein
  importiertes Buch nicht hat — **Titel/Untertitel/Genre/Logline/Synopsis/Themen/Ton/POV**,
  eine **Figurenliste** und je Kapitel **Kurzfassung, POV, Schauplatz, Foreshadowing**. Vorhandene
  Angaben werden nur nach Rückfrage überschrieben (Abbruch = nur leere Felder füllen); Szenen-Beats
  bleiben unangetastet. Ursache: Der Import kennt nur den Text — Kurzfassungen stammen dort aus dem
  Textanfang, POV/Schauplatz sind leer, und ohne Kurzfassungen haben Prüf-Prompts und Plot-Board
  nichts zu lesen.
- **Added** **„Szenen ableiten"** (je Kapitel im Szenen-Bereich **und** für alle Kapitel als
  **Job** im Job-Center): gliedert den Kapiteltext in Beats — eine kurze Plan-Zeile je Szene, dazu
  **Zeit, Schauplatz und POV**, aber nur wenn der Text sie hergibt. Damit funktionieren
  **Timeline-Prüfung** und Szenen-Editor auch für Bücher, deren Markdown keine Szenentrenner hat
  (bisher kamen Szenen nur daraus).
- **Added** **Routen `POST /api/storyboard/derive/stream` und `POST /api/chapter/scenes/stream`**:
  die Gegenrichtung zur Generierung. Beide nutzen das **Storyboard-Model**. Serverseitig robust:
  Kapitel werden über ihre Nummer zugeordnet (fehlende Einträge bleiben leer statt zu verrutschen),
  leere Szenen ohne Text fallen weg, und ohne Manuskript-Text bzw. ohne Kapiteltext passiert
  **kein** Modell-Aufruf (HTTP 400 vor dem Stream).
- **Added** **Abgeleitetes Personal landet in den Ansichten**: Ein abgeleitetes Storyboard läuft
  durch dieselbe Ableitung wie beim Anlegen eines Buchs (`collectMissingCharacters/-World/-Plot`)
  — die Figuren aus dem Manuskript tauchen also direkt in „Charaktere", „Weltenbau" und im
  Plot-Board auf, statt erst nach einem Neustart.

### Live-Vorschläge für Prüfungen und Extraktionen

- **Added** **Vier weitere Routen streamen jetzt live**: `POST /api/timeline/check`,
  `POST /api/timeline/repair`, `POST /api/world/extract` und `POST /api/characters/extract`
  haben je eine `…/stream`-Variante. Das Modell liefert dafür **JSONL** (ein Objekt pro Zeile),
  der Server meldet jedes fertige Objekt sofort und am Ende die **validierte** Fassung. Wirkung:
  Die Timeline zeigt ihre Befunde während der Prüfung (bei langen Büchern ist der Gesamtlauf
  spürbar), der Quick Fix füllt die Vorschau Kapitel für Kapitel, und die Review-Dialoge von
  Weltenbau und Figuren füllen sich live, statt bis zum Ende auf einen Spinner zu schauen.
  Ursache: Diese vier Läufe waren die letzten Einzelaufrufe über große Eingaben — alles andere
  (Prosa, Storyboard, Fakten-Check, Kontinuitäts-Extraktion) streamte bereits.
- **Added** **Gemeinsamer JSONL-Baustein** (`src/server/jsonl.ts`): tolerantes Zeilen-Parsing
  (Modelle schmuggeln gern Fences, Kommas oder Klammern mit), Puffer über Textstück-Grenzen und
  der Formatblock für Stream-Prompts. Die Kontinuitäts-Extraktion nutzt ihn jetzt ebenfalls —
  vorher lag derselbe Parser privat in `continuity.ts`.
- **Changed** **Prompts ohne Drift**: Für jede der vier Routen liegt der Auftrag samt Feldregeln
  in **einem** geteilten Brief (`timelineCheckBrief`, `timelineRepairBrief`, `worldBrief`,
  `characterExtractBrief`); die JSON- und die JSONL-Variante hängen nur ihr Ausgabeformat an.
  Damit können Prüf- und Stream-Variante nicht mehr auseinanderlaufen.
- **Added** **Fallback bleibt** — schickt das Modell statt JSONL ein einzelnes JSON-Dokument
  (oder Prosa mit JSON darin), antwortet die Route wie bisher; geprüft im Integrationstest.
- **Fixed** **Live-Wachstum verwirft keine Auswahl mehr**: Die Review-Dialoge von Weltenbau und
  Figuren setzten ihre Auswahl bei **jedem** neuen Vorschlag zurück (Effekt auf
  `[open, candidates]`) — beim Streaming hätte das jede Nutzerentscheidung gelöscht. Sie
  reagieren jetzt nur noch auf das Öffnen, und neu eintreffende Vorschläge erhalten wie bisher
  die Vorauswahl (ähnliche bleiben abgewählt). Die Timeline-Korrektur-Vorschau merkt sich
  entsprechend **abgewählte** statt ausgewählter Kapitel.
- **Added** **Sperren während des Sammelns**: Solange Vorschläge eintreffen, sind Übernehmen,
  Verwerfen, Abbrechen und Escape gesperrt — geschrieben wird erst gegen die validierte Fassung,
  nicht gegen halbfertige Live-Objekte.
- **Fixed** **„Das Weltenbau-JSON war ungültig" / „invalid JSON (Figuren-Extraktion)" trotz
  korrekter Modellantwort**: Bei Anbietern **ohne echten SSE-Strom** (Antwort kommt als normales
  JSON oder der Stream ist leer) fiel `chatCompletionStream` still auf einen normalen Aufruf
  zurück und rief den Callback **nicht** — der JSONL-Sammler blieb leer, und die Route versuchte
  anschließend, die JSONL-Antwort als **ein** JSON-Dokument zu parsen. Das Modell war unschuldig,
  die Antwort landete nur im Papierkorb. Zwei Korrekturen: (1) der Rückfall auf den normalen
  Aufruf bedient den Callback jetzt mit dem fertigen Text (gilt für **alle** Stream-Routen —
  auch Prosa-Vorschauen funktionieren damit ohne SSE), (2) die vier JSONL-Routen verarbeiten den
  fertigen Text notfalls **nachträglich** durch denselben Zeilen-Parser
  (`consumeJsonlText`), bevor sie auf ein JSON-Dokument zurückfallen.

---

## [0.5.5] — 2026-09-14

### Timeline: Quick Fix für die Chronologie

- **Added** **Quick Fix im Timeline-Dialog**: Der Knopf neben „Erneut prüfen" schlägt je Kapitel
  konkrete Korrekturen der **Szenen-Struktur** vor (Zeit, Schauplatz, Szenen-Text) — mit
  Diff-Vorschau und Kapitel-Auswahl, geschrieben wird erst nach Bestätigung. Damit hat die
  Timeline denselben Weg wie der Fakten-Check: prüfen → reparieren → gegenprüfen. Nach dem
  Übernehmen läuft die Prüfung automatisch neu.
  *Bewusst ohne Versions-Snapshot:* Die Kapitel-Version speichert nur Rohtext und Ausbau — der
  Fix ändert dagegen die Struktur (`sceneMeta`, Storyboard-Beats), ein Versionseintrag enthielte
  davon nichts. Die Sicherung ist die Diff-Vorschau (Rückholbarkeit steht als Roadmap-Idee).
- **Changed** **Timeline-Befunde sind jetzt strukturiert**: `findings` liefert statt Freitext
  Objekte `{ chapter, scene, issue, fix }`. Ursache: Die Zuordnung „Befund → Kapitel" wurde
  clientseitig aus dem Text geraten (`includes("Kapitel N")`) — bei englischen Befunden oder
  anderer Schreibweise blieb die Kapitel-Markierung aus, und eine Korrektur war gar nicht
  adressierbar. Wirkung: Kapitel werden exakt markiert (inkl. Szenennummer), der Vorschlag des
  Modells wird sichtbar, und die Korrektur kennt ihr Ziel. Alte Antworten mit reinen Strings
  werden weiterhin verarbeitet (Kapitelnummer wird dann aus dem Text gelesen).
- **Added** **Route `POST /api/timeline/repair`**: korrigiert die Struktur der gemeldeten
  Widersprüche in **einem** Aufruf (die Prüfung liest die Struktur, nicht den Fließtext).
  Serverseitig geprüft: unbekannte Kapitel/Szenen fliegen raus, unveränderte Werte werden gar
  nicht erst gemeldet — das Modell listet gern auch Unverändertes.
- **Added** **Diff-Vorschau** `TimelineRepairPreviewDialog` (Zeit/Schauplatz als Vorher → Nachher,
  Szenen-Text als Wort-Diff), spiegelbildlich zur Fakten-Korrektur.

### Live-Vorschau überall & Fortschritt im Job-Center

- **Added** **Storyboard-Entwurf mit Live-Fortschritt** (`POST /api/storyboard/stream`): Der
  Entwurf läuft in zwei Phasen (Outline, dann Kapitel-Details in Batches) — der Assistent nennt
  jetzt die laufende Phase, zeigt die **Kapiteltitel, sobald sie feststehen**, und füllt den
  **Batch-Fortschrittsbalken** (z. B. „2/3"). Vorher stand dort nur „Storyboard wird entworfen…".
  Die Antworten sind JSON, deshalb gibt es bewusst **kein** Text-Delta (rohes JSON als Vorschau
  wäre wertlos); gemeldet werden `phase`, `titles`, `batch` und am Ende das fertige Storyboard.
- **Added** **Rohentwurf im Assistenten streamt**: Einzelkapitel und „Alle Rohentwürfe
  generieren" nutzen jetzt die SSE-Route (`/api/chapter/draft/stream`) und zeigen den Text beim
  Entstehen („Rohentwurf · Kapitel 2/12"); der Editor tat das schon.
- **Added** **Live-Text auch beim Ausbau-Queue-Lauf**: **„Alles ausbauen"** schreibt das laufende
  Kapitel jetzt mit, statt nur „Kapitel 3" zu melden — dasselbe Verhalten wie beim Einzel-Ausbau
  (die Vorschau zeigt Wortstand und Kapitel, z. B. „Ausbau · Kapitel 2/7").
- **Fixed** **Die Live-Vorschau bricht nicht mehr nach der ersten Modellantwort ab**: Der
  **Continuation-Loop** des Ausbaus (bis zu 3 Fortsetzungen) und die abschließende
  Satz-Vervollständigung (`completeProse`) liefen bisher **ohne** Callback — der gestreamte Text
  endete mitten im Kapitel, obwohl der Server weiter Text anhängte. Beide rufen den Provider jetzt
  ebenfalls gestreamt auf, wenn eine Vorschau angefordert ist. Das gilt auch für die
  Fortsetzungen der Kohärenz-/Stil-Teile.
- **Added** **Fortschritt im Job-Center während des Streams**: Laufende Jobs nennen jetzt den
  Live-Stand der Vorschau — z. B. **„Kapitel 3 · Teil 2/5 · 1.240 Wörter"** bzw.
  **„Kapitel 2 · Ausbau · 2.400 Wörter"** statt nur „prüft…". Neues `Job.detail`-Feld plus
  gedrosselter Schreiber (`createJobStreamReporter`): gemeldet wird höchstens alle ~300 ms (das
  erste Stück sofort), und Wörter werden über den **gesamten** Text gezählt — Wortfragmente aus
  dem Token-Stream zählen nicht doppelt. Ohne Drosselung würde jedes Textstück das Job-Center neu
  rendern.
- **Added** **Assistent streamt ebenfalls**: Die Schritte **Kohärenz** und **Stil** im
  Buch-Assistenten nutzen jetzt die SSE-Routen (vorher nur die nicht-streamenden) und zeigen den
  entstehenden Text in einer Live-Vorschau („Kohärenz · Teil 2/5"); der **Ausbau** (einzeln und
  „Alle ausbauen") streamt dort ebenso.
- **Added** **Gemeinsame Vorschau-Komponente** `StreamPreview`: Wortstand, Schritt-Info und
  wachsender Text in einem Baustein — Buch-Editor und Assistent teilen ihn (vorher war die
  Vorschau nur im Editor fest verdrahtet). Fürs Storyboard zeigt sie eine **Titelliste** statt
  Prosa (ohne Wortzahl).
- **Fixed** **Assistent: Ausbau berücksichtigt den Kanon**: „Alle ausbauen" im Wizard schickte
  den Kanon-Block (Fakten + Beziehungen) nicht mit, anders als der Einzel-Ausbau — jetzt tun es
  beide.
- **Changed** **Einheitlicher Standard für die Ausbau-Zielwörter**: Die Streaming-Route lag bei
  1.200 Wörtern, die nicht-streamende bei 4.000 — beide nutzen jetzt `EXPAND_DEFAULT_WORDS`
  (4.000). Die Oberfläche schickt den Wert ohnehin immer mit.

### Assistent: Fakten-Check & Wiedereinstieg

- **Added** **Fakten-Check als letzter Wizard-Schritt**: Der Buch-Assistent hat jetzt den Schritt
  **„Fakten"**. Er prüft die ausgebauten Kapitel gegen den Kanon — direkt im Assistenten, ohne dass
  das Buch schon gespeichert sein muss. Korrekturen laufen über die vorhandene **Diff-Vorschau**,
  und die Ergebnisse wandern in die **Prüf-Historie** der Kapitel.
- **Added** **Einzelkapitel-Fakten-Check**: Neben **„Stil"** in der Kapitel-Aktionsleiste steht
  jetzt **„Fakten-Check"** — er prüft **nur dieses Kapitel** gegen den Kanon (gleicher Dialog,
  gleiche Diff-Vorschau). Der Button im oberen Aktionen-Band prüft weiterhin **alle** Kapitel.
- **Added** **Wiedereinstieg in den Assistenten**: Über **„Assistent"** im Buch-Editor lässt sich
  ein gespeichertes Buch erneut öffnen. Der Assistent lädt Storyboard, Rohentwurf, Ausbau,
  Prüf-Flags, Cover und Ziel-Wörter und springt auf den **letzten erledigten Schritt**.
- **Fixed** **Kein Duplikat beim Speichern aus dem Assistenten**: Beim Wiedereinstieg behält das
  Speichern die **vorhandene Buch-ID** und die Cover-Farben — das Buch wird **aktualisiert** statt
  ein zweites angelegt (vorher erzeugte jeder Speichervorgang ein neues Buch).

### Eigener LLM-Anbieter

- **Added** **Anbieter-Umschalter (OpenRouter ⇄ eigener OpenAI-kompatibler Anbieter)** in den
  Einstellungen. Bei „Eigener Anbieter" lassen sich **Base-URL** und **API-Key** eingeben und mit
  einem Klick **testen** (`{base}/models`); die Model-IDs je Stufe bleiben Freitext und müssen zum
  Anbieter passen.
- **Added** **Routen** `GET|PUT /api/provider` und `POST /api/provider/test`.
- **Sicherheit**: Der Key kommt einmalig vom Browser zum lokalen Server und wird **serverseitig**
  in einer eigenen Tabelle `provider` gespeichert — **nicht** in `state`, also nicht über
  `/api/state` lesbar und nicht in Client-Backups enthalten. `GET /api/provider` liefert nur
  `hasKey: boolean`; der Key wird nie an den Client zurückgegeben, nie geloggt und nie in
  Fehlermeldungen aufgenommen.
- **Added** **Env-Override** (headless/Standalone): `AUTHORAI_PROVIDER=openrouter|custom`,
  `AUTHORAI_BASE_URL`, `AUTHORAI_API_KEY` haben Vorrang vor der gespeicherten Konfiguration.
- **Changed** Der **Antwort-Cache ist anbieterabhängig** — ein Anbieterwechsel liefert keine alten
  Treffer mehr. Fehlermeldungen nennen den wirksamen Anbieter („Anbieter" statt immer
  „OpenRouter") und hängen, wenn vorhanden, das Provider-Detail an.
- **Changed** Die **Charakter-Synthese** (`/api/generate`) nutzt denselben aufgelösten Anbieter
  (Override an die promptgen-Engine); der Standalone-promptgen-Server bleibt bei der `.env`.

### Kanon-Komfort & Versions-Diff

- **Added** **Versions-Vergleich** (`VersionDiffDialog`, `lib/diff.ts`): Im **Versionen**-Panel
  gibt es „Vergleichen" — zwei Fassungen (aktueller Stand oder eine gespeicherte Version) werden
  Wort für Wort gegenübergestellt. Entferntes rot/durchgestrichen, Neues grün, plus Bilanz
  „+n / −m Wörter". Der Diff ist eigenständig (Präfix-/Suffix-Trimmung + LCS im geänderten
  Mittelteil; bei sehr unterschiedlichen Texten grober Block-Diff statt Pathologie-Kosten).
- **Added** **Diff-Vorschau vor dem Übernehmen**: Der Quick Fix schreibt nicht mehr direkt,
  sondern liefert die Änderungen an eine **Vorschau** (`CanonRepairPreviewDialog`): je Kapitel
  die Wort-Diff, Kapitel einzeln abwählbar, dann „Übernehmen (n)" oder „Verwerfen". Erst die
  Bestätigung schreibt (mit Snapshot je Kapitel) in einem Commit ins Buch.
- **Added** **Einzelne Widersprüche auswählen**: Im Fakten-Check hat jeder Widerspruch ein
  Häkchen (Standard: alle markiert). „Markierte beheben (n)" und das Kapitel-„Beheben (n)"
  korrigieren nur die markierte Teilmenge — der Server bekommt exakt diese Liste.
- **Added** **Gezielter Fakten-Check (Umfang)**: Der Check kennt jetzt einen Umfang — *Gesamter
  Kanon*, *eine einzelne Figur/Welt* oder *nur ausgewählte Fakten* (Checkliste). Der Kanon-Block
  wird clientseitig verkleinert, es gibt **keine** neue Route.
- **Added** **Prüf-Historie je Kapitel**: Jedes Check-Ergebnis wird am Kapitel gespeichert
  (`ChapterContent.canonCheck`: Zeitpunkt, Ergebnis, Anzahl, Umfang, Text-Hash) und erscheint als
  Badge **„Fakten ✓"** bzw. **„Fakten n"** in der Kapitel-Liste sowie als Abschnitt in den
  **Prüfberichten**.
- **Added** **Kanon-Warnung beim Kapitelwechsel** (Einstellungen → geräteweiter Schalter, Standard
  **an**): Beim Verlassen prüft AuthorAI das Kapitel still gegen den Kanon und warnt bei
  Widersprüchen mit Liste und direktem Weg in den Fakten-Check. Die Prüfung ist **bewusst nicht
  blockierend** — ein blockierendes Autosave würde offenen Text verlieren („stiller Datenverlust
  wäre schlimmer als eine sichtbare Warnung"). Unveränderte Kapitel kosten nichts
  (`lib/textHash.ts` + Antwort-Cache).
- **Changed** **Quick Fix nutzt den Kanon des gewählten Umfangs**: Korrektur und Nachprüfung
  laufen mit demselben (ggf. verkleinerten) Kanon-Block wie der Check.

### Fixed

- **Dashboard-Metriken (Streak, Tages-/Wochenwerte) überleben den Reload wieder**: Der
  Objekt-Store `meta` lag zwar in der Datenbank, wurde beim Start aber **nicht** in den
  Client-Cache geladen (`hydrateState` filterte ihn heraus) — geschrieben wurde seit der
  SQLite-Umstellung nur noch in die DB, gelesen aber aus dem `localStorage`, das nicht mehr
  aktualisiert wird. Nach einem Reload fiel der Fortschritt deshalb auf den alten Stand zurück.
  `meta` ist jetzt ein regulärer Cache-Schlüssel (`BucketKey` in `lib/persistence.ts`) und wird
  mit hydratisiert — auch bei der einmaligen `localStorage`-Übernahme.

---

## [0.5.0] — 2026-09-13

### Kontinuität: Ableitung live + Dubletten

- **Added** **Ableitung streamt live** (`POST /api/continuity/extract/stream`): Das Modell
  schreibt **JSONL** (ein Objekt pro Zeile), der Review-Dialog öffnet **sofort** und die
  Vorschläge treffen einzeln ein („sammelt…"). Am Ende ersetzt die validierte Fassung die
  Live-Liste. Zeilen werden auch über Chunk-Grenzen korrekt zusammengesetzt; ignoriert das
  Modell JSONL, fällt der Server auf normales JSON zurück — es geht nichts verloren.
  Der Übernehmen-Knopf ist während des Sammelns gesperrt.
- **Added** **Dubletten vermeiden und aufräumen**: Der Vergleich von Bekanntem läuft jetzt
  **unscharf** (`lib/factMatch.ts`, Token-Überlappung) — dieselbe Aussage in neuer Formulierung
  wird nicht erneut vorgeschlagen. Für den Bestand gibt es in der Kontinuitäts-Ansicht
  **„Dubletten entfernen"** mit Anzahl, Rückfrage und Bericht (Fakten nach Aussage,
  Beziehungen nach Richtung + Typ).
  - **Absichtliche Grenze**: eine identische Aussage bei **anderer** Figur gilt **nicht** als
    Dublette und wird nicht gelöscht — sie kann eine Fehlzuordnung sein, und stiller
    Datenverlust wäre schlimmer als eine sichtbare Dopplung.

### Kohärenz & Stil streamen

- **Added** **Live-Vorschau für Kohärenz und Stil** (`POST /api/chapter/consistency/stream`,
  `POST /api/chapter/style/stream`): Die beiden Überarbeitungen laufen jetzt als SSE. Da sie
  **gechunkt** sind, schickt der Server Teil-Ereignisse (`part-start`, `part-delta`,
  `part-done`) und am Ende das vollständige Ergebnis mit den Notizen — die Vorschau im
  Kapitel-Editor wächst mit und nennt den Fortschritt („Kohärenz · Teil 2/5 · 812 Wörter").
  Es ist **derselbe** Code-Pfad wie ohne Streaming (nur mit Callback), deshalb gelten alle
  Sicherungen unverändert: Wachstumsgrenze ~⅓, Fortsetzung nur bei `finish_reason: "length"`,
  klarer Fehler bei starker Kürzung. Gilt für die Einzel-Prüfung **und** für die
  „Alle prüfen"-Schleife (Vorschau je Kapitel). Der Buch-Assistent nutzt weiter die
  nicht-streamenden Routen.

### Figuren-Dubletten

- **Added** **Dublettenerkennung für Figuren** (`src/lib/characterMatch.ts`): Anreden, Ränge und
  Artikel werden vor dem Vergleich entfernt — **„Prinzessin Lysara" = „Lysara"**, „König Theron"
  = „Theron", „Lord General Ser Kael" = „Kael". Danach gelten dieselben Regeln wie beim
  Weltenbau (exakter Vergleich + Token-Überlappung); ein einzelnes Token zählt ab vier Zeichen
  („Lysara" ↔ „Lysara Thorne"), kurze Namen („Bo") bleiben bewusst außen vor. Verglichen wird
  **nur innerhalb desselben Projekts**. Der gemeinsame Rechenkern liegt in `lib/nameMatch.ts`
  (Weltenbau und Figuren teilen ihn).
- **Added** **„Dubletten entfernen"** in der Charaktere-Ansicht: Der Knopf zeigt die Anzahl
  gefundener Dubletten, fragt vor dem Löschen nach (mit Hinweis, dass Fakten und Beziehungen der
  entfernten Figuren mitgelöscht werden) und behält je Figur den **ersten** Eintrag.
- **Added** **Import prüft auf Dubletten**: Beim Übernehmen aus der Manuskript-Extraktion und
  beim automatischen Storyboard-Import werden Figuren, die es (unter anderem Namen) schon gibt,
  übersprungen und gezählt („2 bereits vorhanden (übersprungen)").
- **Changed** **`lib/worldMatch.ts`** nutzt jetzt den gemeinsamen Kern (`lib/nameMatch.ts`) —
  Verhalten unverändert (Regression geprüft, 11/11).

### Fakten-Check: Streaming & Quick Fix

- **Added** **Fakten-Check streamt live und parallel** (`POST /api/continuity/check/stream`):
  Alle Kapitel werden in **einem** Aufruf geprüft — mit begrenzter Parallelität
  (`concurrency`, Standard 3) statt sequenziell. Jedes Ergebnis kommt als SSE-Ereignis, sobald
  es fertig ist; die Liste im Dialog füllt sich also während des Laufs und zeigt je Kapitel
  „prüft…", „keine Widersprüche", Treffer oder Fehler. Ein fehlerhaftes Kapitel beendet den
  Lauf nicht. Fehlender Kanon/keine Kapitel → **400 vor dem Stream**.
- **Added** **Quick Fix für gefundene Widersprüche** (`POST /api/continuity/repair`): je Kapitel
  ein Knopf **„Beheben"** und im Kopf **„Alle beheben (n)"**. Ans Modell gehen **nur die
  Textteile, in denen ein gemeldetes Zitat wirklich vorkommt** — alles andere bleibt wortgleich.
  Danach wird das Kapitel **erneut geprüft** und die Meldung sagt, ob es behoben ist oder was
  offen bleibt. Nicht zuordenbare Stellen werden gezählt und gemeldet.
- **Added** **„Alle beheben" läuft ebenfalls gestreamt** (`POST /api/continuity/repair/stream`):
  viele Kapitel in **einem** SSE-Lauf, begrenzt parallel (Standard 2), und jedes Kapitel wird
  im selben Zug **neu geprüft** — die Liste aktualisiert sich live („korrigiert…" → behoben /
  offen). Scheitert nur die Nachprüfung, wird die Korrektur trotzdem geliefert, damit keine
  Arbeit verloren geht. Vor jeder Korrektur wird ein Versions-Snapshot angelegt.
- **Changed** **Sicherungen wie bei den Pässen**: Ausgabelimit am Textteil (~2,4 Tokens/Wort),
  am Token-Limit abgebrochene oder über ~⅓ aufblähende Korrekturen werden **verworfen** (der
  Originaltext bleibt stehen) statt halb angewendet.

### Changed

- **Fachdaten liegen jetzt in einer SQLite-Datenbank statt im Browser-Speicher.** Das
  `localStorage`-Limit (~5 MB) war zu klein: Ein Projekt mit 13 Kapiteln × 8.000 Wörtern und
  Versionshistorie braucht allein 8,8 MB — danach schlug **jedes** Speichern fehl und Änderungen
  waren nach einem Reload weg (stiller Datenverlust).
  - **Speicherort**: `<runtimeRoot>/data/authorai.db` (neben `covers/`, gitignored), Zugriff nur
    über `src/server/store.ts` + `/api/state`. **`bun:sqlite`** statt `better-sqlite3`: gleiche
    API, aber **kein nativer Build** — `bun install` bleibt unverändert.
  - **Kein Size-Limit mehr**: 1,08 MB in einem einzigen Schreibvorgang sind im Test ein normaler
    Request (vorher: Quota-Fehler).
  - **Ablauf**: Die App lädt beim Start (bzw. Profilwechsel) einmal alle Sammlungen
    (`hydrateState`) und liest danach synchron aus dem Cache; geschrieben wird gebündelt
    (400 ms) über `PUT /api/state`. Sammlungsnamen sind in `src/data/state.ts` als Whitelist
    hinterlegt — Client und Server teilen sie.
  - **Übernahme**: Vorhandene `localStorage`-Daten wandern beim ersten Start **einmalig** in die
    Datenbank (nichts geht verloren); danach dienen sie nur noch als lesender Notnagel, falls der
    Server fehlt.
  - **Profile und geräteweite Einstellungen** (Modelle, Sprache, Stil-Profil) bleiben bewusst im
    Browser — sie sind winzig.
  - **Einstellungen** zeigen jetzt die **Datenbank** statt des Browserspeichers: Datei, Größe
    (inkl. WAL), Anzahl Profile/Einträge und die größten Sammlungen.
  - **Historie bleibt budgetiert** (~1,2 MB je Buch, älteste zuerst) — jetzt Haushaltsregel
    statt Überlebensnotwendigkeit.
  - Neue Routen: `GET|PUT|DELETE /api/state`, `GET /api/store/info` (siehe `docs/api.md`).

### Fixed

- **`502` bei der Timeline-Prüfung wird jetzt erklärbar (und seltener)**: Der Aufruf lief auf
  `maxTokens: 2500` und ein Token-Abbruch endete als nichtssagendes „Timeline-JSON war ungültig".
  Jetzt: **4000 Tokens**, `finish_reason: "length"` wird ausdrücklich gemeldet („…vom Token-Limit
  abgeschnitten…"), und `parseJson` schneidet JSON auch dann heraus, wenn das Modell Prosa
  drumherum schreibt (äußerster `{…}`-Block). Gilt für **alle** JSON-Aufrufe (Storyboard,
  Weltenbau, Extraktion, Timeline).
  - Fehlermeldungen nennen jetzt den Grund: ein ungültiges Stufen-Modell antwortet z. B. mit
    „OpenRouter-Aufruf fehlgeschlagen (HTTP 400)" statt eines anonymen 502.
- **Stil-/Kohärenz-Marker waren nach einem Reload weg** — die eigentliche Ursache war
  **stiller Datenverlust**: `lib/persistence.ts` verschluckte Fehler beim Speichern
  (`catch { /* storage full */ }`). Gemessen: 13 Kapitel × 8.000 Wörter mit **fünf**
  Volltext-Versionen je Kapitel sind **8,8 MB** — allein ein Buch sprengt damit das
  **~5-MB-Limit** von `localStorage`. Sobald das Limit erreicht ist, schlägt `setItem` fehl:
  Die App zeigt die Änderung (Text + Marker), nach dem Reload ist der alte Stand zurück.
  Drei Maßnahmen:
  - **Speicherfehler sind sichtbar**: `setStorageErrorHandler` meldet Sammlung, Größe und
    Grund als Toast mit Handlungsanweisung (Backup exportieren, alte Projekte löschen).
  - **Versionshistorie budgetiert**: höchstens 5 Einträge je Kapitel **und** ~1,2 MB je Buch
    (`trimHistoryToBudget`, älteste Versionen fallen zuerst). Ohne Deckel kostete die Historie
    das **6-Fache** der reinen Prosa.
  - **Speicherbelegung in den Einstellungen**: Aufschlüsselung je Sammlung (KB) mit Warnung
    ab 4 MB — man sieht jetzt, was den Speicher frisst, bevor es zu spät ist.
- **Live-Vorschau zeigte die Pipeline-Marker**: In der Vorschau stand die Rohausgabe des Modells
  inklusive `<TEXT>`/`</TEXT>` und etwaiger Notes. Die Vorschau läuft jetzt durch `extractProse`
  (dieselbe Bereinigung wie beim Speichern) — Marker und Notes sind raus, auch bei noch
  **offenem** Block mitten im Stream; die Wortzahl zählt ebenfalls nur echte Prosa.
- **Figuren-Chips doppelt**: Die Auswahl „Figuren in diesem Kapitel" listete jeden
  Registereintrag einzeln, also `Elias Thorne`, `Olivia`, `Elena`, `Sylar` und `Kael` mehrfach
  und leicht variiert (`Kael`/`Kaelen`, `Imperator Valerius`/`Lord Valerius`/`Valerius`,
  `Morwen`/`Schattenkönigin Morwen`). Die Chips fassen Namen jetzt über denselben Abgleich wie
  die Dublettenerkennung zusammen — **34 Chips → 19** im Beispiel — und schalten alle
  zugehörigen Einträge **gemeinsam** (Tooltip nennt die Anzahl). Bewusst getrennt bleiben
  unterschiedliche Namen wie `Kael` und `Kaelen`.
- **Stufen-Modelle waren in den Einstellungen unsichtbar** — die App nutzte ein anderes Modell,
  als die Oberfläche anzeigte. Ursache: `stageModels` wurde nur mit `storyboard`, `draft` und
  `expand` befüllt; für **Kohärenz** und **Stil** war der Wert `undefined`, das Feld zeigte
  deshalb nur den *Platzhalter* (das Standard-Model). Eine dort gespeicherte eigene Model-ID
  blieb aktiv, war aber nicht sichtbar.
  - `lib/generationSettings.ts` hat jetzt `emptyStageModels()`, `readStageModelsRaw()` und
    `readStageModels()` — sie erzeugen **immer** alle fünf Stufen.
  - Die Einstellungen zeigen je Stufe **„eigene Model-ID"** oder **„erbt Standard"**, nennen bei
    eigener ID ausdrücklich das wirksame Modell und bieten **„zurücksetzen"** (entfernt die
    Überschreibung, die Stufe erbt wieder).
  - **Derselbe Fehler im Buch-Wizard, dort mit Absturz**: `models.consistency`/`models.style`
    waren `undefined`, `ensureModel` rief `undefined.trim()` auf — die Kohärenz- und Stil-Schritte
    des Wizards konnten dadurch gar nicht sauber starten. Gleiche Ursache, gleicher Fix.
- **React-Fehler beim Beheben** (`Cannot update a component (JobCenter) while rendering a
  different component (CanonCheckDialog)`): Der Job-Fortschritt wurde **innerhalb eines
  State-Updaters** gesetzt (`updateJob` in `setOutcomes`) — das benachrichtigt `JobCenter` mitten
  im Rendern. Der Zähler liegt jetzt in einem Ref und wird **außerhalb** des Updaters
  aktualisiert.

---

## [0.4.0] — 2026-09-12

### Kontinuität, Reihen & Hintergrund-Jobs

Diese Version bündelt drei Lieferungen, die intern als eigene Meilensteine geplant wurden:

1. **0.3.0** — Kontinuitäts-Datenbank & Beziehungsgraph
2. **0.3.1** — Serien-Modus (Mehrbänder mit geteiltem Kanon)
3. **0.4.0** — Mittelfristig-Paket: Fakten-Check, Stil-Profil, Reihen-Übersicht, Antwort-Cache,
   Beziehungs-Arc, Job-Center und Streaming

### Mittelfristig-Paket — Batch 3

- **Added** **Streaming mit Live-Vorschau** (`POST /api/chapter/draft/stream`,
  `POST /api/chapter/expand/stream`): Rohentwurf und Ausbau — die beiden langen
  Einzelantworten — kommen jetzt als **SSE** und wachsen im Kapitel-Editor live mit
  („Live-Vorschau · n Wörter"). Der Server nutzt `chatCompletionStream()`; liefert der
  Provider kein SSE oder bleibt der Stream leer, fällt er automatisch auf den normalen
  Aufruf zurück. Validierungsfehler kommen weiterhin als **HTTP 400 + JSON**, Fehler nach
  dem Start als `{ type: "error" }`-Ereignis (HTTP 200). Geprüft: 12/12 (Deltas,
  Rahmen über Chunk-Grenzen, Fallback, Client-Parser, Fehlerpfade).
- **Added** **Job-Center — Fortschritt im Hintergrund** (`src/lib/jobs.ts`): Queue-Läufe
  (Kohärenz/Stil über alle Kapitel, Ausbau, Fakten-Check) legen jetzt einen Job im Store an.
  Der Store lebt **außerhalb von React** (Modul-Singleton + `useSyncExternalStore`), damit der
  Fortschritt das Schließen des Dialogs überlebt — die Ergebnisse werden ohnehin pro Kapitel
  ins Buch geschrieben.
  - **Anzeige** (`JobCenter`, fest unten rechts): laufende Jobs mit Fortschrittsbalken,
    aktuellem Kapitel und **Abbrechen**-Knopf; beendete Jobs mit Status, Meldung, Ausblenden
    und „Aufräumen". Abschlüsse kommen als Toast (neuer Ton `info` für Abbrüche).
  - **Abbruch** ist kooperativ: die Schleife prüft vor jedem Kapitel `isCancelled()` und beendet
    sauber — das laufende Kapitel wird noch fertiggeschrieben, nichts halb gespeichert.
  - Deterministische Reihenfolge (Zeitstempel + Sequenz), Abschluss-Erkennung ohne doppelte
    Toasts, unbekannte IDs sind wirkungslos. Geprüft: 22/22.

### Mittelfristig-Paket — Batch 2

- **Added** **Beziehungs-Arc — Figuren-Entwicklung über die Zeit**: Eine Beziehung kann jetzt
  einen Verlauf über die Kapitel tragen (`arc: [{ chapter, intensity }]`). Ab **zwei** Punkten
  hat der Verlauf Vorrang vor der Einzel-Intensität; der Kanon zeigt dann nicht mehr einen Wert,
  sondern die Entwicklung („distrust arc: −0,6 (Kap. 1) → 0,2 (Kap. 12)"), sodass Ausbau und
  Prüfungen den Werdegang kennen statt nur den Endzustand.
  - **Charakter-Editor**: pro Beziehung ein aufklappbarer **Verlaufs-Editor** (Kapitel +
    Intensitäts-Slider je Punkt, hinzufügen/löschen) mit Sparkline und Δ-Anzeige.
  - **Kontinuitäts-Ansicht**: Beziehungen mit Verlauf zeigen eine Sparkline in der Liste.
  - Helfer in `data/continuity.ts` (`hasArc`, `arcAt`, `formatArc`, `arcDelta`, `sortArc`) und
    `lib/graph.ts` (`sparklinePath`) — alle pur und geprüft (25/25).

### Mittelfristig-Paket — Batch 1

- **Added** **Fakten-Check als eigener Report** (`POST /api/continuity/check`): prüft ein Kapitel
  **nur gegen den Kanon** (Fakten + Beziehungen) — getrennt von der Kohärenz. Antwort
  `{ ok, summary, violations[] }` mit `fact` / `quote` / `fix` je Widerspruch. Das Kapitel wird
  **gechunkt** (dieselbe Robustheit wie Kohärenz/Stil), Dubletten über Teile hinweg werden
  entfernt, unvollständige Meldungen (ohne Fakt oder Zitat) verworfen. Button **„Fakten-Check"**
  in der Kapitel-Leiste → Dialog mit Fortschritt über alle Kapitel und Erneut-Prüfen.
- **Added** **Stil-Profil** (Zielstimme als wiederverwendbare Vorgabe): Presets
  (Lakonisch, Hart & schnell, Barock, Lyrisch, Sachlich) plus freier Zusatz. Der zusammengesetzte
  Hinweis geht als verbindlicher `VOICE / STYLE PROFILE`-Block in den Stil-Pass (System **und**
  Chunk-Prompt) — ausdrücklich „nie auf Kosten von Inhalt, Fakten oder Bedeutung".
  Einstellungen: neue Sektion **Stil-Profil**; geräteweit gespeichert (`authorai.styleProfile`).
- **Added** **Reihen-Übersicht** in der Bibliothek: alle Bände einer Reihe mit Bandnummer,
  Status, Kapitelstand, Wortsumme und Fortschrittsbalken; **Lücken** (gelöschte Bände) und Bände
  **ohne Storyboard** werden markiert. Klick auf einen Band öffnet ihn. Helfer:
  `lib/seriesOverview.ts` (pur, getestet).
- **Added** **Antwort-Cache** für wiederholbare Analysen (`src/server/cache.ts`): LRU mit  200 Einträgen und 30 Min TTL über einen SHA-256-Schlüssel aus Modell, Prompt, Temperatur und
  Limit. **Opt-in pro Aufruf** — nur Welt-Extraktion, Figuren-Extraktion, Kontinuitäts-Extraktion,
  Fakten-Check und Timeline-Prüfung. Kreative Generierungen (Storyboard, Rohentwurf, Ausbau,
  Kohärenz, Stil) werden **nie** gecacht, damit „erneut generieren" wirklich neu generiert.
  Abschaltbar über `AUTHORAI_CACHE=0`; Treffer werden geloggt. Nichts wird auf Platte geschrieben.

### Kontinuitäts-Datenbank & Beziehungsgraph

- **Added** **Kanon: Fakten & Beziehungen** (`src/data/continuity.ts`): `CanonFact`
  (Kategorie, prüfbare Aussage, Quelle, `hard`-Flag für Weltregeln) und `CharacterRelation`
  (Typ, Richtung, Intensität −1 … 1, Notiz, geheim). Pro Profil gespeichert
  (`authorai.<profilId>.facts|relations`), im Backup ab Version 2 enthalten; beim Löschen einer
  Figur oder eines Welteneintrags räumt die Shell zugehörige Einträge mit auf.
- **Added** **`canonBlock()`**: Fakten und Beziehungen gehen als **verbindlicher Block** an
  `chapter/draft`, `chapter/expand`, `chapter/consistency`, `chapter/style` und
  `timeline/check` — nur Entitäten des jeweiligen Projekts. Ohne Kanon bleibt der Prompt
  unverändert (kein leerer Header).
- **Added** **Extraktion** (`POST /api/continuity/extract`): leitet Fakten und Beziehungen aus
  Storyboard und Figuren-Register ab (ein Aufruf, Temperature 0.3, Token-Limit wird als 502
  gemeldet). Der Server verwirft erfundene Entitäten, validiert Kategorien, klemmt Intensitäten
  und filtert bereits erfasste Einträge; die Zuordnung Name → ID macht der Client.
- **Added** **View „Kontinuität"** (neue Sidebar-Sektion): Tabs **Fakten** (Suche, Filter nach
  Projekt/Kategorie/Figur-Welt, Inline-Bearbeitung, Löschen) und **Beziehungen**
  (SVG-Graph + Liste). Graph: deterministisches Kreis-Layout nach Vernetzungsgrad, Farbe = Typ,
  Stärke/Deckkraft = Intensität, gestrichelt = geheim, Hover-Titel; getestet bis 40 Figuren.
- **Added** **Charakter-Editor: Panels „Fakten" und „Beziehungen"** — Fakt mit Kategorie und
  Quelle anlegen, Beziehung mit Ziel-Figur, Typ, Intensitäts-Slider, Notiz und „geheim".
  Änderungen wirken sofort (kein Speichern nötig).
- **Added** **Review-Dialog „Kontinuität vorschlagen"**: Vorschläge sind vorausgewählt und
  einzeln abwählbar; nicht zuordenbare Vorschläge werden gezählt und im Toast gemeldet.
- **Added** **Kanon-Fakten zu den Seed-Daten** (Alter/Verlust/Besitz/Regeln der Beispiel-Figuren),
  damit die Ansicht beim ersten Start nicht leer ist.

### Serien-Modus (Mehrbänder)
- **Added** **Reihen** (`src/data/series.ts`): `Series { id, name, description?, volumeIds[] }`.
  Die Reihe hält die Band-IDs in **Lesereihenfolge** — `Book` bekommt bewusst kein `seriesId`
  (eine Quelle der Wahrheit, kein Auseinanderlaufen). Pro Profil gespeichert
  (`authorai.<profilId>.series`), im Backup enthalten; beim Löschen eines Buchs wird es aus
  allen Reihen genommen, die Reihe bleibt bestehen.
- **Added** **Reihen-Dialog** (Kopfzeile der Buch-Ansicht): Reihe anlegen (das Buch wird Band 1),
  einer bestehenden Reihe beitreten, Name/Beschreibung pflegen, Bände hinzufügen, per
  ↑/↓ in der Lesereihenfolge verschieben, entfernen, Reihe auflösen (Bücher bleiben erhalten).
- **Added** **Gemeinsamer Kanon über alle Bände**: Fakten und Beziehungen der ganzen Reihe
  gelten für jeden Band — `canonVolumeIds()` weitet den Scope in `BookDetailView` auf alle
  Bände aus (gemeinsame Welt und Figuren-Historie). Figuren mit gleichem Namen gelten über die
  Bände hinweg als dieselbe Figur; Beziehungen zwischen Bänden sind damit darstellbar.
- **Added** **Reihen-Scope in der Kontinuitäts-Ansicht**: Der Filter kennt jetzt zusätzlich
  `Reihe: <Name> (n Bände)` und zeigt Fakten, Beziehungen und Graph über alle Bände. Die
  Extraktion betrachtet Bekanntes reihenweit — was in einem anderen Band schon steht, wird
  nicht erneut vorgeschlagen.
- **Added** **Reihen-Badge in der Bibliothek**: Buchkarten zeigen „Reihe · Band n", die Suche
  findet auch über den Reihennamen.
- **Added** **Reihe schon im Buch-Wizard wählbar** (Schritt „Idee"): Ein neues Buch startet
  direkt als nächster Band. Ein Hinweis zeigt „Band n" und ob es Vorbände gibt.
  - **Storyboard** bekommt einen **Reihen-Kontext**: Titel, Genre, Logline, Handlung,
    Figuren und Schauplätze der Vorbände plus die Regel, die Reihe **fortzuführen statt
    neu zu erzählen** (`lib/seriesContext.ts` → `buildSeriesContext`, beide Storyboard-Phasen).
  - **Alle weiteren Stufen** des Wizards (Rohentwurf, Ausbau, Kohärenz, Stil) bekommen den
    **Kanon der Vorbände** als verbindlichen Block — Fakten aus der Kontinuitäts-DB
    (`CanonFact`) und Beziehungen aus dem Beziehungsgraph (`CharacterRelation`).
  - Beim Anlegen wird das Buch automatisch als letzter Band an die Reihe gehängt;
    ohne Vorbände eröffnet es die Reihe.

### Fixed

- **Kapitel wuchsen nach Kohärenz/Stil auf das 2–3-Fache** (4.000 → 12.253 Wörter): Die
  Fortsetzung (`completeProse`) hing Prosa an, sobald der Text „abgebrochen aussah" — und
  `looksTruncated` hielt **jeden auf ein deutsches Schlusszeichen endenden Text** für
  abgebrochen, weil `“` (U+201C) in der Schlusszeichen-Klasse fehlte. Jede Stufe schrieb
  „mindestens 150 Wörter" weiter, bis zu dreimal. Jetzt:
  - `looksTruncated` akzeptiert **alle** Schlusszeichen (inkl. `“”‘’»›`, tolerant gegenüber
    typografischem Abstand) — Dialogenden gelten nicht mehr als Abbruch.
  - `completeProse` läuft **nur noch bei hartem Signal** (`finish_reason: "length"`), höchstens
    zwei Schritte, max. 600 Wörter Ergänzung und ein kleineres Ausgabelimit.
  - Das **Ausgabelimit pro Chunk** wird am Chunk ausgerichtet (`~2,4 Tokens/Wort`, max. 4.000)
    — vorher standen pauschal 4.000 Tokens für einen 1.000-Wörter-Chunk zur Verfügung.
  - **Wachstumsgrenze**: Überarbeitung darf max. ~⅓ länger werden. Antwortet das Modell länger,
    wird einmal mit klarer Ansage nachgefasst; danach bleibt der **Original-Teil** stehen und der
    Bericht nennt es („Teil 3/5 unverändert übernommen"). Ein Wachstum über 40 % über das ganze
    Kapitel wird im Bericht gemeldet.
  - Betrifft `POST /api/chapter/consistency` und `POST /api/chapter/style` (Ausbau darf weiter
    wachsen — das ist seine Aufgabe).

_Bereits aufgeblähte Kapitel_: Im **Versionen**-Panel liegt je Kapitel eine Momentaufnahme
„vor Kohärenz-Prüfung" / „vor Stil-Prüfung" — darüber wiederherstellbar.

_Nächste Themen siehe [`roadmap.md`](roadmap.md)._

---

## [0.2.0] — 2026-09-12

### Nachträglich: Korrekturen & Politur

- **Added** **Toast-System**: globale, dezente Rückmeldungen (unten mittig, nicht im Druck) für
  Kopier- und Export-Aktionen — `src/lib/toast.ts` + `components/dashboard/ToastHost.tsx`.
- **Added** **Zwischenablage mit Fallback** (`src/lib/clipboard.ts`): versucht
  `navigator.clipboard`, fällt auf `textarea`/`execCommand` zurück und meldet echtes
  Erfolg/Fehlschlag statt still zu scheitern.
- **Added** **Prosa-Extraktion** (`src/lib/prose.ts`) für Server und Client: extrahiert `<TEXT>`-Blöcke
  robust und erkennt mitten im Satz abgebrochene Texte.
- **Added** **Pollinations-Status**: Die Einstellungen zeigen jetzt auch den Cover-Key an
  (`Pollinations: verbunden/fehlt`) — `GET /api/config` liefert dafür `pollinations`.
- **Added** **Figuren aus dem Manuskript** (`POST /api/characters/extract`): Die Charaktere-Ansicht
  leitet benannte Figuren direkt aus den Kapiteltexten ab — so landen auch Figuren im
  Register, die erst beim Schreiben auftauchen (z. B. „Kael") und im Storyboard nie standen.
  Vorschläge werden vor der Übernahme in einem Review-Dialog einzeln an-/abgewählt; bereits
  getrackte Namen filtert der Server heraus (Tag „Manuskript", verknüpft mit dem Projekt).

- **Changed** **Kapiteltext-Editor ist jetzt zuklappbar**: Der ausführliche Kapiteltext steckt in einem
  `<details>`-Bereich wie Rohentwurf/Versionen — Wortzahl und Speicherstatus bleiben in der
  Kopfzeile sichtbar, auch wenn er zugeklappt ist. Standard: aufgeklappt.

- **Fixed** **Performance: PDF-Export und Dublettenprüfung** (DevTools `'click' handler took N ms`):
  - `lib/pdf.ts`: Der Zeilenumbruch maß für **jedes** Wort den kompletten Kandidaten neu
    (O(n²)) und `charWidth` suchte pro Zeichen in zwei Strings. Jetzt läuft die Breite
    inkrementell über eine `Uint8Array`-Lookup-Tabelle. Gemessen an einem Buch mit
    55 Kapiteln × 3.257 Wörtern (~1 MB Prosa): **484 ms → 91 ms**; bei 12 Kapiteln
    (~240 KB): **113 ms → 22 ms**. Ergebnis identisch (Round-Trip-Test: Text, Umlaute,
    Anführungszeichen, Seitenstruktur).
  - `lib/worldMatch.ts`: Titel wurden in der O(n²)-Dublettenprüfung hundertfach neu
    normalisiert (Regex + `NFD`). Jetzt mit gebundenem Normalisierungs-Cache:
    **43 ms → 15 ms** bei 200 Einträgen. Verhalten unverändert.
- **Fixed** **Stil-/Kohärenz-Berichte mit No-Op-Notizen**: Kleine Modelle notierten „Änderungen", bei
  denen beide Seiten identisch waren (z. B. `"ein Schlund … schien" wurde zu "ein Schlund …
  schien" zur Verbesserung des Satzflusses`). Solche Zeilen dokumentieren nichts und
  verstopfen den Prüfbericht. `lib/passNotes.ts` erkennt sie (Vorher/Nachher-Zitat plus
  Änderungs-Marker, Vergleich ohne Satzzeichen/Leerraum) und entfernt sie; echte Notizen
  bleiben. Die Prompts fordern zusätzlich ausdrücklich: nur Zitate, deren Wortlaut sich
  wirklich geändert hat, sonst exakt „Keine Auffälligkeiten.".
- **Fixed** **Kohärenz/Stil bei langen Kapiteln (502 „Antwort unvollständig")**: Beide Pässe verlangten
  die **komplette** überarbeitete Prosa in *einer* Antwort. Bei 3.000–5.000 Wörtern lief das
  ins Ausgabelimit (9000 Tokens angefragt, Modell stoppt früher) → Abbruch mitten im Kapitel.
  Jetzt zerlegt `splitIntoChunks()` das Kapitel an Absatzgrenzen in Teile von ~1.000 Wörtern
  (max. 1.400, überlange Absätze an Satzgrenzen), jeder Teil wird einzeln umgeschrieben —
  Nachbarteile nur als Kontext-Anker — und wieder zusammengesetzt. Ausgabelimit pro Teil
  4.000 Tokens. Gibt ein Modell den falschen Abschnitt zurück, wird einmal nachgefasst, danach
  mit klarer Meldung abgebrochen (statt Text zu duplizieren). `<NOTES>` aller Teile werden
  gesammelt und dedupliziert. Betrifft `POST /api/chapter/consistency` **und**
  `POST /api/chapter/style`.
- **Fixed** **Server-Idle-Timeout** auf 180 s erhöht — mehrteilige Pässe, Ausbau und Cover-Varianten
  laufen nicht mehr Gefahr, mitten im Lauf getrennt zu werden.
- **Fixed** **Dubletten beim Welten-Scan**: Wiederholte Scans legten denselben Stoff immer wieder an
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
- **Fixed** **Abgeschnittene Kapitel**: Antworten, die mitten im Satz enden (Token-Limit oder
  „lite"-Modelle), werden erkannt und über eine gezielte Fortsetzung zu Ende geschrieben —
  für Rohentwurf, Ausbau, Kohärenz und Stil. Läuft es weiterhin ins Limit, benennt der
  Prüfbericht das Problem, statt es zu verschweigen.
- **Fixed** **Prosa-Verlust durch `<NOTES>`**: Der Parser schnitt bisher am ersten `<NOTES>`-Marker
  alles ab — auch echten Prosatext. Jetzt hat ein geschlossener `<TEXT>`-Block Vorrang;
  Notes-Inhalte werden gezielt entfernt, niemals Prosa.
- **Fixed** **„Manuskript kopieren" war unvollständig**: kopiert wurde nur der gespeicherte Stand,
  während der Editor den laufenden Text in verzögerten Autosave-Puffern hält. Kopieren und
  alle Exporte (`.txt`, Markdown, EPUB, DOCX, PDF) führen die Puffer jetzt vorher zusammen.
- **Fixed** **Kopieren ohne Rückmeldung**: Kopier-/Exportaktionen melden nun Erfolg oder Fehler;
  unvollständige Kapitel werden beim Kopieren namentlich benannt.

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
