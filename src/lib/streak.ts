/**
 * Writing-streak helpers.
 *
 * Streaks are derived from the days on which words were actually written
 * (tracked per profile), so the dashboard reflects real activity instead of a
 * hardcoded number.
 */

import { DEFAULT_META, META_VERSION, WEEKLY_WORDS } from "@/data/author";
import type { DashboardMeta } from "@/data/author";

export function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayIso(): string {
  return isoDate(new Date());
}

export function addDays(iso: string, delta: number): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + delta);
  return isoDate(date);
}

/** Monday (ISO date) of the week that `iso` belongs to. */
export function mondayIso(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  const offset = (date.getDay() + 6) % 7; // Monday = 0
  return addDays(iso, -offset);
}

export function dayIndexFromMonday(iso: string): number {
  const date = new Date(`${iso}T00:00:00`);
  return (date.getDay() + 6) % 7;
}

export function computeStreak(days: string[], today: string): { current: number; best: number } {
  const set = new Set(days);
  const sorted = [...set].sort();

  let best = 0;
  let run = 0;
  let previous = "";
  for (const day of sorted) {
    run = previous && addDays(previous, 1) === day ? run + 1 : 1;
    if (run > best) best = run;
    previous = day;
  }

  // Current streak: consecutive days ending today (or yesterday, if today is unwritten yet).
  let cursor = set.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  return { current, best };
}

/** Brings stored metrics in line with "now" (new day / new week). */
export function normalizeMeta(raw: DashboardMeta | null): DashboardMeta {
  const today = todayIso();
  const monday = mondayIso(today);
  const base = raw ?? { ...DEFAULT_META };

  const week =
    base.weekStart === monday && Array.isArray(base.weeklyWords) && base.weeklyWords.length === 7
      ? [...base.weeklyWords]
      : WEEKLY_WORDS.map(() => 0);

  const hasDate = typeof base.todayDate === "string" && base.todayDate.length > 0;
  const todayWords = !hasDate ? base.todayWords : base.todayDate === today ? base.todayWords : 0;

  const days = Array.isArray(base.writingDays) ? [...base.writingDays] : [];
  if (todayWords > 0 && !days.includes(today)) days.push(today);

  // Credit today's words into the week chart (e.g. after migrating stored metrics).
  if (todayWords > 0) {
    const index = dayIndexFromMonday(today);
    if ((week[index] ?? 0) < todayWords) week[index] = todayWords;
  }

  const { current, best } = computeStreak(days, today);

  return {
    ...base,
    version: META_VERSION,
    weekStart: monday,
    weeklyWords: week,
    todayDate: today,
    todayWords,
    writingDays: days,
    streakCurrent: current,
    streakBest: Math.max(best, base.streakBest ?? 0),
  };
}

/** Applies newly written (or corrected) words to today's metrics and streak. */
export function recordWords(meta: DashboardMeta, amount: number): DashboardMeta {
  const today = todayIso();
  const monday = mondayIso(today);

  const week =
    meta.weekStart === monday && meta.weeklyWords.length === 7
      ? [...meta.weeklyWords]
      : WEEKLY_WORDS.map(() => 0);
  const index = dayIndexFromMonday(today);
  week[index] = Math.max(0, (week[index] ?? 0) + amount);

  const days = new Set(meta.writingDays);
  if (amount > 0) days.add(today);

  const todayWords = Math.max(0, (meta.todayDate === today ? meta.todayWords : 0) + amount);
  const { current, best } = computeStreak([...days], today);

  return {
    ...meta,
    version: META_VERSION,
    weekStart: monday,
    weeklyWords: week,
    todayDate: today,
    todayWords,
    writingDays: [...days],
    streakCurrent: current,
    streakBest: Math.max(best, meta.streakBest ?? 0),
  };
}

/** A cleared meta anchored to today. */
export function emptyMetaToday(): DashboardMeta {
  const today = todayIso();
  return {
    ...DEFAULT_META,
    version: META_VERSION,
    weekStart: mondayIso(today),
    todayDate: today,
  };
}
