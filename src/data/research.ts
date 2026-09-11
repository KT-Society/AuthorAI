export interface ResearchNote {
  id: string;
  bookId?: string;
  title: string;
  content: string;
  source?: string;
  tags: string[];
  createdAt: string;
}

const NOW = Date.now();
const hoursAgo = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();

export const RESEARCH_NOTES: ResearchNote[] = [
  {
    id: "r1",
    bookId: "aschenkoenigin",
    title: "Mittelalterliche Belagerungstechnik",
    content:
      "Trebuchets erreichten Wurfweiten von ~300 m. Entscheidend war nicht die Wucht, sondern der psychologische Effekt auf die Stadtbevölkerung — Angst vor dem nächsten Einschlag.",
    source: "Tavily",
    tags: ["Krieg", "Technik"],
    createdAt: hoursAgo(30),
  },
  {
    id: "r2",
    bookId: "neon-requiem",
    title: "Kybernetische Speicherimplantate",
    content:
      "Heutige Cochlea-Implantate zeigen: neuronale Schnittstellen brauchen Kalibrierung und können 'Phantomsignale' erzeugen. Gut als Grundlage für gelöschte Erinnerungen.",
    source: "Recherche",
    tags: ["Technik", "Sci-Fi"],
    createdAt: hoursAgo(72),
  },
  {
    id: "r3",
    bookId: "sankt-kalt",
    title: "Beichte und Schweigepflicht",
    content:
      "Das Beichtgeheimnis ist in vielen Rechtssystemen absolut geschützt. Ein Priester, der sich nicht erinnern kann, ist juristisch wie moralisch eine Grenzfigur.",
    source: "Tavily",
    tags: ["Recht", "Psychologie"],
    createdAt: hoursAgo(120),
  },
];
