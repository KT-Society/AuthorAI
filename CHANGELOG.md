# Changelog

Die vollständige Historie pflegen wir in **[`docs/changelog.md`](docs/changelog.md)** —
inklusive aller Details zu Funktionen, Änderungen und Fixes. Hier steht die Kurzfassung je
Release, neueste zuerst.

Repository: <https://github.com/KT-Society/AuthorAI>

> Die Versions-Überschriften (`## [x.y.z]`) sind **kein** Schmuck: `backup/backup.py` liest die
> Version für seinen Dateinamen daraus (Fallback: `package.json`), und `bun run version:bump`
> bricht ab, wenn die Zielversion hier fehlt. Beim Bump also **vorher** nachziehen —
> siehe [`docs/release.md`](docs/release.md).

## [0.6.0] — 2026-09-16

- **Der Kanon ist jetzt nachprüfbar**: Der Fakten-Check hält jedes gemeldete Zitat gegen den
  Kapiteltext (wie schon die Extraktion) und kennzeichnet Befunde ohne wörtlichen Beleg als
  **„ohne Beleg"** — sie bleiben erhalten und werden gezählt, statt still zu verschwinden. Der
  Beleg steht außerdem dort, wo der Fakt gepflegt wird (Figuren-Panel und Faktenliste).
- **Figuren je Szene**: Die Szenen-Ableitung erkennt, wer in einer Szene vorkommt (Namen aus dem
  Text, höchstens fünf, nie erfunden) und ordnet sie den Figuren des Projekts zu. Szenen-Chips,
  Timeline und Generierung wissen damit, wer auftritt.
- **Ableitungen schreiben erst nach der Vorschau**: „Storyboard ableiten" und „Szenen ableiten"
  zeigen ihr Ergebnis als Diff — je Feld beziehungsweise je Kapitel — und schreiben erst nach dem
  Übernehmen. Beim Storyboard wählt man danach zwischen „alles überschreiben" und „nur leere Felder
  füllen"; bei Szenen lassen sich einzelne Kapitel abwählen. Die Rückfrage vor dem Lauf ist weg
  (sie war geraten, bevor das Ergebnis bekannt war).
- **Figuren-Dubletten werden zusammengeführt statt gelöscht**: Der Aufräum-Dialog zeigt vorab, wer
  bleibt, wer verschwindet und was daran hängt. Beim Zusammenführen wandern Fakten und Beziehungen
  auf die behaltene Figur; doppelte Aussagen werden zusammengefasst. Vorher waren sie mitgelöscht
  worden — stiller Datenverlust genau dort, wo man aufräumt.
- **Sicherung im laufenden Betrieb**: Die Einstellungen laden eine konsistente Kopie der Datenbank
  als Datei herunter (`VACUUM INTO`, ohne die lebende Datei anzufassen), komprimieren sie auf
  Wunsch (Checkpoint + `VACUUM`, mit Angabe der gesparten Bytes) und zeigen endlich Pfad, Größe und
  Umfang — die Anzeige war vorher ein toter Pfad.
- **Cache-Transparenz**: Trefferquote, Treffer, Fehlschläge und Umfang des Antwort-Caches stehen in
  den Einstellungen, samt „Cache leeren". Die Zählung gab es im Server schon, benutzt wurde sie nie.
- **Komfort im Alltag**: „Alle Rohentwürfe" im Assistenten läuft jetzt als Job (Fortschritt und
  Abbruch überleben das Schließen), der Kapitel-Kopf zählt **während** des Streams mit, und
  Weltenbau, Plot-Board und Recherche lassen sich sortieren, ohne die bisherige Reihenfolge zu
  verlieren.

## [0.5.9] — 2026-09-16

- **Kanon belegt statt geraten**: Die Fakten-Ableitung liest den **Manuskript-Text, Kapitel für
  Kapitel**, und jeder Vorschlag braucht ein **wörtliches Zitat**, das der Server gegen genau
  diesen Text prüft. Erfundene oder paraphrasierte Fakten fallen weg — der Kanon ist nachprüfbar.
- **Keine stille Obergrenze mehr**: Eine alte Gesamtgrenze (44 Fakten) warf alles ab Kapitel 4
  weg. Jetzt wird **je Kapitel** begrenzt, und ein einzelnes unbrauchbares Kapitel reißt den Lauf
  nicht mehr ab — was gefunden wurde, bleibt.
- **Scan fortsetzbar**: Jedes Buch merkt sich den gescannten Kapitelstand und bietet beim nächsten
  Lauf „bei Kapitel N weitermachen?" an.
- **Manuskript-Import**: Markdown- und Textdateien werden **im Browser** gelesen und als
  vollständiges Projekt angelegt — Kapitel heuristisch erkannt, Szenen aus Szenentrennern,
  Round-Trip mit dem eigenen Export.
- **Struktur aus dem Manuskript ableiten**: „Storyboard ableiten" und „Szenen ableiten" füllen
  Titel, Kurzfassungen, POV, Schauplatz und Beats für importierte Bücher — beide **gestreamt**,
  mit Live-Vorschau und Job im Job-Center.
- **Bereiche leeren**: „Alle löschen" in Charaktere, Weltenbau und Kontinuität — mit Rückfrage,
  Kettenwirkung und **dauerhaft** (gelöschte Einträge kommen nicht mehr zurück).
- **Live-Vorschläge für Timeline, Weltenbau und Figuren** (JSONL; am Ende immer die validierte
  Fassung).

## [0.5.5] — 2026-09-14

**Timeline-Quick-Fix** mit Diff-Vorschau, **Live-Vorschau überall** plus Fortschritt im
Job-Center, Assistent mit Fakten-Check und Wiedereinstieg, **eigener LLM-Anbieter**
(OpenAI-kompatibel, Key bleibt serverseitig), Kanon-Komfort und Versions-Diff.

## [0.5.0] — 2026-09-13

Kontinuitäts-Ableitung **live** (JSONL) mit Dubletten-Erkennung, **Kohärenz und Stil gestreamt**
(Teil-Ereignisse im Editor), Figuren-Dubletten, Fakten-Check mit Streaming und Quick Fix.

## [0.4.0] — 2026-09-12

Drei Meilensteine in einer Version: **Kontinuitäts-Datenbank & Beziehungsgraph** (0.3.0),
**Serien-Modus** mit geteiltem Kanon (0.3.1) und das **Mittelfristig-Paket** (Fakten-Check,
Stil-Profil, Reihen-Übersicht, Antwort-Cache, Beziehungs-Arc, Job-Center und Streaming).

## [0.2.0] — 2026-09-11

- **Szenen-Ziele** (Wortziel pro Szene) und **Timeline-Validierung** der Szenen-Zeitangaben
- **Export**: EPUB (mit Cover), **DOCX** fürs Lektorat, Markdown, sauberes PDF über den Reader,
  inklusive **Teil-Export** (Gesamtbuch · Akt I–III · einzelnes Kapitel)
- **Backup**: alle Profildaten als JSON exportieren/importieren

## [0.1.0] — 2026-09-11

Erster vollständiger Stand: Bun-Monorepo, AuthorAI-Dashboard, sechsstufige Buch-Pipeline
(Storyboard → Rohentwurf → Ausbau → Kohärenz → Stil), Charaktere inkl. Soul-Scan,
Weltenbau, Plot-Board, Recherche, Cover-Pipeline mit Text-Editor, Profile, Streak,
Notifications und Statistiken.

→ Details, Migrationen und behobene Fehler: [`docs/changelog.md`](docs/changelog.md)
