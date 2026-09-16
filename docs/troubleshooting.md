# Troubleshooting

Häufige Probleme und ihre Ursachen — meist in unter einer Minute gelöst.

---

## Installation & Start

### `error: bin executable does not exist on disk` / „corrupted node_modules"

Ein abgebrochener oder veralteter Install-Stand (typisch nach dem Hinzufügen von
`workspaces`).

**Lösung** (im Repo-Root):

```bash
bun install --force
```

Wenn es bleibt, komplett frisch:

```bash
# PowerShell
Remove-Item -Recurse -Force node_modules, packages\promptgen\node_modules, bun.lock
bun install
```

> Immer im **Root** installieren — nicht in `packages/promptgen`.

### `error: Missing entrypoints` bei `bun build --compile`

`--compile` braucht einen Entrypoint. Nutze das fertige Skript:

```bash
bun run build:binary        # → release/authorai[.exe] (+ Beigaben)
```

Manuell wäre es `bun build --compile src/index.ts --outfile release/authorai` —
das Skript setzt zusätzlich das Tailwind-Plugin, die Produktions-Defines und
kopiert `LICENSE`, `README.md` und `.env.example` mit.

> Lege dein Release **nicht** in `dist/` — `bun run build` leert dieses Verzeichnis.
> `bun run build:binary` nutzt deshalb `release/`.

### Standalone-Binary findet die Keys nicht

Das Binary sucht `.env` in dieser Reihenfolge: aktuelles Arbeitsverzeichnis,
Verzeichnis des Binaries, Elternverzeichnisse. Lege die `.env` also **neben das
Binary** (oder setze die Keys als Umgebungsvariablen).

### Port belegt (`EADDRINUSE`)

Root nutzt **3000**, promptgen **3001**. Anderen Port setzen:

```bash
$env:PORT=3002; bun run --cwd packages/promptgen dev
```

### Dev-Server startet, Seite bleibt leer

- Konsole/Netzwerk im Browser prüfen (DevTools).
- Härtester Reload: `Ctrl+Shift+R`.
- Terminal auf Serverfehler prüfen (fehlende Keys → 500 beim API-Call).

---

## Keys & Konfiguration

### „Kein OPENROUTER_API_KEY / TAVILY_API_KEY / POLLINATIONS_API_KEY in der .env gefunden"

- Root-`.env` prüfen (nicht `packages/promptgen/.env`).
- Key-Namen: `OPENROUTER_API_KEY`, `TAVILY_API_KEY`, `POLLINATIONS_API_KEY`
  (Aliasse `OPENROUTER_KEY`, `TAVILY_KEY`, `POLLINATIONS_TOKEN`).
- Status in der App: **Einstellungen** zeigt Chips für Tavily/OpenRouter.
- Server neu starten (Env wird beim Start geladen).

### „Bitte eine Model-ID angeben"

Für die aktive Stufe ist kein Model gesetzt.

**Lösung:** Einstellungen → Model pro Schritt, oder direkt im Wizard in der oberen Leiste.
Leer = erbt das **Standard-Model**.

---

## Generierung

### Storyboard liefert zu wenige Kapitel

Früher ein Truncation-Problem — heute **nicht mehr möglich**: Die Outline-Phase garantiert
exakt N Titel, fehlende Details werden nachgefüllt. Wenn Titel fehlen, hat das Modell zu
kurz geraten; der Server füllt mit `Kapitel N` auf (Titel ggf. manuell anpassen).

### Kapitelüberschriften plötzlich englisch

Language-Drift bei langen Ausgaben. Der Language-Lock ist inzwischen in **allen** Prompts
(System + User) verankert. Bleibt es, ein sprachstärkeres Modell für die Stufe verwenden.

### Ausbau erreicht die Ziel-Wörter nicht

- Der Server fährt bis zu **3 Continuation-Runden** (bis ≥ 90 % Ziel).
- „lite"-Modelle liefern kürzer — für den Ausbau ein mittleres/starkes Modell wählen.
- Ziel-Wörter pro Kapitel prüfen (Detailansicht, 3000–5000).

### Im Text steht `<TEXT>` oder `<NOTES>`

Altbestand aus früheren Läufen. Wird beim Laden **automatisch bereinigt**
(`manuscriptOf` → `cleanProse`). Neue Läufe parsen Marker robust.

### Prüfbericht lang, aber Wortzahl unverändert

