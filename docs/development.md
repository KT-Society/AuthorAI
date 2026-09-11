# Entwicklung

Alles, was du zum Mitarbeiten brauchst: Setup, Skripte, Konventionen und die
Verifikations-Workflows, mit denen Änderungen abgesichert werden.

---

## Voraussetzungen

- **Bun** ≥ 1.3 (Runtime, Bundler, Paketmanager, Skript-Runner)
- Ein **OpenRouter-Key** (LLM), **Tavily-Key** (Recherche), **Pollinations-Key** (Cover)
- Windows/macOS/Linux (der Servercode ist plattformneutral)

---

## Setup

```bash
bun install                 # Root + alle Workspaces (immer im Repo-Root!)
cp .env.example .env        # falls vorhanden, sonst .env manuell anlegen
bun run dev                 # Root-App :3000, promptgen :3001
```

Keys siehe [`configuration.md`](configuration.md).

---

## Skripte

| Befehl | Wirkung |
| --- | --- |
| `bun run dev` | Root **und** Workspaces im Dev-Modus (HMR) |
| `bun run build` | Root **und** Workspaces bündeln (`dist/`) |
| `bun run start` | Produktions-Builds servieren |
| `bun run dev:root` / `build:root` / `start:root` | nur die Root-App |
| `bun run --cwd packages/promptgen dev` | nur promptgen |
| `ALL_DRY=1 bun run scripts/all.ts dev` | Tasks nur auflisten (Dry-Run) |

---

## Arbeitsweise in diesem Repo

- **Der Operator führt aus:** `bun install`, Builds, Git-Commits/Pushes, Backups.
  Der Agent **schreibt Code** und verifiziert statisch.
- **Zero-Warning-Haltung:** Warnungen (Build, Typen, Lint) gelten als Mangel und werden
  an der Wurzel behoben — nicht ignoriert.
- **Bestehende Testfehler** werden nicht eigenmächtig angefasst; neue Fehler schon.

---

## Konventionen

### Server vs. Client (harte Grenze)

- **`src/server/*` ist server-only.** Diese Module dürfen **niemals** aus Client-Code
  importiert werden. Sie greifen auf `process.env` und Node-APIs zu.
- **`src/services/*` ist client-only** und spricht ausschließlich lokale `/api/*`-Routen.
- **Secrets** werden nie an den Client gegeben. Neue Keys: nur im Server lesen.
- TypeScript-Alias `@promptgen/*` bindet **nur** Server-Module der Engine.

### Neue API-Funktion (Muster)

1. **Server:** Funktion in `src/server/*` (nutzt `chatCompletion` / `ApiError`).
2. **Route:** Handler in `src/index.ts` mit `readJson`, Validierung, `errorResponse`.
3. **Service:** dünner Wrapper in `src/services/*` über `postJson`.
4. **UI:** View/Dialog konsumiert nur den Service.

### Neue Pipeline-Stufe (Checkliste)

- [ ] `ModelStage` + Label + Key in `lib/generationSettings.ts`
- [ ] Server-Funktion in `src/server/story.ts`
- [ ] Route in `src/index.ts`
- [ ] Service in `src/services/story.ts`
- [ ] `WizardStep` (data/story.ts) + `STEPS` + Stage-Mapping im `BookWizard`
- [ ] Schritt-UI + Footer-Aktion + Save-Persistenz
- [ ] Feld-/Status-Anzeige im `BookDetailView` (Plates/Buttons)

### Neue Domäne (z. B. „Timeline")

- [ ] Typ + Seeds in `src/data/<domäne>.ts`
- [ ] Persistenz-Name in `lib/persistence.ts` (+ `clearProfileData`)
- [ ] View in `components/dashboard/`
- [ ] Nav-Eintrag in `Sidebar.tsx` + Routing in `Dashboard.tsx`
- [ ] Optional: Auto-Import aus dem Storyboard

### UI

