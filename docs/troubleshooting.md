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
bun run build:binary        # → dist/authorai[.exe]
```

Manuell wäre es `bun build --compile src/index.ts --outfile dist/authorai` —
das Skript setzt zusätzlich das Tailwind-Plugin und die Produktions-Defines.

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

## Daten & Profile

### Beispiele sind nach dem Löschen wieder da

Sollte nicht passieren: Eine **leer** gewordene Sammlung wird als `[]` gespeichert und
greift **nicht** auf Seeds zurück. Tritt es doch auf, wurde der Key entfernt (z. B. durch
manuelles Löschen aller `authorai.*`-Keys) → dann startet das Profil faktisch neu.

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

## Wenn nichts hilft

1. Terminal-Output des Dev-Servers lesen (dort stehen die API-Fehler).
2. Netzwerk-Tab im Browser prüfen: welche `/api/...`-Route liefert welchen Status?
3. `docs/api.md` für die erwarteten Payloads/Responses heranziehen.
4. Bei Verdacht auf kaputten Storage: `authorai.*`-Keys sichern, dann einzelne Keys löschen.
