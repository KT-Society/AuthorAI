/** Wiederverwendbare Szenen-Muster (Beats), die im Szenen-Editor eingefügt werden. */

export interface SceneTemplate {
  id: string;
  label: string;
  scenes: string[];
}

export const SCENE_TEMPLATES: SceneTemplate[] = [
  {
    id: "chase",
    label: "Verfolgungsjagd",
    scenes: [
      "Der Verfolger taucht unerwartet auf",
      "Die Jagd durch vertrautes Terrain",
      "Beinahe entkommen — ein Fehler kippt die Lage",
      "Der Umschwung: Verfolger wird Verfolgter",
    ],
  },
  {
    id: "confrontation",
    label: "Konfrontation",
    scenes: [
      "Beide Seiten treffen mit unterschiedlichen Zielen ein",
      "Erste Worte — Vorwürfe und Rechtfertigungen",
      "Eskalation: eine Grenze wird überschritten",
      "Bruch oder brüchige Einigung",
    ],
  },
  {
    id: "revelation",
    label: "Enthüllung",
    scenes: [
      "Ein Detail fällt auf, das nicht zusammenpasst",
      "Nachhaken — die Spur führt weiter",
      "Die Wahrheit bricht sich Bahn",
      "Konsequenz und neuer Auftrag",
    ],
  },
  {
    id: "quiet",
    label: "Ruhige Szene (Charaktertiefe)",
    scenes: [
      "Alltag und Atmosphäre als Kontrast",
      "Ein Gespräch, das an der Oberfläche bleibt",
      "Ein kleiner Verlust oder Gewinn",
      "Stiller Ausklang mit offenem Unterton",
    ],
  },
  {
    id: "battle",
    label: "Kampf / Belagerung",
    scenes: [
      "Vorbereitung und letzte Vorzeichen",
      "Der erste Schlag",
      "Der Wendepunkt im Gefecht",
      "Nachwehen und Bilanz",
    ],
  },
];
