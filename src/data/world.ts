export type WorldCategory = "Ort" | "Fraktion" | "Magie" | "Artefakt" | "Lore";

export const WORLD_CATEGORIES: WorldCategory[] = ["Ort", "Fraktion", "Magie", "Artefakt", "Lore"];

import type { StoryWorld } from "./story";

export const STORY_WORLD_CATEGORIES: { key: keyof StoryWorld; category: WorldCategory }[] = [
  { key: "locations", category: "Ort" },
  { key: "factions", category: "Fraktion" },
  { key: "magic", category: "Magie" },
  { key: "artifacts", category: "Artefakt" },
  { key: "lore", category: "Lore" },
];

/** Turns a storyboard world section into world entries for a book. */
export function entriesFromStoryWorld(world: StoryWorld, bookId: string): WorldEntry[] {
  const entries: WorldEntry[] = [];
  const now = new Date().toISOString();

  for (const { key, category } of STORY_WORLD_CATEGORIES) {
    for (const item of world[key] ?? []) {
      const title = item.name.trim();
      if (!title) continue;
      entries.push({
        id: `world-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        category,
        bookId,
        description: item.description.trim(),
        tags: ["Storyboard"],
        createdAt: now,
      });
    }
  }

  return entries;
}

export interface WorldEntry {
  id: string;
  title: string;
  category: WorldCategory;
  bookId?: string;
  description: string;
  tags: string[];
  createdAt: string;
}

const NOW = Date.now();
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

export const WORLD_ENTRIES: WorldEntry[] = [
  {
    id: "w-aschenthron",
    title: "Der Aschenthron",
    category: "Artefakt",
    bookId: "aschenkoenigin",
    description:
      "Ein Thron aus erkaltetem Vulkangestein, der den Willen seines Trägers langsam überschreibt. Wer zu lange sitzt, hört auf, zwischen Krone und Stimme zu unterscheiden.",
    tags: ["Krone", "Fluch", "Macht"],
    createdAt: daysAgo(40),
  },
  {
    id: "w-randlande",
    title: "Die Randlande",
    category: "Ort",
    bookId: "aschenkoenigin",
    description:
      "Karge Grenzregion jenseits des Aschenwalls. Heimstatt von Verbannten, Schmugglern und der letzten freien Siedlung, Vhal'Sarn.",
    tags: ["Grenze", "Exil"],
    createdAt: daysAgo(38),
  },
  {
    id: "w-neo-kyoto",
    title: "Neo-Kyoto, Untere Ebenen",
    category: "Ort",
    bookId: "neon-requiem",
    description:
      "Ein Labyrinth aus Neon, Regen und Konzernfassaden. In den unteren Ebenen verkauft man Erinnerungen billiger als Essen.",
    tags: ["Cyberpunk", "Metropole"],
    createdAt: daysAgo(16),
  },
  {
    id: "w-konzerne",
    title: "Das Kōhaku-Konsortium",
    category: "Fraktion",
    bookId: "neon-requiem",
    description:
      "Ein Zusammenschluss aus drei Konzernen, die Speichertechnologie kontrollieren. Offiziell ein Kartell, inoffiziell ein Staat.",
    tags: ["Konzern", "Macht"],
    createdAt: daysAgo(15),
  },
  {
    id: "w-eiskirche",
    title: "Die Eiskirche von Sankt Kalt",
    category: "Lore",
    bookId: "sankt-kalt",
    description:
      "Ein unter dem Gletscher gebautes Gotteshaus, in dem Beichten seit hundert Jahren in Eis gemeißelt statt gesprochen werden.",
    tags: ["Glaube", "Geheimnis"],
    createdAt: daysAgo(8),
  },
];
