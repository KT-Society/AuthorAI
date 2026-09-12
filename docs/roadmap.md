# Roadmap

Was als Nächstes kommen kann — nach Wirkung sortiert, nicht nach Aufwand.
Diese Liste ist ein Ideenpool, keine Zusage.

---

## Nah dran (hoher Nutzen, überschaubar)

### Schreiben & Struktur
- **Versions-Diff**: Unterschiede zwischen zwei Kapitelversionen anzeigen
- **Kapitel-Gerüste**: ganze Kapitelstrukturen als Vorlage wiederverwenden
- **Szenen-Import/Export**: Szenenplan als JSON austauschen

### Kanon & Kontinuität (Anschlüsse an den Fakten-Check)
- **Diff-Vorschau vor dem Übernehmen**: Beheben zeigt vorher/nachher je Stelle, statt direkt zu schreiben
- **Einzelne Widersprüche auswählen**: nur markierte Stellen korrigieren statt „alle"
- **Kanon-Warnung vor dem Speichern**: Kapitel still gegen die Fakten prüfen und erst dann
  ablegen (Widerspruch sichtbar, bevor er sich einbrennt)
- **Prüf-Historie je Kapitel**: letzter Fakten-Check + Ergebnis als Badge im Kapitel
- **Gezielter Check**: nur markierte Fakten oder eine einzelne Figur prüfen

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
- **Streaming für die Prüf-Pass-Queues**: der Fakten-Check streamt live und parallel — Kohärenz,
  Stil und Ausbau laufen noch als stille Schleife ohne Live-Text
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
