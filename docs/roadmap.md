# Roadmap

Was als Nächstes kommen kann — nach Wirkung sortiert, nicht nach Aufwand.
Diese Liste ist ein Ideenpool, keine Zusage.

---

## Nah dran (hoher Nutzen, überschaubar)

### Schreiben & Struktur
- **Versions-Diff**: Unterschiede zwischen zwei Kapitelversionen anzeigen
- **Kapitel-Gerüste**: ganze Kapitelstrukturen als Vorlage wiederverwenden
- **Szenen-Import/Export**: Szenenplan als JSON austauschen

### Export & Ausgabe
- **PDF mit Cover-Seite** (Titelseite aus dem Cover-Bild)
- **DOCX mit Kommentaren** für Lektorats-Workflows
- **Automatische Backups** in Intervallen (lokal)

### Covers
- **Rücken (Spine)** als eigener Layer-Bereich
- **EAN-13-Scan-Test** (Barcode gegen Scanner prüfen)
- **Hintergrund-Filter** für Cover-Bilder (Duotone/Grain)

---

## Mittelfristig

### Inhalt & Qualität
- **Fakten-Check als eigener Report**: Widersprüche getrennt von der Kohärenz prüfen
  (`POST /api/continuity/check` mit `{ ok, violations[] }`)
- **Stil-Profil**: Zielstimme („lakonisch", „barock") als wiederverwendbare Vorgabe
- **Figuren-Entwicklung über die Zeit**: Beziehungs-Intensität pro Kapitel statt global
- **Reihen-Übersicht**: alle Bände einer Reihe mit Fortschritt und Bandlücken auf einen Blick

### Technik & Performance
- **Streaming** langer Ausgaben (SSE) mit Live-Vorschau
- **Fortschritts-Report** pro Queue im Hintergrund (auch bei geschlossenem Dialog)
- **Kosten-/Token-Tracking** pro Lauf (Transparenz über API-Nutzung)
- **Antwort-Cache** für identische Prompts (spart Kosten, beschleunigt Wiederholungen)

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