Dann hat das Modell den Text **unverändert** zurückgegeben. Der Bericht sagt das jetzt
explizit: *„⚠️ Keine Textänderung erkannt — ggf. stärkeres Modell wählen."*
Für Kohärenz/Stil ein stärkeres Modell verwenden.

### Kapitel bleibt „ungeprüft", obwohl der Pass lief

Früher wurde der Status an vorhandenen Notizen gemessen. Jetzt nutzen Status/Plates die
Flags `consistencyChecked` / `styleChecked` → auch „keine Auffälligkeiten" markiert korrekt.
Bestehende Bücher: die betroffenen Kapitel einmal erneut prüfen.

### „Alle Kohärenz" läuft endlos / wiederholt Kapitel

Passierte, wenn der Status fehlte (siehe oben). Queues überspringen jetzt **bereits geprüfte**
Kapitel anhand der Flags.

---

## Live-Vorschau & Job-Center

### Vorschau bleibt leer, der Text erscheint erst am Ende

Dann liefert der Anbieter **kein SSE** (oder lehnt `stream: true` ab). Der Server fällt intern auf
den normalen Aufruf zurück und liefert das Ergebnis dann als **ein** Textstück an die Vorschau —
Funktion und Ergebnis sind identisch, es fehlt nur das Mitlesen während der Generierung. Prüfen:
Anbieter/Endpoint unterstützt Streaming; bei eigenem Anbieter die Base-URL kontrollieren
(`/chat/completions` wird ergänzt).

### „…-JSON war ungültig" / „invalid JSON (…)", obwohl das Modell korrekt geantwortet hat

Früher möglich, wenn der Anbieter keinen echten Stream liefert: Der Server fiel still auf einen
normalen Aufruf zurück, die Live-Sammler blieben leer, und die JSONL-Antwort wurde anschließend
fälschlich als **ein** JSON-Dokument geparst. Behoben — der Rückfall bedient den Callback, und die
Routen verarbeiten den fertigen Text notfalls nachträglich zeilenweise. Bleibt es, die
Server-Konsole ansehen: dort steht der Anfang der Antwort (`[story] invalid JSON (…): …`); ist er
JSONL oder Prosa statt JSON, bitte melden.

### Vorschau endet mitten im Kapitel

Sollte nicht mehr vorkommen: Der Ausbau streamt auch die **Continuation-Runden** (bis zu 3) und die
abschließende Satz-Vervollständigung mit. Tritt es doch auf, ist die Antwort ins Token-Limit
gelaufen — dann greift die Fortsetzung, aber bei sehr kleinem Ausgabelimit kann sie mehrfach
ansetzen; für den Ausbau ein Modell mit größerem Limit wählen.

### Job-Center zeigt „prüft…", aber keinen Wortstand

`Job.detail` schreiben nur die **Queue-Läufe** mit Stream-Anbindung (Ausbau/Prüfungen über alle
Kapitel im Buch-Editor). Einzelne Läufe und der Assistent zeigen den Fortschritt im Dialog
(Vorschau + Balken), nicht im Job-Center.

### Storyboard-Stream zeigt keine Titel

Die Titel erscheinen, sobald die **Outline-Phase** fertig ist (Phase 1). Liefert das Modell keine
`chapterTitles`, füllt der Server mit `Kapitel N` auf — dann erscheinen eben diese Platzhalter
(Titel im Editor anpassen). Bricht die Phase ab, bleibt der Dialog beim Fehler stehen.

### Timeline-Quick-Fix schlägt nichts vor

- Kein Hinweis im Bericht → nichts zu korrigieren.
- Das Modell hat nur **unveränderte** Werte gelistet — die wirft der Server bewusst weg, es gibt
  also nichts zu übernehmen.
- Der Fix korrigiert **nur die Szenen-Struktur** (Zeit, Schauplatz, Szenen-Text), nicht die Prosa.
  Widersprüche, die ausschließlich im Fließtext stehen, sieht die Timeline-Prüfung nicht — dafür
  die **Kohärenz-Prüfung** nutzen.

### „Übernehmen" bleibt grau / der Dialog lässt sich nicht schließen

Das ist während des **Sammelns** so gewollt: Solange Vorschläge eintreffen (Timeline-Korrektur,
Weltenbau, Figuren), sind Übernehmen, Verwerfen, Abbrechen und Escape gesperrt — geschrieben wird
erst gegen die vom Server validierte Fassung, nie gegen halbfertige Live-Objekte. Warten, bis der
Spinner verschwindet; danach ist der Dialog wieder bedienbar.

