# Roadmap

Was als Nächstes kommen kann — nach Wirkung sortiert, nicht nach Aufwand.
Diese Liste ist ein Ideenpool, keine Zusage.

> **Letzte Prüfung gegen den Code: 16.09.2026 (Stand 0.5.9).** Jeder der 74 Einträge wurde
> daraufhin geprüft, ob seine Begründung („heute ist es so …") noch stimmt und ob er an anderer
> Stelle etwas blockiert. Ein **_Vorsicht:_**-Hinweis nennt einen echten Stolperstein — kein
> Verbot, aber er gehört in die Planung, bevor Arbeit hineingeht. Ein **_Halb da:_**-Hinweis sagt,
> dass ein Teil schon existiert und der Aufwand dadurch kleiner ist als gedacht.

---

## Nah dran (hoher Nutzen, überschaubar)

### Schreiben & Struktur
- **Kapitel-Gerüste**: ganze Kapitelstrukturen als Vorlage wiederverwenden
  *Halb da:* Szenen-Vorlagen gibt es bereits (`data/sceneTemplates.ts`, einfügbar im Buch-Editor);
  es fehlt die Ebene **darüber** — Kapitelgerüste als Vorlage für ein ganzes Buch.
- **Szenen-Import/Export**: Szenenplan als JSON austauschen
  *Vorsicht:* Ein Kapitel führt drei **parallele** Felder (`beats`, `sceneMeta`, `beatCharacters`) —
  sie müssen gemeinsam serialisiert werden, sonst verrutschen die Indizes beim Einlesen.
- **Drei-Wege-Vergleich**: „aktuell ↔ vor Kohärenz ↔ vor Stil" in einer kombinierten Ansicht
  *Halb da:* Der Versions-Dialog vergleicht zwei Stände, und die Snapshots heißen schon
  „vor Kohärenz-Prüfung" / „vor Stil-Prüfung" — es fehlt die dritte Spalte.

### Import & Austausch (Anschlüsse an den Markdown-Import)
- **Figuren je Szene ableiten**: Die Szenen-Ableitung liefert Beat, Zeit, Schauplatz und POV —
  wer in der Szene vorkommt, fehlt noch (das Feld `beatCharacters` bleibt leer)
  *Halb da:* Das Feld ist bereits **durchverkabelt** — die Szenen-Vorgabe reicht es an den Prompt
  durch (`server/story.ts`); es wird nur nirgends gefüllt (nur `[]` geschrieben). Der Aufwand ist
  damit im Wesentlichen Prompt + Übernahme.
- **Ableitung als Vorschau**: „Storyboard/Szenen ableiten" schreibt direkt (mit Rückfrage beim
  Überschreiben) — ein Diff wie bei Kanon und Timeline wäre der bequemere Weg
  *Muster da:* Die Diff-Vorschau existiert zweimal (Kanon-Korrektur, Timeline-Korrektur).
- **DOCX-Import**: Autoren liefern oft `.docx` — Überschriften und Absätze aus dem Word-XML lesen
  *Korrektur:* Die ZIP-Bausteine im Repo sind **nur ein Writer** (`lib/zip.ts`, unkomprimiert) —
  für den Export gebaut. Ein DOCX ist **deflate-komprimiert**: Reader und Inflate fehlen, das
  ist der eigentliche Brocken. Der vorhandene Code hilft dabei nicht.
- **Mehrere Dateien in einem Zug**: einen Stapel Manuskripte importieren und als **Reihe** anlegen
  statt Band für Band
  *Halb da:* Das Reihen-Modell (`data/series.ts`) und der Einzel-Import existieren — es fehlt die
  Schleife plus Reihenbildung im Dialog.
- **Metadaten aus der Überschrift**: `## Kapitel 3 — POV: Aria · Tag 2` beim Import gleich in
  Szenen-Zeit, POV und Schauplatz übernehmen (heute bleibt die Zeile ein reiner Titel)
  *Vorsicht:* POV, Zeit und Schauplatz sind **szenen**bezogene Felder (`sceneMeta`), der Import
  arbeitet **kapitel**bezogen. Die Werte müssen bewusst verteilt werden (erste Szene oder alle) —
  sonst erzeugt der Import Szenen-Metadaten, die niemand erwartet.
