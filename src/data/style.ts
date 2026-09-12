/**
 * Stil-Profil: die Zielstimme als wiederverwendbare Vorgabe.
 *
 * Preset + freier Zusatz; der zusammengesetzte Hinweis geht als verbindlicher
 * `VOICE / STYLE PROFILE`-Block in den Stil-Pass. Geräteweit gespeichert
 * (`authorai.styleProfile`), wie Modelle und Sprache.
 */

export interface StylePreset {
  id: string;
  label: string;
  hint: string;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "none",
    label: "Kein Profil",
    hint: "",
  },
  {
    id: "lakonisch",
    label: "Lakonisch",
    hint: "Kurze, klare Sätze. Sparsam mit Adjektiven, keine Weitschweifigkeit, Untertreibung statt Pathos.",
  },
  {
    id: "hart",
    label: "Hart & schnell",
    hint: "Kurze Hauptsätze, kräftige Verben, hohes Tempo. Keine Füllwörter, keine Erklärungen.",
  },
  {
    id: "barock",
    label: "Barock",
    hint: "Lange, verschachtelte Sätze mit reichem Vokabular und sinnlichen Bildern. Feierlicher Ton.",
  },
  {
    id: "lyrisch",
    label: "Lyrisch",
    hint: "Klang und Rhythmus vor Information. Metaphorik und bewusste Wiederholungen als Stilmittel.",
  },
  {
    id: "sachlich",
    label: "Sachlich",
    hint: "Nüchterne, präzise Prosa. Beobachtung und Fakten statt Wertung und Schmuck.",
  },
];

export interface StyleProfile {
  presetId: string;
  /** Freier Zusatz (z. B. „Eltern-Perspektive, kein Präteritum"). */
  custom: string;
}

export const DEFAULT_STYLE_PROFILE: StyleProfile = { presetId: "none", custom: "" };

/** Der wirksame Hinweis (Preset-Beschreibung + freier Zusatz) oder "". */
export function styleProfileHint(profile: StyleProfile | null | undefined): string {
  if (!profile) return "";
  const preset = STYLE_PRESETS.find((entry) => entry.id === profile.presetId);
  const parts = [preset?.hint ?? "", profile.custom.trim()].filter(Boolean);
  return parts.join(" ");
}

/** Ist überhaupt eine Stimme gesetzt? */
export function styleProfileActive(profile: StyleProfile | null | undefined): boolean {
  return styleProfileHint(profile).length > 0;
}

/** Anzeigename für die UI („Lakonisch + Freitext"). */
export function styleProfileLabel(profile: StyleProfile | null | undefined): string {
  if (!profile) return "Kein Profil";
  const preset = STYLE_PRESETS.find((entry) => entry.id === profile.presetId);
  const name = preset?.label ?? "Kein Profil";
  if (profile.custom.trim()) {
    return name === "Kein Profil" ? "Nur Freitext" : `${name} + Freitext`;
  }
  return name;
}

/** Tolerantes Parsen des gespeicherten Werts. */
export function normalizeStyleProfile(value: unknown): StyleProfile {
  if (!value || typeof value !== "object") return DEFAULT_STYLE_PROFILE;
  const record = value as Record<string, unknown>;
  const presetId =
    typeof record.presetId === "string" && STYLE_PRESETS.some((entry) => entry.id === record.presetId)
      ? record.presetId
      : DEFAULT_STYLE_PROFILE.presetId;
  const custom = typeof record.custom === "string" ? record.custom : "";
  return { presetId, custom };
}