### Nach dem Sammeln ändert sich die Vorschlagsliste

Während des Sammelns siehst du die **rohen** Vorschläge des Modells; am Ende ersetzt die
**validierte** Fassung sie (Dubletten und bereits getrackte Einträge fallen weg). Bereits
gefundene Einträge bleiben dabei erhalten — deine Abwahl bleibt bestehen, neu hinzugekommene
sind vorausgewählt.

---

## Import bestehender Manuskripte

### Warum stehen importierte Kapitel unter „Rohentwurf"?

Weil importierter Text den **Ausbau dieser App** noch nicht durchlaufen hat — unabhängig davon, wie
lang das Kapitel ist. Die Wortzahl sagt nichts darüber, ob ein Kapitel hier ausgearbeitet wurde.
Deshalb landet der Import im Feld `draft`: Das Kapitel steht in der Rohentwurf-Spalte, der
Assistent steigt beim Rohentwurf ein, und der Weg über „Ausbau" bleibt offen. Verloren geht nichts —
Exporte, Pässe, Prüfungen und die Kanon-Ableitung lesen den Rohentwurf, solange kein Ausbau
existiert. Im Buch-Editor stehen beide Kästen nebeneinander, der importierte Text im
Rohentwurf-Feld.

### Die Ableitung schreibt nichts — wozu die Vorschau?

„Storyboard ableiten" und „Szenen ableiten" halten ihr Ergebnis **im Speicher** und zeigen es als
Diff: je Feld beziehungsweise je Kapitel, was sich ändern würde. Erst „Übernehmen" schreibt. Beim
Storyboard wählt man dabei **„alles überschreiben"** oder **„nur leere Felder füllen"**, bei Szenen
lassen sich einzelne Kapitel abwählen. Vorher schrieb die Ableitung direkt — bei einem Lauf über
40 Kapitel war das ein Blindflug.

### Ich habe die Vorschau verworfen — ist der Lauf verloren?

Der **Modellaufruf** ja (er war schon bezahlt), die **Daten** nein: Verwerfen fasst Manuskript,
Storyboard und Szenen nicht an. Wenn dir einzelne Kapitel nicht gefallen, ist der übliche Weg:
Vorschau öffnen, unerwünschte Kapitel **abwählen**, Rest übernehmen.

### Der Import findet nur ein Kapitel

Dann enthielt die Datei keine (wiederkehrenden) Überschriften. Der Import nimmt den Text
vollständig als **ein** Kapitel auf und weist im Dialog darauf hin. Behelf: Kapitel im Markdown mit
`## Kapitel 1: Titel` (oder `Kapitel 1: Titel` als eigene Zeile) markieren — beides wird erkannt.

### Titel oder Kapitelnamen sind falsch

Die Heuristik nimmt die erste Überschrift über der Kapitel-Ebene als Titel und entfernt eine
Numerierung aus Kapitelnamen („Kapitel 3: Der Sturm" → „Der Sturm"). Titel, Untertitel und Genre
lassen sich **im Import-Dialog** vor dem Anlegen korrigieren; Kapitelnamen danach in der
Kapitelverwaltung.

### Keine Szenen im importierten Buch

Szenen entstehen nur aus Szenentrennern (`***`, `---`, `* * *`, `— — —`). Ohne Trenner gibt es
einen Beat pro Kapitel bzw. — wenn die Option im Dialog aus war — gar keinen. Nachträglich im
Bereich **Szenen** anlegen; ohne Szenen hat die Timeline-Prüfung keine Zeitangaben zu lesen.

### Fett/Kursiv oder `Neo_Kyoto` sehen komisch aus

Inline-Auszeichnung wird entfernt (`**fett**` → `fett`, Links → Beschriftung). Unterstriche
**innerhalb** von Namen bleiben absichtlich stehen (`Neo_Kyoto`), weil sie sonst als Kursiv-Marker
gelesen würden.

### „Storyboard ableiten" / „Szenen ableiten" ist ausgegraut

Beide brauchen **Manuskript-Text** (mindestens ein Kapitel mit Rohtext oder Ausbau) und eine
**Model-ID für „Storyboard"** in den Einstellungen. Ohne beides passiert nichts — der Knopf bleibt
entsprechend inaktiv.

### Die Ableitung erfindet Angaben