- **Kapitelgrenzen im Dialog nachziehen**: erkannte Kapitel vor dem Anlegen verschieben/zusammen-
  fassen, wenn die Überschriften-Heuristik daneben liegt

### Kanon & Kontinuität (Anschlüsse an den Fakten-Check)
- **Kanon-Block nach Relevanz filtern**: Seit der Scan ganze Bücher erfassen kann, wächst der
  Kanon-Block in jedem Prompt mit (Fakten aller Kapitel) — sinnvoll wäre, je Aufruf nur die Fakten
  der beteiligten Figuren und Schauplätze mitzugeben
  *Vorsicht:* Als **harte Weltregeln** markierte Fakten sind für alle Kapitel verbindlich und
  dürfen nie weggefiltert werden. Für den Fakten-Check gibt es außerdem schon eine **manuelle**
  Scope-Wahl (Projekt/Reihe) — die automatische Filterung muss dieselbe Semantik teilen, sonst
  gibt es zwei Wahrheiten.
- **Kanon-Scan als Job**: Der Kapitel-für-Kapitel-Scan läuft im Dialog; als Job im Job-Center
  könnte er laufen, während man woanders arbeitet (Fortschritt und Abbruch inklusive)
  *Vorsicht:* Der Scan schreibt **nichts selbst** — übernommen wird erst nach Bestätigung im
  Review. Ein Job müsste den erreichten Stand retten, nicht die Vorschläge (die bleiben flüchtig).
- **Belege im Kanon sichtbar machen**: Der wörtliche Beleg (`CanonFact.quote`) wird im
  Vorschlagsdialog gezeigt, aber nicht im Fakten-Editor — dort gehört er hin, damit man einen
  Fakt gegen die Stelle im Text prüfen kann
- **Fakt → Textstelle springen**: Aus dem Beleg direkt ins Kapitel an die zitierte Stelle (baut auf
  dem Widerspruchs-Marker unten auf)
  *Vorsicht:* Der Beleg trägt **keinen Offset** im Kapiteltext. Eine gespeicherte Position wäre
  nach jeder Textänderung falsch — gesucht werden muss zur Laufzeit.
- **Widerspruchs-Marker im Editor**: gemeldete Zitate direkt im Kapiteltext hervorheben und
  dorthin springen, statt sie nur als Liste zu zeigen
  *Vorsicht — Voraussetzung fehlt:* Bei der **Extraktion** wird jedes Zitat gegen den Kapiteltext
  geprüft (`quoteMatchesText`), beim **Fakten-Check** dagegen nur auf „nicht leer"
  (`server/continuity.ts`, `normalizeViolations`). Ein Marker kann deshalb ins Leere zeigen. Erst
  die Zitatprüfung angleichen, dann markieren.
- **„Strenger Modus" (Opt-in)**: blockierendes Speichern, solange ein Kanon-Widerspruch offen
  ist — heute bewusst nur eine Warnung, um keinen Text zu verlieren
  *Vorsicht:* Ein Schalter für die Warnung existiert bereits. Blockierendes Speichern wurde
  ausdrücklich verworfen, weil Autosave beim Blockieren Text kosten kann — ein solcher Modus darf
  niemals ungespeicherten Text verwerfen, nur das Weiterarbeiten bremsen.
- **Kontinuitäts-Verlauf**: Änderungen an Fakten und Beziehungen selbst versionieren (wer hat
  wann was umgestellt)
  *Vorsicht:* Fakten und Beziehungen haben **kein** History-Feld (im Gegensatz zum Kapiteltext) —
  das ist eine Datenmodell-Erweiterung, kein UI-Thema.
- **Check-Bericht exportieren**: Fakten-Check-Ergebnis als Markdown/PDF für das Lektorat
  *Vorsicht:* Gespeichert wird heute nur die **Kurzfassung** (Anzahl, Umfang, Hash) — die
  Verletzungen selbst leben nur im laufenden Dialog. Der Export braucht entweder den Lauf im
  Dialog oder einen erweiterten gespeicherten Bericht.
