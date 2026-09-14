import { useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle2, Loader2, X, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

import { cancelJob, clearFinishedJobs, dismissJob, useJobs } from "@/lib/jobs";
import type { Job } from "@/lib/jobs";
import { showToast } from "@/lib/toast";

const STATUS_META: Record<
  Job["status"],
  { label: string; className: string; icon: typeof Loader2 }
> = {
  running: { label: "läuft", className: "text-brand-cyan", icon: Loader2 },
  done: { label: "fertig", className: "text-brand-emerald", icon: CheckCircle2 },
  error: { label: "Fehler", className: "text-brand-rose", icon: XCircle },
  cancelled: { label: "abgebrochen", className: "text-brand-amber", icon: AlertTriangle },
};

/**
 * Job-Center: zeigt Hintergrund-Queues (Kohärenz/Stil/Ausbau/Fakten-Check) inklusive
 * Fortschritt und Abbrechen — auch wenn der auslösende Dialog längst geschlossen ist.
 */
export function JobCenter() {
  const jobs = useJobs();
  /** Bereits gemeldete Abschlüsse, damit Toasts nicht doppelt feuern. */
  const reportedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const job of jobs) {
      if (job.status === "running") continue;
      const key = `${job.id}:${job.status}`;
      if (reportedRef.current.has(key)) continue;
      reportedRef.current.add(key);
      const tone = job.status === "done" ? "ok" : job.status === "error" ? "error" : "info";
      showToast(
        `${job.title} — ${STATUS_META[job.status].label}${job.message ? `: ${job.message}` : ""}`,
        tone,
      );
    }
  }, [jobs]);

  if (jobs.length === 0) return null;

  const running = jobs.filter((job) => job.status === "running").length;
  const finished = jobs.filter((job) => job.status !== "running").length;

  return (
    <div className="glass-strong pointer-events-auto w-full rounded-2xl border border-white/10 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-xs font-semibold">
          {running > 0 ? (
            <Loader2 className="size-3.5 animate-spin text-brand-cyan" />
          ) : (
            <CheckCircle2 className="size-3.5 text-brand-emerald" />
          )}
          Hintergrund-Jobs
          {running > 0 ? (
            <span className="rounded-full bg-brand-cyan/15 px-1.5 text-[10px] text-brand-cyan">
              {running} aktiv
            </span>
          ) : null}
        </span>
        {finished > 0 ? (
          <button
            type="button"
            onClick={clearFinishedJobs}
            className="rounded-lg border border-white/10 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            Aufräumen
          </button>
        ) : null}
      </div>

      <div className="space-y-2">
        {jobs.slice(0, 6).map((job) => {
          const meta = STATUS_META[job.status];
          const Icon = meta.icon;
          const percent = job.total === 0 ? 0 : Math.min(100, (job.done / job.total) * 100);
          return (
            <div key={job.id} className="rounded-xl border border-white/10 bg-white/5 p-2">
              <div className="flex items-center gap-2">
                <Icon
                  className={cn("size-3.5 shrink-0", meta.className, job.status === "running" && "animate-spin")}
                />
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{job.title}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {job.total > 0 ? `${job.done}/${job.total}` : meta.label}
                </span>
                {job.status === "running" ? (
                  <button
                    type="button"
                    onClick={() => cancelJob(job.id)}
                    title="Abbrechen (das Kapitel läuft noch zu Ende)"
                    className="shrink-0 rounded-md border border-white/10 p-1 text-muted-foreground transition-colors hover:text-brand-amber"
                  >
                    <X className="size-3" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => dismissJob(job.id)}
                    title="Ausblenden"
                    className="shrink-0 rounded-md border border-white/10 p-1 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>

              {job.status === "running" ? (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-cyan to-brand-indigo transition-all duration-300"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              ) : job.message ? (
                <p
                  className={cn(
                    "mt-1 truncate text-[10px]",
                    job.status === "error" ? "text-brand-rose" : "text-muted-foreground",
                  )}
                >
                  {job.message}
                </p>
              ) : null}

              {job.status === "running" && (job.label || job.detail) ? (
                <p className="mt-1 flex items-center gap-1.5 text-[10px]">
                  {job.label ? (
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {job.label}
                    </span>
                  ) : null}
                  {job.label && job.detail ? (
                    <span className="text-muted-foreground/40">·</span>
                  ) : null}
                  {job.detail ? (
                    <span className="shrink-0 tabular-nums text-brand-cyan/80">{job.detail}</span>
                  ) : null}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