- Bestehende Primitives nutzen: `Panel`, `PanelHeader`, `ViewHeader`, `Badge`,
  `ProgressBar`, `Sparkline`, `EmptyState` (`components/dashboard/primitives.tsx`).
- Styling über Tailwind-Utilities + Brand-Tokens; **keine** Inline-Hexfarben wo Tokens existieren.
- Dialoge: Overlay + `glass-strong`, Escape schließt, Klick außerhalb schließt.
- Keine Platzhalter-Inhalte; reale Daten oder klarer Leerzustand.

### Persistenz

- Pro Profil: `authorai.<profilId>.<sammlung>` über `lib/persistence.ts`.
- **Nicht** direkt `localStorage` benutzen (außer in `lib/*`).
- „leer vs. nie gesetzt"-Semantik beachten (siehe `data-model.md`).
- Objekt-Stores (z. B. `meta`) laufen über eigene `load*/save*`-Funktionen.

---

## Verifikation

Da im Repo statisch gearbeitet wird, sind drei Checks Standard:

### 1. Syntax-Check (Bun-Transpiler, ohne Dependencies)

```bash
bun -e "const fs=require('node:fs'),path=require('node:path');
const t=new Bun.Transpiler({loader:'tsx'});let bad=0,files=0;
const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){
const p=path.join(d,e.name);if(e.isDirectory()){if(e.name==='node_modules')continue;walk(p);continue;}
if(!/\.(ts|tsx)$/.test(e.name))continue;files++;
try{t.transformSync(fs.readFileSync(p,'utf8'))}catch(err){bad++;console.log('FAIL',p,String(err.message))}}};
walk('src');walk('packages/promptgen/src');
console.log('checked',files,'files, failures:',bad);"
```

### 2. Import-Auflösung

Prüft, dass alle relativen und `@/`-Importe auf existierende Dateien zeigen
(kein Bundler nötig).

### 3. Echte Verifikation für kritische Pfade

Für Server-Logik mit externen APIs: **echter Test-Call** über ein temporäres Skript
in `src/` (teilt `tsconfig`-Aliase), danach wieder löschen.

Beispiel Cover:

```ts
import { loadRootEnv } from "@promptgen/server/env";
import { generateCover } from "./server/cover";
loadRootEnv();
console.log(await generateCover({ prompt: "professional book cover art, …" }));
```

Beispiel Streak (pure Logik):

```ts
import { computeStreak, todayIso, addDays } from "./lib/streak";
console.log(computeStreak([addDays(todayIso(), -1), todayIso()], todayIso()));
```

---

## Debugging

- **Server-Logs:** das Terminal, in dem `bun run dev` läuft. In Dev werden zusätzlich
  Browser-Console-Meldungen gespiegelt (`development.console`).
- **HMR:** Änderungen an UI/CSS erscheinen sofort; Server-Module werden mit `--hot`
  neu geladen; State bleibt bei reinen UI-Updates erhalten.
- **API direkt testen:** `curl`/PowerShell `Invoke-RestMethod` gegen `localhost:3000/api/...`.

---

## Daten-Inspektion & Reset

Im Browser (DevTools → Application → Local Storage):

| Aktion | Vorgehen |
| --- | --- |
| Profil-Daten ansehen | `authorai.<profilId>.books` usw. |
| Profil zurücksetzen | Profil löschen (UI) oder Keys entfernen |
| Alles zurücksetzen | alle `authorai.*`-Keys löschen, neu laden |
| Cover aufräumen | `covers/` prüfen; verwaiste Dateien manuell entfernen |

---

## Release-Checkliste

- [ ] Syntax- und Import-Checks grün
- [ ] Kritische Pfade real getestet (mind. Cover + ein LLM-Pfad)
- [ ] `docs/changelog.md` ergänzt
- [ ] `README.md` / Doku bei Verhaltensänderungen aktualisiert
- [ ] Keine Secrets in Dateien, `covers/` und `.env` bleiben ignoriert