- **Assistent-Schritt „Export"**: nach dem Fakten-Check direkt Cover/EPUB/PDF aus dem Assistenten
  erzeugen, statt erst in den Buch-Editor zu wechseln

### Zeit & Chronologie (Anschlüsse an die Timeline-Prüfung)
- **Szenen-Struktur versionieren**: Ein Timeline-Quick-Fix ändert `sceneMeta` und Storyboard-Beats
  — beides liegt außerhalb der Kapitel-Version, deshalb ist der Fix heute nicht rückholbar
  (gesichert ist nur die Diff-Vorschau)
  *Vorsicht:* Die Kapitel-Version speichert Rohtext und Ausbau — Strukturdaten brauchen eine
  **eigene** Snapshot-Art, nicht ein Anhängsel an `ChapterVersion`.
- **Timeline-Prüfung gegen die Prosa**: Der Check liest heute nur die Szenen-Struktur (Zeit,
  Schauplatz, Beats) — Widersprüche, die erst im Fließtext stehen, sieht er nicht (die
  Kohärenz-Prüfung kennt dafür keine Zeitachse)
  *Vorsicht:* Die Trennung ist **Absicht** — den Fließtext liest die Kohärenz-Prüfung. Wer beides
  zusammenlegt, bezahlt denselben Text zweimal. Sinnvoller ist die klare Zuständigkeit: die
  Timeline liefert das Gerüst, die Kohärenz den Text.
- **Zeitachse als Ansicht**: Szenen-Zeiten als lineare Zeitlinie (Kapitel × Zeit) mit Konflikten
  und Sprüngen, statt sie als Liste zu lesen
  *Vorsicht:* `SceneMeta.time` ist **Freitext** („Tag 2", „drei Wochen später"). Eine Zeitlinie
  braucht erst eine Normalisierung oder ein Modell — sonst sortiert sie Buchstaben.

### Export & Ausgabe
- **PDF mit Cover-Seite** (Titelseite aus dem Cover-Bild)
  *Vorsicht:* Der PDF-Writer setzt heute nur **Text** (Helvetica, WinAnsi) — ein Titelbild
  verlangt eingebettete Bilder im PDF, das ist neue Writer-Arbeit.
- **DOCX mit Kommentaren** für Lektorats-Workflows
- **Automatische Backups** in Intervallen (lokal)
  *Abgrenzung:* Gemeint ist der **Profil-Export** in der App (JSON), nicht der Workspace.
  Der Workspace wird bewusst vom Operator gesichert (`backup/backup.py`) — die App soll ihm
  nicht ins Gehege kommen.
- **Reihen-Export (Omnibus)**: alle Bände einer Reihe als ein EPUB/PDF mit durchlaufender
  Nummerierung und gemeinsamem Cover (Anschluss an die Reihen-Übersicht)

### Covers
- **Rücken (Spine)** als eigener Layer-Bereich
  *Vorsicht:* Das Datenmodell kennt nur Vorder- und Rückseite (`coverUrl`/`coverBackUrl`) und vier
  Text-Layer-Rollen. Ein Rücken ist ein **neues Ziel plus neues Buchfeld** — kein Layer im
  bestehenden Bild.
- **EAN-13-Scan-Test** (Barcode gegen Scanner prüfen)
  *Halb da:* Der Barcode wird schon erzeugt und gezeichnet — es fehlt nur das Gegenlesen.
- **Hintergrund-Filter** für Cover-Bilder (Duotone/Grain)
  *Unkritisch:* Filtern kann clientseitig per Canvas passieren; die Regel „Covers entstehen
  serverseitig, Löschen ist reference-counted" bleibt dabei unberührt.

---

## Mittelfristig

### Inhalt & Qualität
- **Figuren zusammenführen statt löschen**: Dubletten-Aufräumen hängt Fakten und Beziehungen der
  entfernten Figur an die behaltene um (heute werden sie mitgelöscht)
  *Vorsicht:* Ein Zusammenführen muss die Verweise sauber umbiegen (Fakten und Beziehungen hängen
  an der Figuren-ID) — und die Regel „`[]` heißt bewusst geleert" darf dabei nicht verletzt werden.
