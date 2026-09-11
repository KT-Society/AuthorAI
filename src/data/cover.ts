/** Cover-Text-Layer: Datenmodell, Presets und Layouts (persistierbar). */

export type CoverTextRole = "title" | "author" | "free";
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
    if (layout === "center") return { ...layer, x: 50, y: layer.role === "title" ? 44 : 58 };
    if (layout === "bottom") return { ...layer, x: 50, y: layer.role === "title" ? 78 : 90 };
    return { ...layer, x: 50, y: layer.role === "title" ? 20 : 88 };
  });
}
