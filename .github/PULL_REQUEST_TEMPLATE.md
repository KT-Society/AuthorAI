# Pull Request

## Ziel

<!-- Was ändert dieser PR und warum? -->

## Art der Änderung

- [ ] 🐛 Bugfix
- [ ] ✨ Feature
- [ ] ♻️ Refactor
- [ ] 📚 Doku
- [ ] 🔧 Tooling / CI
- [ ] 🎨 UI

## Wie getestet

<!-- Schritte, Testfälle, betroffene Bereiche -->

## Screenshots (bei UI-Änderungen)

<!-- Vorher/Nachher, falls hilfreich -->

## Checkliste

- [ ] `bun run check` läuft **grün** (Syntax, Imports, Links)
- [ ] Kritische Pfade real getestet (z. B. ein LLM-Pfad, Cover, pure Logik)
- [ ] **Keine Secrets/Keys** in Code, Logs, Screenshots oder Commits
- [ ] **Server/Client-Grenze** beachtet (`src/server/*` nie im Client-Bundle)
- [ ] **Persistenz-Regeln** beachtet (Fachdaten über `/api/state` → SQLite, pro Profil; `localStorage` nur für Profile/geräteweite Einstellungen)
- [ ] Bei Verhaltensänderungen: `docs/changelog.md` ergänzt und Doku aktualisiert
- [ ] Kein hartcodiertes Model, Language-Lock in neuen Prompts vorhanden

## Verwandte Issues

<!-- Fixes #… / Closes #… -->
