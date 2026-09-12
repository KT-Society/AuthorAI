import {
  arcAt,
  arcDelta,
  canonBlock,
  formatArc,
  hasArc,
  sortArc,
} from "./data/continuity";
import type { CharacterRelation } from "./data/continuity";
import { sparklinePath, sparklineZeroY } from "./lib/graph";

let failures = 0;
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n   expected ${JSON.stringify(expected)}\n   actual   ${JSON.stringify(actual)}`}`,
  );
};

const base: CharacterRelation = {
  id: "r1",
  fromId: "c1",
  toId: "c2",
  kind: "distrust",
  intensity: -0.4,
};

/* ── Arc-Grundlagen ─────────────────────────────────────────────────────── */
check("ohne Arc inaktiv", hasArc(base), false);
check("ein Punkt inaktiv", hasArc({ ...base, arc: [{ chapter: 1, intensity: -1 }] }), false);
const withArc: CharacterRelation = {
  ...base,
  arc: [
    { chapter: 12, intensity: 0.2 },
    { chapter: 1, intensity: -0.6 },
    { chapter: 6, intensity: -0.2 },
  ],
};
check("ab zwei Punkten aktiv", hasArc(withArc), true);
check(
  "sortiert chronologisch",
  sortArc(withArc.arc ?? []).map((point) => point.chapter),
  [1, 6, 12],
);
check("Original bleibt unangetastet", withArc.arc?.[0]?.chapter, 12);

/* ── arcAt: Intensität je Kapitel ──────────────────────────────────────── */
check("vor dem ersten Punkt", arcAt(withArc, 0), -0.6);
check("genau am Punkt", arcAt(withArc, 6), -0.2);
check("zwischen Punkten", arcAt(withArc, 8), -0.2);
check("am letzten Punkt", arcAt(withArc, 12), 0.2);
check("nach dem letzten Punkt", arcAt(withArc, 40), 0.2);
check("ohne Arc → globaler Wert", arcAt({ ...base, arc: [] }, 5), -0.4);
check(
  "mit einem Punkt → globaler Wert",
  arcAt({ ...base, arc: [{ chapter: 3, intensity: 1 }] }, 5),
  -0.4,
);

/* ── Darstellung ───────────────────────────────────────────────────────── */
check("formatArc", formatArc(withArc.arc ?? []), "−0,6 (Kap. 1) → −0,2 (Kap. 6) → 0,2 (Kap. 12)");
check("arcDelta = Ende − Anfang", arcDelta(withArc.arc ?? []), 0.8);
check("arcDelta bei einem Punkt", arcDelta([{ chapter: 1, intensity: 0.5 }]), 0);
check("Verschlechterung", arcDelta([{ chapter: 1, intensity: 0.6 }, { chapter: 9, intensity: -0.2 }]), -0.8);

/* ── canonBlock ────────────────────────────────────────────────────────── */
const names: Record<string, string> = { c1: "Seraphine", c2: "Kael" };
const block = canonBlock({
  facts: [],
  relations: [
    withArc,
    { id: "r2", fromId: "c1", toId: "c2", kind: "loyalty", intensity: -0.6 },
  ],
  nameOf: (id) => names[id] ?? "",
});
check(
  "Arc im Kanon sichtbar",
  block.includes("- Seraphine → Kael: distrust arc: −0,6 (Kap. 1) → −0,2 (Kap. 6) → 0,2 (Kap. 12)"),
  true,
);
check(
  "Beziehung ohne Arc bleibt wie bisher",
  block.includes("- Seraphine → Kael: loyalty (−0,6)"),
  true,
);

/* ── Sparkline ─────────────────────────────────────────────────────────── */
check("leere Werte → leerer Pfad", sparklinePath([]), "");
check("ein Wert → nur M", sparklinePath([0]).startsWith("M "), true);
const path = sparklinePath([-1, 0, 1], 72, 18);
check("drei Punkte → M + 2 L", (path.match(/L /g) ?? []).length, 2);
const ys = [...path.matchAll(/[ML] [\d.]+ ([\d.]+)/g)].map((match) => Number(match[1]));
check("+1 liegt über −1", (ys[2] ?? 0) < (ys[0] ?? 0), true);
check("bleibt in der Höhe", ys.every((y) => y >= 0 && y <= 18), true);
check("Nullinie in der Mitte", sparklineZeroY(18, 1), 9);
check("Werte werden geklemmt", sparklinePath([5]).includes("1.0"), true);

console.log(failures === 0 ? "\nALL GREEN" : `\n${failures} FAILED`);
if (failures > 0) process.exit(1);