- **Dubletten-Vorschau vor dem Löschen**: anzeigen, was zusammenfällt und was dabei verloren geht
  *Halb da:* Der Vergleich und die Zählung existieren (`lib/characterMatch.ts`), die Bestätigung
  nennt bereits Zahlen — es fehlt die **Liste**: wer fällt weg, welche Fakten hängen daran.
- **Arc-Vorschläge aus dem Manuskript**: die Extraktion schlägt Beziehungs-Verläufe
  (Intensität je Kapitel) vor, statt sie von Hand zu pflegen
  *Vorsicht:* Die Extraktion **entdoppelt Beziehungen über Kapitel hinweg** — genau das
  unterdrückt den Verlauf, den ein Arc braucht. Die Dedupe muss erst auf „je Kapitel" umgestellt
  werden, sonst liefert das Feature strukturell nichts.
- **Arc-Scrubber im Graphen**: Kapitel-Regler, der Knoten und Kanten auf den Stand des
  jeweiligen Kapitels stellt
  *Halb da:* `arcAt()` (Intensität zu einem Kapitel) ist bereits implementiert — und hat bislang
  **keinen Aufrufer**. Der Regler ist damit fast reine UI-Arbeit.
- **Stil-Profil pro Buch und Reihe**: heute geräteweit — pro Projekt überschreibbar, mit
  Vererbung von der Reihe an ihre Bände
  *Vorsicht:* Pro-Projekt-Daten gehören laut harter Regel 3 in die SQLite-Sammlung (Whitelist)
  beziehungsweise an das Buch — `styleProfile` ist dort noch keine Sammlung. Ein Stil-Profil im
  Projekt-Storage wäre ein Regelbruch.
