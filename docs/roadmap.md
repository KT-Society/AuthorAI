# Roadmap

Was als Nächstes kommen kann — nach Wirkung sortiert, nicht nach Aufwand.
Diese Liste ist ein Ideenpool, keine Zusage.

---

## Nah dran (hoher Nutzen, überschaubar)

### Schreiben & Struktur
- **Kapitel-Gerüste**: ganze Kapitelstrukturen als Vorlage wiederverwenden
- **Szenen-Import/Export**: Szenenplan als JSON austauschen
- **Drei-Wege-Vergleich**: „aktuell ↔ vor Kohärenz ↔ vor Stil" in einer kombinierten Ansicht

### Kanon & Kontinuität (Anschlüsse an den Fakten-Check)
- **Widerspruchs-Marker im Editor**: gemeldete Zitate direkt im Kapiteltext hervorheben und
  dorthin springen, statt sie nur als Liste zu zeigen
- **„Strenger Modus" (Opt-in)**: blockierendes Speichern, solange ein Kanon-Widerspruch offen
  ist — heute bewusst nur eine Warnung, um keinen Text zu verlieren
- **Kontinuitäts-Verlauf**: Änderungen an Fakten und Beziehungen selbst versionieren (wer hat
  wann was umgestellt)
- **Check-Bericht exportieren**: Fakten-Check-Ergebnis als Markdown/PDF für das Lektorat
- **Assistent-Schritt „Export"**: nach dem Fakten-Check direkt Cover/EPUB/PDF aus dem Assistenten
  erzeugen, statt erst in den Buch-Editor zu wechseln

### Zeit & Chronologie (Anschlüsse an die Timeline-Prüfung)
- **Szenen-Struktur versionieren**: Ein Timeline-Quick-Fix ändert `sceneMeta` und Storyboard-Beats
  — beides liegt außerhalb der Kapitel-Version, deshalb ist der Fix heute nicht rückholbar
  (gesichert ist nur die Diff-Vorschau)
- **Timeline-Prüfung gegen die Prosa**: Der Check liest heute nur die Szenen-Struktur (Zeit,
  Schauplatz, Beats) — Widersprüche, die erst im Fließtext stehen, sieht er nicht (die
  Kohärenz-Prüfung kennt dafür keine Zeitachse)
- **Zeitachse als Ansicht**: Szenen-Zeiten als lineare Zeitlinie (Kapitel × Zeit) mit Konflikten
  und Sprüngen, statt sie als Liste zu lesen

### Export & Ausgabe
- **PDF mit Cover-Seite** (Titelseite aus dem Cover-Bild)
- **DOCX mit Kommentaren** für Lektorats-Workflows
- **Automatische Backups** in Intervallen (lokal)
- **Reihen-Export (Omnibus)**: alle Bände einer Reihe als ein EPUB/PDF mit durchlaufender
  Nummerierung und gemeinsamem Cover (Anschluss an die Reihen-Übersicht)

### Covers
- **Rücken (Spine)** als eigener Layer-Bereich
- **EAN-13-Scan-Test** (Barcode gegen Scanner prüfen)
- **Hintergrund-Filter** für Cover-Bilder (Duotone/Grain)

---

## Mittelfristig

### Inhalt & Qualität
- **Figuren zusammenführen statt löschen**: Dubletten-Aufräumen hängt Fakten und Beziehungen der
  entfernten Figur an die behaltene um (heute werden sie mitgelöscht)
- **Dubletten-Vorschau vor dem Löschen**: anzeigen, was zusammenfällt und was dabei verloren geht
- **Arc-Vorschläge aus dem Manuskript**: die Extraktion schlägt Beziehungs-Verläufe
  (Intensität je Kapitel) vor, statt sie von Hand zu pflegen
- **Arc-Scrubber im Graphen**: Kapitel-Regler, der Knoten und Kanten auf den Stand des
  jeweiligen Kapitels stellt
- **Stil-Profil pro Buch und Reihe**: heute geräteweit — pro Projekt überschreibbar, mit
  Vererbung von der Reihe an ihre Bände
