export interface SoulSectionDef {
  key: string;
  label: string;
}

/** The 12 promptgen soul sections (order matters for the generator UI). */
export const SOUL_SECTIONS: SoulSectionDef[] = [
  { key: "head", label: "Prompt Head Override" },
  { key: "core", label: "Core" },
  { key: "bio", label: "Static Bio" },
  { key: "trivia", label: "Trivia" },
  { key: "appearance", label: "Appearance" },
  { key: "personality", label: "Personality" },
  { key: "relationships", label: "Relationships" },
  { key: "occupation", label: "Occupation" },
  { key: "skills", label: "Skills" },
  { key: "speech", label: "Speech Style" },
  { key: "goals", label: "Goals" },
  { key: "emotes", label: "Emote Moods Override" },
];

export interface Character {
  id: string;
  name: string;
  role: string;
  bookId?: string;
  gradient: [string, string];
  tags: string[];
  core: string;
  soul: Record<string, string>;
  createdAt: string;
}

export const CHARACTER_GRADIENTS: [string, string][] = [
  ["hsl(258 90% 62%)", "hsl(342 90% 58%)"],
  ["hsl(186 100% 52%)", "hsl(232 85% 60%)"],
  ["hsl(38 95% 58%)", "hsl(342 90% 58%)"],
  ["hsl(158 84% 42%)", "hsl(186 100% 50%)"],
  ["hsl(232 85% 62%)", "hsl(186 100% 50%)"],
  ["hsl(342 90% 60%)", "hsl(258 90% 64%)"],
];

export const FALLBACK_GRADIENT: [string, string] = ["hsl(258 90% 62%)", "hsl(342 90% 58%)"];

const NOW = Date.now();
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