- **Stil-Eichung**: aus eigenen Kapiteln ein Profil vorschlagen („so klingt dieser Roman")
- **Stimmen pro Figur**: Dialogfärbung je Figur, damit Nebenfiguren unterscheidbar sprechen
  *Halb da:* Jede Figur hat bereits ein Sprachprofil (`soul.speech`) — es wird aber nur als
  Textkopie im Generator benutzt. Die Pipeline bekommt heute nur die Figurenliste, keine Stimme.
- **Reihen-Zeitstrahl**: Ereignisse über alle Bände chronologisch, verzahnt mit dem
  Beziehungs-Arc
  *Vorsicht:* Es gibt kein globales Chronologie-Modell — nur Freitext-Zeiten je Szene und
  Kapitelnummern. Baut auf der Normalisierung aus „Zeitachse als Ansicht" auf.
- **Offene Fäden über Bände**: Foreshadowing-Payoff-Matrix je Reihe (was wurde aufgesetzt,
  was wurde eingelöst)
  *Vorsicht:* `foreshadowing` ist ein freies Text-Array ohne IDs — eine Matrix braucht erst ein
  Faden-Modell (Setzen und Einlösen müssen einander erkennen können).
- **Kanon-Konflikt zwischen Bänden**: widerspricht Band n+1 einem Fakt aus Band n, wird das
  im Fakten-Check als eigener Fall gemeldet
  *Korrektur:* Geprüft wird **schon** über die ganze Reihe (der Kanon-Scope kann alle Bände
  umfassen). Was fehlt, ist die **Herkunft**: Meldungen und Fakten tragen keine Band-Angabe, ein
  Widerspruch ist also nicht als „Band 2 gegen Band 1" erkennbar. Es braucht ein Buch-/Band-Feld
  am Fakt, keine neue Prüfung.

### Technik & Performance
- **Historie als Diff statt Volltext**: Versionen komprimiert ablegen — spart weiter Platz,
  auch wenn das Browser-Limit jetzt keine Rolle mehr spielt
  *Vorsicht:* Restore, Diff und das Speicher-Budget rechnen alle mit dem **Volltext**. Delta-
  Speicherung berührt damit drei Baustellen gleichzeitig — sorgfältig abwägen, der Gewinn ist heute
  gering (kein Browser-Limit mehr).
- **Datenbank-Backup und -Kompaktierung**: `VACUUM`/WAL-Checkpoint aus den Einstellungen,
  Sicherung der `.db`-Datei im laufenden Betrieb
  *Halb da:* `GET /api/store/info` und der Client-Helfer existieren, der WAL-Modus ist an — die
  Route wird aber **nirgends angezeigt** (geladen und wieder vergessen). Die Anzeige ist der
  billigste Einstieg.
- **Sicherung im laufenden Betrieb**: Das Workspace-Archiv (`backup/backup.py`) nimmt die
  SQLite-Datei samt `-wal`/`-shm` mit — sauberer wäre ein `VACUUM INTO`-Snapshot aus dem
  laufenden Server, damit die Sicherung ohne Serverstopp konsistent ist
- **Mehrere Datenbank-Profile (Dateien)**: Projekte als eigene `.db` öffnen/wechseln
  *Vorsicht:* Fachdaten laufen ausschließlich über `store.ts` + `/api/state` (harte Regel 3).
  `databaseFile()`, Store-Info und die Cover-Freigabe hängen alle an **einer** Datei — ein Wechsel
  ist ein Umbau an der Speicherschicht, nicht ein Dialog.
- **Storyboard-Teillauf fortsetzen**: Bricht der Entwurf in Phase 2 ab (Modell-Aussetzer, Timeout),
  beginnt er heute komplett von vorn — sinnvoll wäre, den Rest der Batches nachzuholen
  *Vorsicht:* Teil-Batches müssen persistiert und über eine neue Route fortgesetzt werden —
  **Transport zuerst entscheiden** (Stream-First, `AGENTS.md` Regel 10). Präzedenzfall ist der
  Kanon-Scan (`canonScannedChapters`).
- **Titel vor Phase 2 prüfen**: Die Outline liefert die Kapiteltitel, die Detail-Batches laufen
  sofort los — dazwischen wäre ein Blick/Umbenennen möglich, bevor Detailarbeit bezahlt wird
  *Vorsicht:* Heute ist das **ein** SSE-Aufruf; ein Zwischenstopp macht daraus zwei Requests
  (neue Route) → Transport-Entscheid nötig.
- **Rohentwurf-Queue im Job-Center**: „Alle Rohentwürfe" im Assistenten hat nur den lokalen
  Balken; als Job überlebt der Fortschritt das Schließen (wie Ausbau und Prüfungen im Editor)
  *Halb da:* Dasselbe Muster existiert im Buch-Editor schon — der Assistent nutzt es nur nicht.
- **Typprüfung als Skript**: `tsc --noEmit` (o. ä.) in den Check aufnehmen — `bun run check`
  prüft nur Syntax, Imports und Links und übersieht Laufzeitfehler wie einen `[0]`-Zugriff auf
  einen `Series | undefined`-Rückgabewert
  *Vorsicht:* `tsconfig` ist **`strict` + `noUncheckedIndexedAccess`** — ein erster `tsc`-Lauf deckt
  mit hoher Wahrscheinlichkeit Altlasten auf. Erst den Umfang messen, dann entscheiden: bestehende
  Fehler werden nicht stillschweigend mitgeschleppt (Zero-Warning), aber auch nicht heimlich
  gefixt. Der erste Schritt ist ein **Melde-Lauf**, kein Blockade-Gate für die CI.
- **Wortstand live im Editor**: Der Kapitel-Zähler springt heute erst nach dem Abschluss auf den
  neuen Wert — während des Streams könnte er schon mitlaufen (die Vorschau kennt die Zahl bereits)
- **Laufenden Stream wirklich abbrechen**: „Abbrechen" im Job-Center wirkt erst zwischen den
  Kapiteln; ein bereits laufender Aufruf läuft zu Ende (Abbruch am Server fehlt)
  *Vorsicht:* Das ist eine Kette über drei Schichten: der Job kennt nur ein flüchtiges Flag, der
  Stream-Client schickt kein `signal`, und die Server-Route reicht `request.signal` nicht bis zum
  `fetch` durch. Erst ganz durchziehen, dann ist der Knopf ehrlich.
- **Stream-Vorschau übernehmen oder verwerfen**: „Text in den Editor übernehmen" und
  „abbrechen" direkt aus der Vorschau
  *Vorsicht:* Heute wird das Ergebnis **automatisch** übernommen — „verwerfen" verlangt ein
  Staging. Das Muster gibt es (die Diff-Vorschau-Dialoge schreiben erst nach Bestätigung).
- **Live-Token-/Kostenzähler** während des Streams (verzahnt mit dem Tracking unten)
  *Vorsicht:* Die LLM-Schicht liest `usage` heute gar nicht; manche Anbieter liefern es im Stream
  nur auf Anforderung. Kosten brauchen zusätzlich Modell-Preise — das ist ein eigenes Datenfeld,
  keine Anzeige.
- **Jobs über Neustart hinweg**: laufende Queues nach einem Reload wiederaufnehmen
  *Vorsicht:* Der Job-Store ist ein **Client**-Singleton ohne Gedächtnis, und die Queues leben in
  React-Callbacks. Für „über den Reload" braucht es Server-Zustand plus gespeicherte
  Queue-Definition — kein kleines Feature.
- **Job-Historie**: Dauer, Ergebnis und „Wiederholen" für abgeschlossene Läufe
  *Halb da:* Start- und Endzeitpunkt werden erfasst, das Ergebnis wird angezeigt. Es fehlen die
  Dauer (reine Anzeige) und das Wiederholen — dafür müssen die **Aufrufparameter** mitgespeichert
  werden, die heute in den Komponenten liegen.
- **Desktop-Benachrichtigung** bei Job-Abschluss (heute nur Toast)
- **Kosten-/Token-Tracking** pro Lauf (Transparenz über API-Nutzung)
- **Cache-Transparenz**: Trefferquote und gesparte Aufrufe in der UI anzeigen
  *Halb da:* `cacheStats()` (Treffer, Fehlschläge, Größe) existiert schon — es fehlen nur Route
  und Anzeige.
- **Persistenter Cache**: Antworten optional über Neustarts hinweg behalten (opt-in)
  *Vorsicht:* Der Cache ist bewusst **flüchtig**. Ein Platten-Cache braucht einen definierten Ort
  außerhalb der `state`-Sammlung (harte Regel 3) und eine Größen-/Lebensdauer-Entscheidung.
- **Sammel-Analysen**: Fakten-Check und Extraktionen über alle Bücher in einem Lauf —
  profitiert maximal vom Cache
  *Vorsicht:* Läuft über viele Kapitel und Bücher → Stream-First ist Pflicht (Regel 10). Der
  Nutzen hängt daran, ob der Cache bis dahin über den Lauf hinaus lebt (siehe oben).

### UI & Bedienung
- **Globale Suche/Command-Palette** über Bücher, Kapitel, Figuren, Welt, Notizen
  *Halb da:* Suche gibt es je Bereich (Kapitel, Welt, Recherche), die Top-Bar filtert nur Bücher.
  Was wirklich fehlt: eine **bereichsübergreifende** Suche — heute findet keine Suche Figuren und
  Kanon mit.
- **Tastatur-Shortcuts** (Kapitel wechseln, speichern, nächste Stufe)
  *Halb da:* Bisher gibt es nur `Escape`/`Enter` in Dialogen.
- **Sortieren/Filtern** konsequent überall (Welt, Plot, Notizen)
  *Korrektur:* **Filtern** existiert in Welt, Plot und Notizen bereits. Es fehlt vor allem das
  **Sortieren** — das hat bislang nur die Bibliothek.
- **Dark/Hell-Umschalter** (aktuell Dark-only by design)
  *Vorsicht:* Die Hell-Tokens existieren, aber der Glass-Stil ist auf dunkel gerechnet
  (weiße Transparenzen, harte Schatten). Hell ist mehr als ein Klassenwechsel — sonst wird es
  unlesbar.
- **Undo für „Alle löschen"**: Das Leeren ganzer Bereiche ist endgültig (nur Rückfrage) —
  ein Sicherungs-Snapshot mit „Rückgängig" im Toast wäre der bequemere Weg
  *Vorsicht:* Eine leere Sammlung heißt bewusst „bewusst geleert" (harte Regel 3) — der Snapshot
  muss **vor** dem Leeren entstehen, sonst umgeht Undo genau diesen Kontrakt.
- **Papierkorb statt endgültig**: gelöschte Figuren/Welteneinträge/Kanon-Einträge parken und
  einzeln wiederherstellen, statt sie sofort zu entfernen
  *Vorsicht:* Dieselbe `[]`-Semantik wie oben. Vorbild für geparkte Referenzen ist die
  Reference-Counted Cover-Freigabe — sie zeigt, wie ein „geparkt" sauber aussieht.

---

## Langfristig

- **Optionaler Sync/Backend** (Multi-Device, Konten) — bewusst nicht im Kern
  *Grenze:* Nur solange er **optional** bleibt. Konten und Identität sind komplett neu und
  serverseitig zu denken; lokal-offline muss der Default bleiben (siehe „Bewusst nicht geplant").
- **Kollaboration** (Kommentare, Vorschläge, Review-Modus)
  *Grenze:* Ist der schwierigere Teil des Sync-Themas — es braucht geteilten Server-State und eine
  Identität; heute gibt es nur lokale Profile ohne Auth.
- **Audiobook-Ausgabe** (TTS mit Stimmzuordnung pro Figur)
  *Grenze:* Der Schlüssel liegt wieder serverseitig, und der Dienst muss optional bleiben —
  ohne TTS-Key muss alles andere weiterlaufen.
- **Publishing-Integrationen** (Cover/Manuskript-Export für Plattformen)
  *Grenze:* Plattform-Zugangsdaten sind Secrets (harte Regel 2) — derselbe Weg wie der eigene
  LLM-Anbieter.
- **Analyse-Dashboards** (Lesbarkeit, Tempo-Kurven, Wortwiederholungen)
  *Unkritisch:* Reine Client-Auswertung des vorhandenen Textes, keine Grenze betroffen.
- **Übersetzungs-Stufe** je Band — Zielsprache behält die Autoren-/Stil-Stimme
  *Vorsicht:* Der Language-Lock (harte Regel 5) muss die **Zielsprache** sein, nicht die
  Buchsprache — sonst übersetzt das Modell ins Deutsche zurück. Es ist Prosa, also Stream zuerst
  (Regel 10).
- **Eigene Stimme trainieren**: aus vielen eigenen Texten ein Stil-Profil ableiten (lokal)
  *Unkritisch:* Kein Modell-Hardcode nötig (Regel 4), das Stil-Profil ist heute ein Preset +
  Freitext und damit erweiterbar.
- **Plug-in-Punkte** für eigene Pipeline-Stufen (z. B. „Übersetzung", „Zusammenfassung")
  *Vorsicht:* Kollidiert mit der **Server-only-Grenze** (harte Regel 1) und dem fest verdrahteten
  Stufen-Enum samt festen Routen. Fremder Code im Server braucht eine bewusste Entscheidung
  (Sandbox, erlaubte Fähigkeiten) — nicht nur einen Ordner, in den man Dateien legt.

---

## Bewusst nicht geplant

- **Erzwungene Cloud** — die App bleibt lokal nutzbar, Offline-freundlich.
- **Kostenpflichtige Pflicht-Dienste** — jede externe API ist austauschbar und optional.
- **Secrets im Client** — Keys bleiben immer serverseitig.

> Alles unter „Langfristig" muss diese drei Zeilen aushalten. Ein Feature, das nur mit
> Pflicht-Cloud, Pflicht-Dienst oder Client-Key funktioniert, ist kein Roadmap-Thema, sondern
> eine Produktentscheidung.

---

## Wie du beiträgst

1. Ein Thema aus dieser Liste wählen (oder etwas Neues vorschlagen).
2. Umsetzung nach den Mustern in [`development.md`](development.md)
   (Server → Route → Service → UI; neue Stufe = Checkliste).
   **Transport zuerst entscheiden** (Stream-First) — bei allen Stufen, die über viele Kapitel
   laufen oder Prosa liefern.
3. Verifikation: Syntax-, Import-Check + echter Test des kritischen Pfads.
4. Eintrag in [`changelog.md`](changelog.md).
5. **Thema aus dieser Liste entfernen** und mindestens eine **Anschluss-Idee** ergänzen —
   die Roadmap ist Zukunft, nicht Release-Archiv (siehe `AGENTS.md` → Dokumentations-Update).