Sollte nicht: Der Auftrag verbietet Erfindungen, und was der Text nicht hergibt, bleibt leer. Wenn
ein Feld trotzdem geraten wirkt, liegt es am Modell — ein stärkeres Modell für „Storyboard"
einstellen und erneut ableiten (das überschreibt nach Rückfrage).

### Ableitung bricht mit „vom Token-Limit abgeschnitten" ab

Sollte nicht mehr vorkommen: Die Storyboard-Ableitung läuft **gechunkt** (Metadaten + Figuren,
dann Kapitel in Batches à 8), die Szenen-Ableitung zerlegt lange Kapitel in Teile von ~2.500
Wörtern. Tritt es doch auf, ist die **Eingabe** zu groß für das Modell — dann ein Modell mit
größerem Kontext wählen (oder bei der Szenen-Ableitung das Kapitel vorher teilen).

### „Szenen ableiten" überschreibt meine Beats

Gewollt, aber angekündigt: Die Ableitung **ersetzt** die Beat-Liste des Kapitels (und setzt Zeit/
Schauplatz/POV neu). Vorher kopieren, wenn die alten Beats erhalten bleiben sollen — ein
Versions-Snapshot gibt es hier nicht (Beats/Szenen-Metadaten liegen außerhalb der Kapitel-Version).

---

## Cover

### Cover fehlt / Bild kaputt

- Datei existiert nicht mehr? `covers/` prüfen.
- Seed-Cover sind **geschützt** und werden nie gelöscht.
- Für bestehende Bücher ohne Cover: im Buch **„Cover generieren"**.

### Cover wird nicht gelöscht (verwaiste Dateien)

Das Löschen ist **Reference-Counted**: eine Datei verschwindet nur, wenn sie kein Buch
mehr referenziert. Geteilte Beispiel-Cover bleiben absichtlich erhalten.
Echte Waisen (z. B. aus alten Testläufen) lassen sich manuell aus `covers/` entfernen.

### Cover-Text landet nicht auf dem Bild

„Auf Bild anwenden" rendert clientseitig per Canvas und lädt das PNG hoch
(`POST /api/cover/save`). Prüfe: Bild geladen (Vorschau sichtbar), Server erreichbar,
Antwort zeigt eine neue `/covers/…`-URL.

---

## Leeren von Bereichen

### Ich habe alles gelöscht — kommen die Einträge wieder?

Nein. Die Shell spiegelt fehlende Storyboard-Daten nur noch für Bücher **ohne** den Merker
`storyboardImported` (gesetzt beim Anlegen/Import, nachgezogen einmalig für bestehende Profile).
Eine geleerte Sammlung bleibt leer — auch einzeln gelöschte Figuren bzw. Welteneinträge kommen
nicht mehr zurück. Wer die Ableitung bewusst wieder will: im Buch **„Storyboard ableiten"**
(Figuren/Welt/Plot) bzw. in „Charaktere" **„Figuren aus Manuskript ableiten"**.

### „Alle löschen" ist ausgegraut

Dann ist der Bereich bereits leer — der Knopf ist nur aktiv, wenn es etwas zu löschen gibt.

### Nach „Alle löschen" fehlen Fakten

Gewollt: Fakten hängen an Figuren bzw. Welteinträgen und verschwinden mit ihnen (das ist die
Kettenwirkung, die den Kanon konsistent hält). Der Kanon lässt sich über **„Vorschläge ableiten"**
in der Kontinuität neu aufbauen.

## Figuren & Dubletten

### Nach dem Zusammenführen fehlen Fakten

Sollten sie nicht. Beim **Zusammenführen** bleiben Fakten und Beziehungen erhalten: Sie wandern auf
die behaltene Figur, und nur Aussagen, die dort **schon stehen** (unscharf verglichen), werden
zusammengefasst statt doppelt geführt. Der Dialog nennt beide Zahlen vorab — „3 Fakten, 1 davon
gibt es schon". Wer gar nichts zusammenführen will: „Nur entfernen" tut weiterhin genau das
Alte (Fakten und Beziehungen der entfernten Figuren gehen dann mit).

### Ein Figurenname wird nicht zugeordnet (Szene bleibt leer)

