/** Cover-Text-Layer: Datenmodell, Presets und Layouts (persistierbar). */

export type CoverTextRole = "title" | "author" | "free" | "isbn";
export type CoverAlign = "left" | "center" | "right";

export interface CoverTextLayer {
  id: string;
  role: CoverTextRole;
  text: string;
  /** Position in Prozent (Ankerpunkt). */
  x: number;
  y: number;
  /** Schriftgröße als Anteil der Bildbreite. */
  size: number;
  fontFamily: string;
  fontWeight: number;
  color: string;
  align: CoverAlign;
  letterSpacing: number;
  uppercase: boolean;
  italic: boolean;
  shadow: boolean;
}

export const COVER_FONTS = ["Outfit", "Inter", "Georgia", "Courier New"];
export const COVER_WEIGHTS = [300, 400, 500, 600, 700, 800];

let counter = 0;

function nextId(): string {
  counter += 1;
  return `layer-${Date.now().toString(36)}-${counter}`;
}

export function makeCoverLayer(role: CoverTextRole, text: string): CoverTextLayer {
  const base: CoverTextLayer = {
    id: nextId(),
    role,
    text,
    x: 50,
    y: 50,
    size: 0.07,
    fontFamily: "Outfit",
    fontWeight: 700,
    color: "#ffffff",
    align: "center",
    letterSpacing: 0.02,
    uppercase: false,
    italic: false,
    shadow: true,
  };

  if (role === "title") return { ...base, y: 20, size: 0.085, fontWeight: 800 };
  if (role === "author") {
    return { ...base, y: 88, size: 0.045, fontWeight: 600, uppercase: true, letterSpacing: 0.14 };
  }
  if (role === "isbn") {
    return { ...base, x: 82, y: 94, size: 0.05, fontWeight: 400, letterSpacing: 0.04, shadow: false };
  }
  return base;
}

/** Startbelegung: Titel (+ Autor, falls angegeben). */
export function defaultCoverLayers(title: string, author?: string): CoverTextLayer[] {
  const layers: CoverTextLayer[] = [];
  if (title.trim()) layers.push(makeCoverLayer("title", title.trim()));
  if (author?.trim()) layers.push(makeCoverLayer("author", author.trim()));
  if (layers.length === 0) layers.push(makeCoverLayer("title", "Titel"));
  return layers;
}

export interface CoverPreset {
  id: string;
  label: string;
  title: Partial<CoverTextLayer>;
  author: Partial<CoverTextLayer>;
}

/** Schriftpaare: Display-Schrift für den Titel, Textschrift für den Autor. */
export const COVER_PRESETS: CoverPreset[] = [
  {
    id: "classic",
    label: "Klassisch (Serif)",
    title: { fontFamily: "Georgia", fontWeight: 700, letterSpacing: 0.02, uppercase: false, italic: false, shadow: false },
    author: { fontFamily: "Georgia", fontWeight: 400, letterSpacing: 0.16, uppercase: true, italic: false, shadow: false, size: 0.04 },
  },
  {
    id: "modern",
    label: "Modern (Sans)",
    title: { fontFamily: "Outfit", fontWeight: 800, letterSpacing: 0, uppercase: false, italic: false, shadow: true },
    author: { fontFamily: "Inter", fontWeight: 500, letterSpacing: 0.18, uppercase: true, italic: false, shadow: true, size: 0.04 },
  },
  {
    id: "thriller",
    label: "Thriller (fett, gesperrt)",
    title: { fontFamily: "Inter", fontWeight: 800, letterSpacing: 0.1, uppercase: true, italic: false, shadow: true },
    author: { fontFamily: "Inter", fontWeight: 600, letterSpacing: 0.2, uppercase: true, italic: false, shadow: true, size: 0.038 },
  },
  {
    id: "novel",
    label: "Roman (fein, kursiv)",
    title: { fontFamily: "Georgia", fontWeight: 400, letterSpacing: 0.06, uppercase: false, italic: true, shadow: false },
    author: { fontFamily: "Outfit", fontWeight: 300, letterSpacing: 0.24, uppercase: true, italic: false, shadow: false, size: 0.04 },
  },
];

export function applyCoverPreset(layers: CoverTextLayer[], preset: CoverPreset): CoverTextLayer[] {
  return layers.map((layer) => {
    if (layer.role === "title") return { ...layer, ...preset.title };
    if (layer.role === "author") return { ...layer, ...preset.author };
    return layer;
  });
}

export type CoverLayoutId = "top-bottom" | "center" | "bottom";

export const COVER_LAYOUTS: { id: CoverLayoutId; label: string }[] = [
  { id: "top-bottom", label: "Titel oben · Autor unten" },
  { id: "center", label: "Zentriert" },
  { id: "bottom", label: "Alles unten" },
];

export function applyCoverLayout(layers: CoverTextLayer[], layout: CoverLayoutId): CoverTextLayer[] {
  return layers.map((layer) => {
    if (layer.role === "isbn") return { ...layer, x: 82, y: 94 };
    if (layout === "center") return { ...layer, x: 50, y: layer.role === "title" ? 44 : 58 };
    if (layout === "bottom") return { ...layer, x: 50, y: layer.role === "title" ? 78 : 90 };
    return { ...layer, x: 50, y: layer.role === "title" ? 20 : 88 };
  });
}

/* ── ISBN / EAN-13 ──────────────────────────────────────────────────────── */

const EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const EAN_G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const EAN_R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const EAN_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function ean13CheckDigit(twelve: string): number {
  let sum = 0;
  for (let index = 0; index < 12; index += 1) {
    const digit = Number(twelve[index] ?? 0);
    sum += index % 2 === 0 ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function normalizeIsbn(value: string): string {
  return value.replace(/\D/g, "");
}

/** 95 Module (true = Stab) für eine EAN-13 — oder null bei ungültiger Eingabe. */
export function ean13Modules(value: string): boolean[] | null {
  let digits = normalizeIsbn(value);
  if (digits.length === 12) digits += String(ean13CheckDigit(digits));
  if (digits.length !== 13) return null;
  if (Number(digits[12]) !== ean13CheckDigit(digits.slice(0, 12))) return null;

  const parity = EAN_PARITY[Number(digits[0])] ?? "LLLLLL";
  let bits = "101";
  for (let index = 1; index <= 6; index += 1) {
    const digit = Number(digits[index] ?? 0);
    bits += parity[index - 1] === "L" ? EAN_L[digit] : EAN_G[digit];
  }
  bits += "01010";
  for (let index = 7; index <= 12; index += 1) {
    bits += EAN_R[Number(digits[index] ?? 0)];
  }
  bits += "101";

  return [...bits].map((bit) => bit === "1");
}

/* ── Eigene Presets ─────────────────────────────────────────────────────── */

export interface SavedCoverPreset extends CoverPreset {
  /** true = vom Nutzer angelegt. */
  custom?: boolean;
}

/** Zieht Titel-/Autor-Stile aus den aktuellen Layern (für „Als Preset speichern"). */
export function presetFromLayers(
  layers: CoverTextLayer[],
  id: string,
  label: string,
): SavedCoverPreset {
  const pick = (role: CoverTextRole): Partial<CoverTextLayer> => {
    const layer = layers.find((item) => item.role === role);
    if (!layer) return {};
    return {
      fontFamily: layer.fontFamily,
      fontWeight: layer.fontWeight,
      letterSpacing: layer.letterSpacing,
      uppercase: layer.uppercase,
      italic: layer.italic,
      shadow: layer.shadow,
      color: layer.color,
      size: layer.size,
    };
  };
  return { id, label, title: pick("title"), author: pick("author"), custom: true };
}
