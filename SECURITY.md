# Security Policy

**Repository:** <https://github.com/KT-Society/AuthorAI>

## Unterstützte Versionen

| Version | Unterstützt |
| --- | --- |
| 0.2.x | ✅ |
| < 0.2 | ❌ |

## Sicherheitslücken melden

**Bitte niemals ein öffentliches Issue für Sicherheitslücken öffnen.**

Nutze GitHubs **Private Vulnerability Reporting** für dieses Repository:
**<https://github.com/KT-Society/AuthorAI/security/advisories/new>**
(Repository → *Security* → *Report a vulnerability*.)

Alternativ: kontaktiere die Maintainer (**KT-Society & Echo**) direkt und privat.

Bitte gib mit an:

- betroffene Version / Commit,
- betroffener Bereich (Datei/Route),
- Reproduktionsschritte oder PoC,
- mögliche Auswirkung.

Wir bestätigen den Eingang und melden uns mit einem Fix-Plan. Bitte keine Details
veröffentlichen, bevor ein Fix verfügbar ist.

## In Scope

- **Secrets/Keys**, die an den Client gelangen, geloggt oder in Fehlermeldungen ausgegeben werden
- **Verletzung der Server-only-Grenze** (`src/server/*` im Client-Bundle)
- **Path Traversal** oder unbefugtes Lesen/Löschen im Cover-Speicher (`/covers/:file`, `/api/cover/:file`)
- **Prompt-Injection**, die zu Datenabfluss oder unautorisierten Datei-Operationen führt
- **Rechteausweitung** zwischen Profilen (Zugriff auf Daten eines anderen Profils)

## Out of Scope

- Qualität, Länge oder Sprache von LLM-Ausgaben (Modell-/Prompt-Thema, kein Security-Bug)
- Fehler in Drittanbieter-Diensten (OpenRouter, Tavily, Pollinations) — bitte dort melden
- Lokale Key-Verwaltung auf dem Rechner des Nutzers (BYOK)

## Grundsätze

- Keine Telemetrie, keine Secrets im Client, keine Keys in Logs.
- `.env` ist gitignored und wird nur serverseitig gelesen.
- Generierte Cover werden **reference-counted** gelöscht; Seed-Cover sind geschützt.
