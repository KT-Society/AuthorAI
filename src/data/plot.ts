export type PlotStatus = "idea" | "planned" | "written";

export const PLOT_STATUSES: PlotStatus[] = ["idea", "planned", "written"];

export const PLOT_STATUS_LABELS: Record<PlotStatus, string> = {
  idea: "Idee",
  planned: "Geplant",
  written: "Geschrieben",
};

export interface PlotCard {
  id: string;
  bookId: string;
  title: string;
  description: string;
  act: string;
  status: PlotStatus;
  order: number;
}

export const PLOT_ACTS = ["Akt I", "Akt II", "Akt III"];

export const PLOT_CARDS: PlotCard[] = [
  {
    id: "p1",
    bookId: "aschenkoenigin",
    title: "Rückkehr in der Nacht der drei Monde",
    description: "Seraphine überschreitet den Aschenwall und wird von den Wachen nicht erkannt.",
    act: "Akt I",
    status: "written",
    order: 0,
  },
  {
    id: "p2",
    bookId: "aschenkoenigin",
    title: "Die Krone spricht zum ersten Mal",
    description: "Der Thron verlangt ein Opfer, das Seraphine nicht bringen will.",
    act: "Akt II",
    status: "planned",
    order: 1,
  },
  {
    id: "p3",
    bookId: "aschenkoenigin",
    title: "Wahrheit über den Tod der Schwester",
    description: "Midpoint-Twist: Nicht die Rivalin, sondern Seraphine selbst trägt die Schuld.",
    act: "Akt II",
    status: "idea",
    order: 2,
  },
  {
    id: "p4",
    bookId: "neon-requiem",
    title: "Der Speicher, der nicht ihr gehört",
    description: "Kiro findet eine Erinnerung mit fremden Händen und ihrer eigenen Stimme.",
    act: "Akt I",
    status: "written",
    order: 0,
  },
  {
    id: "p5",
    bookId: "neon-requiem",
    title: "Kōhaku schaltet das Netz ab",
    description: "Die unteren Ebenen fallen in Dunkelheit — und die Jagd beginnt.",
    act: "Akt III",
    status: "planned",
    order: 1,
  },
  {
    id: "p6",
    bookId: "sankt-kalt",
    title: "Die erste gemeißelte Beichte",
    description: "Milos hört seine eigene Stimme aus dem Eis — von vor drei Jahren.",
    act: "Akt I",
    status: "idea",
    order: 0,
  },
];
