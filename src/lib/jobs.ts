/**
 * Job-Center: Hintergrund-Queues sichtbar und überlebensfähig machen.
 *
 * Die Queue-Läufe (Kohärenz/Stil über alle Kapitel, Ausbau, Fakten-Check) committen ihre
 * Ergebnisse schon pro Kapitel in das Buch. Was bisher fehlte: ein **Fortschritt, der das
 * Schließen des Dialogs überlebt**. Der Store lebt deshalb außerhalb von React (Modul-Singleton)
 * und wird per `useSyncExternalStore` gelesen.
 */

import { useSyncExternalStore } from "react";

import { countWords } from "@/data/story";

export type JobStatus = "running" | "done" | "error" | "cancelled";

export interface Job {
  id: string;
  title: string;
  /** Grobe Gattung: "pass" | "expand" | "draft" | "canon-check". */
  kind: string;
  done: number;
  total: number;
  /** Aktueller Schritt, z. B. „Kapitel 3". */
  label?: string;
  /**
   * Live-Info zum **laufenden** Schritt aus dem Stream, z. B. „Teil 2/5 · 1.240 Wörter".
   * Anders als `message` (Abschluss-Meldung) wird sie nur während `running` angezeigt.
   */
  detail?: string;
  status: JobStatus;
  message?: string;
  startedAt: number;
  finishedAt?: number;
  /** Monoton steigend — deterministische Reihenfolge bei gleichem Zeitstempel. */
  seq: number;
}

const jobs = new Map<string, Job>();
const cancelled = new Set<string>();
const listeners = new Set<() => void>();
let snapshot: Job[] = [];
let counter = 0;

/** Neueste zuerst — bei gleichem Millisekunden-Zeitstempel entscheidet die Sequenz. */
function sortJobs(): Job[] {
  return [...jobs.values()].sort((a, b) => b.startedAt - a.startedAt || b.seq - a.seq);
}

function emit(): void {
  snapshot = sortJobs();
  for (const listener of listeners) listener();
}

export function listJobs(): Job[] {
  return snapshot;
}

export function subscribeJobs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function createJob(input: {
  title: string;
  kind: string;
  total: number;
  label?: string;
}): string {
  counter += 1;
  const id = `job-${Date.now().toString(36)}-${counter}`;
  jobs.set(id, {
    id,
    title: input.title,
    kind: input.kind,
    done: 0,
    total: Math.max(0, input.total),
    label: input.label,
    status: "running",
    startedAt: Date.now(),
    seq: counter,
  });
  emit();
  return id;
}

export function updateJob(
  id: string,
  patch: { done?: number; total?: number; label?: string; detail?: string; message?: string },
): void {
  const job = jobs.get(id);
  if (!job) return;
  jobs.set(id, {
    ...job,
    done: patch.done ?? job.done,
    total: patch.total ?? job.total,
    label: patch.label ?? job.label,
    detail: patch.detail ?? job.detail,
    message: patch.message ?? job.message,
  });
  emit();
}

/**
 * Live-Meldungen aus einem Stream in einen Job schreiben — **gedrosselt**.
 *
 * Der Job-Store benachrichtigt bei jedem Schreibvorgang alle Abonnenten; ein Aufruf pro
 * Textstück (Token) würde das Job-Center dauerhaft neu rendern. Der Reporter zählt Wörter
 * über den gesamten Text (nicht je Stück — sonst zählen Wortfragmente doppelt) und schreibt
 * **mindestens** `intervalMs` auseinander (das erste Stück meldet sofort, damit ohne
 * Verzögerung etwas sichtbar wird; `flush` schreibt den Endstand).
 */
export function createJobStreamReporter(
  id: string,
  describe: (words: number) => string,
  intervalMs = 300,
): { add: (delta: string) => void; flush: () => void } {
  let text = "";
  let lastAt = 0;

  const report = () => {
    lastAt = Date.now();
    updateJob(id, { detail: describe(countWords(text)) });
  };

  return {
    add(delta: string) {
      text += delta;
      if (Date.now() - lastAt < intervalMs) return;
      report();
    },
    flush() {
      report();
    },
  };
}

export function finishJob(id: string, status: Exclude<JobStatus, "running">, message?: string): void {
  const job = jobs.get(id);
  if (!job) return;
  jobs.set(id, { ...job, status, message: message ?? job.message, finishedAt: Date.now() });
  cancelled.delete(id);
  emit();
}

/** Bittet einen laufenden Job abzubrechen — die Schleife prüft `isCancelled`. */
export function cancelJob(id: string): void {
  const job = jobs.get(id);
  if (!job || job.status !== "running") return;
  cancelled.add(id);
  emit();
}

export function isCancelled(id: string): boolean {
  return cancelled.has(id);
}

/** Beendete Jobs aus der Liste nehmen (die Arbeit ist bereits im Buch gespeichert). */
export function dismissJob(id: string): void {
  const job = jobs.get(id);
  if (!job || job.status === "running") return;
  jobs.delete(id);
  emit();
}

export function clearFinishedJobs(): void {
  for (const [id, job] of jobs) {
    if (job.status !== "running") jobs.delete(id);
  }
  emit();
}

export function runningJobCount(): number {
  return snapshot.filter((job) => job.status === "running").length;
}

/** React-Hook auf den Store. */
export function useJobs(): Job[] {
  return useSyncExternalStore(subscribeJobs, listJobs, listJobs);
}