export const CHARACTERS: Character[] = [
  {
    id: "seraphine-vhalor",
    name: "Seraphine Vhalor",
    role: "Tragische Königin · Antagonistin",
    bookId: "aschenkoenigin",
    gradient: ["hsl(258 90% 62%)", "hsl(342 90% 58%)"],
    tags: ["Königin", "Feuer", "Verrat"],
    core: "Eine verbannte Herrscherin, deren eiserner Wille jede Niederlage überlebt — und deren Krone begonnen hat, für sie zu denken.",
    soul: {
      core: "Seraphine ist die Asche selbst: kalt gewordenes Feuer, das nie aufgehört hat zu brennen. Sie kämpft nicht um einen Thron, sondern um das Recht, die zu sein, die man aus den Chroniken gelöscht hat.",
      bio: "Als jüngste Tochter des Aschenhauses wurde sie mit sechzehn verbannt, nachdem ihre Schwester unter ungeklärten Umständen starb. Zwölf Jahre sammelte sie Verbündete in den Randlanden und kehrte in der Nacht der drei roten Monde zurück.",
      personality: "Nach außen eisig und berechnend, innerlich von einer fast zärtlichen Schuld getragen. Sie verzeiht Verrat nie, sich selbst jedoch am wenigsten.",
      speech: "Sie spricht in kurzen, königlichen Sätzen und mischt archaische Flüche mit einer entwaffnenden Direktheit. Ihr Ton wird leiser, je gefährlicher sie wird.",
      goals: "Den Aschenthron zurückerobern und die Wahrheit über den Tod ihrer Schwester ans Licht zwingen. Zugleich will sie verhindern, dass die Krone sie vollends übernimmt.",
    },
    createdAt: daysAgo(41),
  },
  {
    id: "kiro-tanaka",
    name: "Kiro Tanaka",
    role: "Söldnerin · Protagonistin",
    bookId: "neon-requiem",
    gradient: ["hsl(186 100% 52%)", "hsl(232 85% 60%)"],
    tags: ["Söldnerin", "Kybernetik", "Vergangenheit"],
    core: "Ein Geist in der Maschine, der ihren eigenen gelöschten Speicher jagt — und die Wahrheit, die jemand teuer bezahlt hat.",
    soul: {
      core: "Kiro ist die Summe von Erinnerungen, die ihr jemand weggenommen hat. Was bleibt, ist eine eiskalte Präzision und ein Misstrauen, das sie am Leben hält.",
      bio: "Aufgewachsen in den unteren Ebenen von Neo-Kyoto, wurde sie mit neunzehn für ein Konzern-Experiment angeworben, dessen Akten heute brennen. Seitdem verkauft sie ihre Waffe an den Meistbietenden — und ihren Speicher an niemanden.",
      personality: "Pragmatisch, wortkarg, mit einem trockenen Humor, der nur in Momenten echter Gefahr aufblitzt. Sie bindet sich an Menschen erst, wenn es zu spät ist.",
      speech: "Kurze, abgehackte Sätze, durchsetzt mit Konzern-Jargon und Slang der Unterstadt. Sie stellt lieber Fragen als Antworten zu geben.",
      goals: "Die eigenen gelöschten Erinnerungen zurückholen und den Konzern finden, der sie ausgelöscht hat.",
    },
    createdAt: daysAgo(18),
  },
  {
    id: "pfarrer-milos",
    name: "Pfarrer Milos",
    role: "Antagonist · Priester",
    bookId: "sankt-kalt",
    gradient: ["hsl(38 95% 58%)", "hsl(342 90% 58%)"],
    tags: ["Priester", "Amnesie", "Geheimnis"],
    core: "Ein Seelsorger ohne Gedächtnis, dessen Beichte die Wahrheit kennt, die er selbst vergessen hat.",
    soul: {
      core: "Milos ist ein Mann, der anderen vergibt, weil er sich selbst nicht erinnern kann. Seine Sanftheit ist echt — und genau deshalb so gefährlich.",
      bio: "Vor drei Jahren fand man ihn unter dem Eis von Sankt Kalt, ohne Papiere und ohne Erinnerung. Die Gemeinde nahm ihn auf, und er nahm ihre Sünden.",
      personality: "Ruhig, aufmerksam, unheimlich gelassen. Er stellt die richtigen Fragen zur falschen Zeit.",
      speech: "Weiche, bedächtige Formulierungen, oft in biblischen Bildern. Er beendet Sätze manchmal mitten im Gedanken, als höre er etwas, das niemand sonst hört.",
      goals: "Herausfinden, wer er vor dem Eis war — auch wenn die Antwort die Gemeinde zerstören könnte.",
    },
    createdAt: daysAgo(9),
  },
  {
    id: "alina-kraeh",
    name: "Alina Kräh",
    role: "Ermittlerin · Protagonistin",
    bookId: "kraehenmaedchen",
    gradient: ["hsl(258 80% 58%)", "hsl(232 80% 52%)"],
    tags: ["Ermittlerin", "Kleinstadt", "Schuld"],
    core: "Eine Ermittlerin, die jedes Motiv im Dorf versteht — auch ihr eigenes.",
    soul: {
      core: "Alina liest Menschen wie Akten. Was sie nicht lesen kann, ist die eigene Schuld, die sie seit fünfzehn Jahren mit sich trägt.",
      bio: "Sie verließ Krähenfeld als Jugendliche, nachdem ihre beste Freundin verschwand. Als Kriminalkommissarin kehrt sie zurück — und der erste Fall führt direkt in ihre eigene Vergangenheit.",
      personality: "Scharf beobachtend, ungeduldig mit Halbwahrheiten, heimlich sentimental. Sie trinkt zu viel Kaffee und schläft zu wenig.",
      speech: "Klare, präzise Fragen mit einem Unterton, der Menschen zum Reden bringt. Privat wird sie leiser und verletzlicher.",
      goals: "Den Fall lösen und endlich herausfinden, was damals wirklich mit ihrer Freundin geschah.",
    },
    createdAt: daysAgo(3),
  },
];

export function emptySoul(): Record<string, string> {
  const soul: Record<string, string> = {};
  for (const section of SOUL_SECTIONS) soul[section.key] = "";
  return soul;
}

export function characterInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

export function filledSectionCount(soul: Record<string, string>): number {
  return SOUL_SECTIONS.filter((section) => (soul[section.key] ?? "").trim().length > 0).length;
}

export function isSectionValid(text: string): boolean {
  const sentences = text.split(/[.!?]+/).filter((part) => part.trim().length > 5);
  return sentences.length >= 3;
}

export function firstSentence(text: string, maxLength = 70): string {
  const match = text.trim().match(/^[^.!?\n]+/);
  const value = (match ? match[0] : text).trim();
  if (value.length === 0) return "";
  return value.length > maxLength ? `${value.slice(0, maxLength).trimEnd()}…` : value;
}

export function soulToPrompt(soul: Record<string, string>): string {
  return SOUL_SECTIONS.map((section) => `** ${section.label} **\n${soul[section.key] ?? ""}`).join(
    "\n\n",
  );
}