Die Szenen-Ableitung liefert **Namen** aus dem Text — sie kennt die Figurenliste nicht. Beim
Übernehmen wird jeder Name gegen die Figuren des Projekts verglichen (Anreden und Ränge werden
ignoriert, „Prinzessin Lysara" findet „Lysara"). Findet sich keine Figur, wird **keine** neue
angelegt: Der Name fällt weg und wird gemeldet („Name ohne Figur"). Figur anlegen, dann die
Szenen-Ableitung für das Kapitel wiederholen.

---

## Kanon & Kontinuität

### Was heißt „ohne Beleg" bei einem Befund?

Der Fakten-Check prüft jedes gemeldete Zitat gegen **genau den Kapiteltext** — dieselbe Prüfung wie
bei der Kanon-Extraktion. Steht das Zitat nicht wörtlich dort, hängt am Befund das Kennzeichen
**„ohne Beleg"**, und der Bericht zählt sie („2 Befunde ohne wörtlichen Beleg im Text"). Der Befund
wird **nicht** gelöscht: Er kann trotzdem stimmen — nur nachweisen lässt er sich nicht. Ein Marker
im Kapiteltext darf sich später ausschließlich auf bestätigte Zitate stützen.

### Es kommen nur Fakten der ersten Kapitel an

Behoben — das war eine **stille Gesamtgrenze** (24 Fakten + 20 Beziehungen) aus dem alten
Ein-Aufruf-Design; alles ab Kapitel 4 wurde verworfen. Jetzt wird nur noch **je Kapitel** begrenzt
(8 Fakten / 6 Beziehungen, so steht es auch im Prompt); das Gesamtergebnis hat nur eine Notbremse
bei 800 Fakten bzw. 500 Beziehungen.

### Warum sind es nach dem Scan weniger Vorschläge als live?

Live siehst du die **rohen** Vorschläge, nach dem Lauf die **belegten**. Verworfen werden:
Vorschläge ohne wörtliches Zitat, Zitate, die nicht im Kapiteltext stehen, Wiederholungen und
Dubletten. Der Dialog nennt beide Zahlen. Wer mehr will, muss den Beleg liefern — das ist der
Preis dafür, dass der Kanon nachprüfbar ist.

### Der Scan lief Minuten und brach dann ab — alles weg

Behoben. Ein einzelnes Kapitel mit unbrauchbarer Modellantwort warf früher den **gesamten** Lauf
weg. Jetzt wird nur dieses Kapitel übersprungen (Warnung im Vorschlagsdialog), der Rest läuft
weiter, und **was gefunden wurde, bleibt** und ist übernehmbar. Der erreichte Kapitelstand wird
beim Übernehmen gemerkt — der nächste Start bietet „bei Kapitel N weitermachen?" an.

### Der Scan läuft lange — kann ich zwischendurch aufhören?

Ja. Übernehmen, was da ist: Der Stand (bis zu welchem Kapitel gescannt wurde) wird gespeichert, der
nächste Lauf macht dort weiter. Übersprungene Kapitel werden als Warnung genannt und können gezielt
nachgeholt werden (Abbrechen im Fortsetzen-Dialog = alles neu scannen).

### Der Scan liefert jedes Mal andere Fakten

Behoben. Ursache war die **Quelle**: Die Ableitung las das Storyboard (Kurzfassungen) und musste
daraus Fakten erfinden. Jetzt liest sie den **Manuskript-Text, Kapitel für Kapitel**, und jeder
Vorschlag braucht ein **wörtliches Zitat** als Beleg, das der Server gegen genau den Text prüft.

### „Kein Manuskript-Text …" beim Ableiten von Fakten

Gewollt: Aus einem Plan (Storyboard) lässt sich nichts belegen. Erst Kapitel schreiben (Rohentwurf
genügt), dann ableiten.

### Es kommen nur wenige Fakten an

Erwartet und beabsichtigt: Nur was wörtlich im Text steht **und** mit einem Zitat belegt ist,
kommt in den Kanon. Wenige belastbare Fakten sind mehr wert als viele Behauptungen — beim
Fakten-Check rächen sich erfundene Fakten sofort. Der Beleg steht im Vorschlagsdialog unter der
Aussage; fehlt er, hat das Modell paraphrasiert (dann fällt der Vorschlag weg).

### Auch Beziehungen fehlen

Beziehungen brauchen ebenfalls einen Beleg aus demselben Kapitel. „Misstrauen" lässt sich nur
aufnehmen, wenn der Text es hergibt — sonst nicht.

---

## Daten & Profile

### Beispiele sind nach dem Löschen wieder da

