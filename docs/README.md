# AuthorAI — Dokumentation

> **Repository:** [github.com/KT-Society/AuthorAI](https://github.com/KT-Society/AuthorAI)
> · **Version:** 0.5.0

Willkommen im Handbuch. Hier steht alles, was du brauchst, um AuthorAI zu verstehen,
zu betreiben und zu erweitern.

## Was ist AuthorAI?

AuthorAI ist eine **lokale KI-Autoren-Werkbank**. Sie führt dich von einer groben Buchidee
über einen strukturierten Plan bis zum fertigen, sprachlich und inhaltlich geprüften
Manuskript — und verwaltet dabei alles, was zu einem Buch gehört: Figuren, Welt, Handlung,
Recherche, Cover und Fortschritt.

Die App läuft vollständig auf deinem Rechner. Ein Bun-Server liefert die Oberfläche aus,
spricht mit den KI-Diensten und speichert generierte Bilder; alle Inhalte liegen in einer
lokalen **SQLite-Datenbank** (`data/authorai.db`), getrennt **pro Profil**.

## Die Idee in einem Satz

> Nicht „Text rein, Text raus", sondern eine **Kette**: Jede KI-Ausgabe landet automatisch
> im richtigen Bereich, ist editierbar, nachprüfbar — und überlebt den Reload.

## Schnelleinstieg

```bash
bun install     # Root + Workspaces
bun run dev     # App auf http://localhost:3000
```

1. **Profil** anlegen („Wer schreibt heute?").
2. **Neues Buch** → Idee eingeben → Model je Schritt setzen.
3. Pipeline durchlaufen: Storyboard → Rohentwurf → Ausbau → Kohärenz → Stil.
4. Zwischendurch jederzeit **Zwischenspeichern**; weiter im Buch-Editor.

## Dokumentationslandkarte

| Dokument | Für wen | Inhalt |
| --- | --- | --- |
| [`architecture.md`](architecture.md) | Entwickler | Schichten, Datenfluss, Grenzen, Design-System |
| [`pipeline.md`](pipeline.md) | alle | Die 6 Stufen der Buch-Erzeugung im Detail |
| [`data-model.md`](data-model.md) | Entwickler | Typen, Felder, Persistenz-Keys |
| [`api.md`](api.md) | Entwickler | Alle HTTP-Routen mit Payloads |
| [`configuration.md`](configuration.md) | Betreiber | `.env`, Modelle pro Stufe, Einstellungen, Profile |
| [`development.md`](development.md) | Entwickler | Setup, Skripte, Konventionen, Verifikation |
| [`release.md`](release.md) | Betreiber | Binary bauen, signieren, Installer, verteilen |
| [`troubleshooting.md`](troubleshooting.md) | alle | Wenn etwas klemmt |
| [`changelog.md`](changelog.md) | alle | Was sich wann geändert hat |
| [`roadmap.md`](roadmap.md) | alle | Was als Nächstes kommen kann |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | Mitwirkende | Workflow, Konventionen, Verifikation |
| [`../CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md), [`../SECURITY.md`](../SECURITY.md) | alle | Umgang miteinander & Sicherheit |

## Konventionen dieser Doku

- Doku-Sprache: **Deutsch** (mit englischen Fachbegriffen, wo sie üblich sind).
- Code-Bezeichner, Routen und Felder bleiben **englisch** (wie im Code).
- Pfade sind relativ zum Repository-Root.
- Wo Verhalten von externen Diensten abhängt, steht es explizit dabei.

## Der Stack in fünf Zeilen

```
Bun          Runtime, Server (Bun.serve), Bundler (Bun.build), Test/Skripte
React 19     UI (Root-App)          ·  React 18 + MUI (promptgen)
Tailwind v4  Design-System (Root)   ·  shadcn/Radix + lucide
OpenRouter   Sprachmodelle          ·  Tavily: Recherche  ·  Pollinations: Bilder
SQLite       Pro-Profil-Daten (data/authorai.db)  ·  localStorage: Profile & Einstellungen
```

## Wo fange ich an?

- **Ich will es nur benutzen** → Root-`README.md`, dann `pipeline.md`.
- **Ich will es verstehen** → `architecture.md`, dann `data-model.md`.
- **Ich will es erweitern** → `development.md`, `api.md`, `architecture.md`.
- **Ich will beitragen** → [`../CONTRIBUTING.md`](../CONTRIBUTING.md).
- **Es funktioniert nicht** → `troubleshooting.md`.

## Projekt & Credits

Entwickelt und gepflegt von **KT-Society & Echo**.

| Rolle | |
| --- | --- |
| Entwicklung | KT-Society, Echo |
| Lizenz | MIT — siehe [`../LICENSE`](../LICENSE) |