- **Stil-Eichung**: aus eigenen Kapiteln ein Profil vorschlagen („so klingt dieser Roman")
- **Stimmen pro Figur**: Dialogfärbung je Figur, damit Nebenfiguren unterscheidbar sprechen
- **Reihen-Zeitstrahl**: Ereignisse über alle Bände chronologisch, verzahnt mit dem
  Beziehungs-Arc
- **Offene Fäden über Bände**: Foreshadowing-Payoff-Matrix je Reihe (was wurde aufgesetzt,
  was wurde eingelöst)
- **Kanon-Konflikt zwischen Bänden**: widerspricht Band n+1 einem Fakt aus Band n, wird das
  im Fakten-Check als eigener Fall gemeldet

### Technik & Performance
- **Historie als Diff statt Volltext**: Versionen komprimiert ablegen — spart weiter Platz,
  auch wenn das Browser-Limit jetzt keine Rolle mehr spielt
- **Datenbank-Backup und -Kompaktierung**: `VACUUM`/WAL-Checkpoint aus den Einstellungen,
  Sicherung der `.db`-Datei im laufenden Betrieb
- **Mehrere Datenbank-Profile (Dateien)**: Projekte als eigene `.db` öffnen/wechseln
- **Storyboard-Teillauf fortsetzen**: Bricht der Entwurf in Phase 2 ab (Modell-Aussetzer, Timeout),
  beginnt er heute komplett von vorn — sinnvoll wäre, den Rest der Batches nachzuholen
- **Titel vor Phase 2 prüfen**: Die Outline liefert die Kapiteltitel, die Detail-Batches laufen
  sofort los — dazwischen wäre ein Blick/Umbenennen möglich, bevor Detailarbeit bezahlt wird
- **Rohentwurf-Queue im Job-Center**: „Alle Rohentwürfe" im Assistenten hat nur den lokalen
  Balken; als Job überlebt der Fortschritt das Schließen (wie Ausbau und Prüfungen im Editor)
- **Typprüfung als Skript**: `tsc --noEmit` (o. ä.) in den Check aufnehmen — `bun run check`
  prüft nur Syntax, Imports und Links und übersieht Laufzeitfehler wie einen `[0]`-Zugriff auf
  einen `Series | undefined`-Rückgabewert
- **Wortstand live im Editor**: Der Kapitel-Zähler springt heute erst nach dem Abschluss auf den
  neuen Wert — während des Streams könnte er schon mitlaufen (die Vorschau kennt die Zahl bereits)
- **Laufenden Stream wirklich abbrechen**: „Abbrechen" im Job-Center wirkt erst zwischen den
  Kapiteln; ein bereits laufender Aufruf läuft zu Ende (Abbruch am Server fehlt)
- **Stream-Vorschau übernehmen oder verwerfen**: „Text in den Editor übernehmen" und
  „abbrechen" direkt aus der Vorschau
- **Live-Token-/Kostenzähler** während des Streams (verzahnt mit dem Tracking unten)
- **Jobs über Neustart hinweg**: laufende Queues nach einem Reload wiederaufnehmen
- **Job-Historie**: Dauer, Ergebnis und „Wiederholen" für abgeschlossene Läufe
- **Desktop-Benachrichtigung** bei Job-Abschluss (heute nur Toast)
- **Kosten-/Token-Tracking** pro Lauf (Transparenz über API-Nutzung)
- **Cache-Transparenz**: Trefferquote und gesparte Aufrufe in der UI anzeigen
- **Persistenter Cache**: Antworten optional über Neustarts hinweg behalten (opt-in)
- **Sammel-Analysen**: Fakten-Check und Extraktionen über alle Bücher in einem Lauf —
  profitiert maximal vom Cache

### UI & Bedienung
- **Globale Suche/Command-Palette** über Bücher, Kapitel, Figuren, Welt, Notizen
- **Tastatur-Shortcuts** (Kapitel wechseln, speichern, nächste Stufe)
- **Sortieren/Filtern** konsequent überall (Welt, Plot, Notizen)
- **Dark/Hell-Umschalter** (aktuell Dark-only by design)

---

## Langfristig

- **Optionaler Sync/Backend** (Multi-Device, Konten) — bewusst nicht im Kern
- **Kollaboration** (Kommentare, Vorschläge, Review-Modus)
- **Audiobook-Ausgabe** (TTS mit Stimmzuordnung pro Figur)
- **Publishing-Integrationen** (Cover/Manuskript-Export für Plattformen)
- **Analyse-Dashboards** (Lesbarkeit, Tempo-Kurven, Wortwiederholungen)
- **Übersetzungs-Stufe** je Band — Zielsprache behält die Autoren-/Stil-Stimme
- **Eigene Stimme trainieren**: aus vielen eigenen Texten ein Stil-Profil ableiten (lokal)
- **Plug-in-Punkte** für eigene Pipeline-Stufen (z. B. „Übersetzung", „Zusammenfassung")

---

## Bewusst nicht geplant

- **Erzwungene Cloud** — die App bleibt lokal nutzbar, Offline-freundlich.
- **Kostenpflichtige Pflicht-Dienste** — jede externe API ist austauschbar und optional.
- **Secrets im Client** — Keys bleiben immer serverseitig.

---

## Wie du beiträgst

1. Ein Thema aus dieser Liste wählen (oder etwas Neues vorschlagen).
2. Umsetzung nach den Mustern in [`development.md`](development.md)
   (Server → Route → Service → UI; neue Stufe = Checkliste).
3. Verifikation: Syntax-, Import-Check + echter Test des kritischen Pfads.
4. Eintrag in [`changelog.md`](changelog.md).
5. **Thema aus dieser Liste entfernen** und mindestens eine **Anschluss-Idee** ergänzen —
   die Roadmap ist Zukunft, nicht Release-Archiv (siehe `AGENTS.md` → Dokumentations-Update).