Sollte nicht passieren: Eine **leer** gewordene Sammlung wird als `[]` gespeichert und
greift **nicht** auf Seeds zurück. Tritt es doch auf, fehlt die Zeile in der Datenbank
(z. B. nach manuellem Löschen in `data/authorai.db` oder `DELETE /api/state?profile=<id>`)
→ dann startet das Profil faktisch neu.

### Streak zeigt 0, obwohl heute geschrieben

Der heutige Tag fließt über `writingDays`/`weeklyWords` ein. Nach der Migration wird
`todayWords` automatisch als Schreib-Tag verbucht. Erst nach einem Reload prüfen.
„Beispielwerte zurücksetzen" nullt den Streak bewusst.

### Wochen-Balken unsichtbar

War ein Layout-Bug (Prozent-Höhe ohne festen Parent). Behoben — Spalten haben eine
definierte Höhe. Browser-Cache leeren (`Ctrl+Shift+R`), falls die alte Version hängt.

### Profil-Daten weg

Profil löschen entfernt dessen Daten **und** dessen eindeutige Cover. Nutze
unterschiedliche Profile wie getrennte Bibliotheken.

---

## Workspace-Sicherung (`backup/backup.py`)

### Ich will vor einem Umbau den kompletten Stand sichern

```bash
python backup/backup.py                 # fragt nach dem Format
python backup/backup.py --format zip     # ohne Rückfrage
```

Läuft außerhalb der App (kein Bun-Task) und legt
`backup/WORKSPACE_v<version>_backup_<Zeitstempel>.<ext>` an. **Vorher den Dev-Server stoppen** —
die SQLite-Datenbank läuft im WAL-Modus. Details: [`development.md`](development.md).

### RAR wird nicht gefunden

Kein Problem: Meldet das Skript „RAR/WinRAR nicht gefunden", wechselt es automatisch auf **ZIP**.
Für RAR muss WinRAR installiert sein (oder `rar`/`winrar` im `PATH` liegen).

### Der Dateiname trägt eine falsche Version

Das Skript liest die **erste** Versions-Überschrift (`## [x.y.z]`) aus dem Root-`CHANGELOG.md`;
erst wenn es keine findet, nimmt es `version` aus `package.json`. Beide Wege waren zwischenzeitlich
gestört — das Root-`CHANGELOG.md` hatte gar keine Versions-Überschriften und hing sieben Releases
zurück, deshalb kam die Version immer aus `package.json`. Behoben: Das Dokument führt jetzt
`## [x.y.z]`-Überschriften. Stimmt der Wert trotzdem nicht, steht im Dokument **nicht** die neueste
Version oben (die erste Überschrift gewinnt). Punkte entfallen im Dateinamen (`0.5.9` → `v059`).

### Das Archiv ist riesig

Erwartet. Ausgeschlossen sind nur `node_modules`, `.turbo`, `.build` und vorhandene Archive —
**enthalten** sind dagegen `.git/` (Historie), `release/` (Builds und Installer), `covers/` und
`data/` (Datenbank). Release-Ordner vorher aufräumen, wenn das Archiv klein bleiben soll.

### Nach dem Entpacken fehlt `backup.py`

Sollte nicht mehr vorkommen. Bis 0.5.9 übersprang das Skript sein **eigenes** `backup/`-Verzeichnis
vollständig — die Sonderregel für `backup.py` war dadurch wirkungslos und das Skript fehlte im
Archiv. Jetzt nimmt es aus `backup/` jede Datei mit, die kein Archiv ist; `backup.py` ist damit
enthalten. Bei einem **alten** Archiv das Skript aus dem Git-Repository nachkopieren.

### Wie hole ich einen Stand zurück?

1. Archiv entpacken.
2. Inhalt über den Workspace kopieren (bestehende Dateien ersetzen).
3. `bun install` (die `node_modules` fehlen bewusst).
4. Server starten — `.env` und `data/authorai.db` sind im Archiv, das Profil ist sofort wieder da.

> Entpackte Archive enthalten die **API-Keys** aus `.env`. Nicht weitergeben, nicht hochladen.

---

## Wenn nichts hilft

1. Terminal-Output des Dev-Servers lesen (dort stehen die API-Fehler).
2. Netzwerk-Tab im Browser prüfen: welche `/api/...`-Route liefert welchen Status?
3. `docs/api.md` für die erwarteten Payloads/Responses heranziehen.
4. Bei Verdacht auf kaputten Storage: `authorai.*`-Keys sichern, dann einzelne Keys löschen.
