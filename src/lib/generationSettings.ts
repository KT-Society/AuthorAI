/**
 * Shared generation settings (per-stage models + output language), persisted locally.
 *
 * The model is a free-form OpenRouter model ID typed by the user — there is
 * deliberately no dropdown, no hardcoded list and no default model.
 *
 * Stages let you assign a different OpenRouter model to each pipeline step
 * (storyboard, rough draft, expansion).
 */

import { DEFAULT_STYLE_PROFILE, normalizeStyleProfile, styleProfileHint } from "@/data/style";
import type { StyleProfile } from "@/data/style";

export const MODEL_STORAGE_KEY = "authorai.model";
export const LANGUAGE_STORAGE_KEY = "authorai.language";
export const STYLE_PROFILE_STORAGE_KEY = "authorai.styleProfile";

export const FALLBACK_LANGUAGES = ["German", "English", "Japanese", "French"];
export const DEFAULT_LANGUAGE = "German";

export type ModelStage = "storyboard" | "draft" | "expand" | "consistency" | "style";

export const MODEL_STAGES: ModelStage[] = [
  "storyboard",
  "draft",
  "expand",
  "consistency",
  "style",
];

export const MODEL_STAGE_LABELS: Record<ModelStage, string> = {
  storyboard: "Storyboard",
  draft: "Rohentwurf",
  expand: "Ausbau",
  consistency: "Kohärenz",
  style: "Stil",
};

const STAGE_KEYS: Record<ModelStage, string> = {
  storyboard: "authorai.model.storyboard",
  draft: "authorai.model.draft",
  expand: "authorai.model.expand",
  consistency: "authorai.model.consistency",
  style: "authorai.model.style",
};

/** Standard/fallback model — used by character generation and inherited by stages. */
export function readModel(): string {
  return localStorage.getItem(MODEL_STORAGE_KEY) ?? "";
}

export function writeModel(value: string): void {
  localStorage.setItem(MODEL_STORAGE_KEY, value);
}

/** The stage-specific value only (empty if not explicitly set). */
export function readStageModelRaw(stage: ModelStage): string {
  return localStorage.getItem(STAGE_KEYS[stage]) ?? "";
}

/** The stage model, falling back to the standard model when unset. */
export function readStageModel(stage: ModelStage): string {
  const raw = readStageModelRaw(stage);
  return raw.trim().length > 0 ? raw : readModel();
}

/** Writing an empty value clears the override so the stage inherits the standard model. */
export function writeStageModel(stage: ModelStage, value: string): void {
  if (value.trim().length === 0) {
    localStorage.removeItem(STAGE_KEYS[stage]);
  } else {
    localStorage.setItem(STAGE_KEYS[stage], value);
  }
}

/**
 * Vollständiger Record über **alle** Stufen (leer).
 *
 * Pflicht: `Record<ModelStage, string>` mit nur drei Schlüsseln ist typkompatibel, aber
 * `models.consistency` ist dann `undefined` — genau so blieben Stufen-Modelle unsichtbar und
 * `models[stage].trim()` stürzte ab. Immer diesen Helfer benutzen.
 */
export function emptyStageModels(): Record<ModelStage, string> {
  return Object.fromEntries(MODEL_STAGES.map((stage) => [stage, ""])) as Record<ModelStage, string>;
}

/** **Alle** Stufen roh aus dem Speicher (leer = erbt das Standard-Model). */
export function readStageModelsRaw(): Record<ModelStage, string> {
  return Object.fromEntries(
    MODEL_STAGES.map((stage) => [stage, readStageModelRaw(stage)]),
  ) as Record<ModelStage, string>;
}

/** **Alle** Stufen aufgelöst (eigene ID oder geerbtes Standard-Model). */
export function readStageModels(): Record<ModelStage, string> {
  return Object.fromEntries(
    MODEL_STAGES.map((stage) => [stage, readStageModel(stage)]),
  ) as Record<ModelStage, string>;
}

export function readLanguage(): string | null {
  return localStorage.getItem(LANGUAGE_STORAGE_KEY);
}

export function writeLanguage(value: string): void {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, value);
}

/** Zielstimme (Preset + Freitext) — geräteweit wie Modelle und Sprache. */
export function readStyleProfile(): StyleProfile {
  const raw = localStorage.getItem(STYLE_PROFILE_STORAGE_KEY);
  if (!raw) return DEFAULT_STYLE_PROFILE;
  try {
    return normalizeStyleProfile(JSON.parse(raw));
  } catch {
    return DEFAULT_STYLE_PROFILE;
  }
}

export function writeStyleProfile(value: StyleProfile): void {
  localStorage.setItem(STYLE_PROFILE_STORAGE_KEY, JSON.stringify(normalizeStyleProfile(value)));
}

/** Der wirksame Stimm-Hinweis (Preset + Freitext) oder "" — für Aufrufer, die nur den String brauchen. */
export function readStyleProfileHint(): string {
  return styleProfileHint(readStyleProfile());
}
