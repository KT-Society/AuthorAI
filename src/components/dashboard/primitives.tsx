import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

export const TONES = {
  violet: {
    text: "text-brand-violet",
    bg: "bg-brand-violet",
    soft: "bg-brand-violet/10",
    border: "border-brand-violet/30",
    gradient: "from-brand-violet to-brand-cyan",
    glow: "shadow-[0_0_34px_-10px_hsl(258_90%_66%/0.85)]",
  },
  cyan: {
    text: "text-brand-cyan",
    bg: "bg-brand-cyan",
    soft: "bg-brand-cyan/10",
    border: "border-brand-cyan/30",
    gradient: "from-brand-cyan to-brand-indigo",
    glow: "shadow-[0_0_34px_-10px_hsl(186_100%_55%/0.85)]",
  },
  emerald: {
    text: "text-brand-emerald",
    bg: "bg-brand-emerald",
    soft: "bg-brand-emerald/10",
    border: "border-brand-emerald/30",
    gradient: "from-brand-emerald to-brand-cyan",
    glow: "shadow-[0_0_34px_-10px_hsl(158_84%_46%/0.85)]",
  },
  amber: {
    text: "text-brand-amber",
    bg: "bg-brand-amber",
    soft: "bg-brand-amber/10",
    border: "border-brand-amber/30",
    gradient: "from-brand-amber to-brand-rose",
    glow: "shadow-[0_0_34px_-10px_hsl(38_95%_60%/0.85)]",
  },
  rose: {
    text: "text-brand-rose",
    bg: "bg-brand-rose",
    soft: "bg-brand-rose/10",
    border: "border-brand-rose/30",
    gradient: "from-brand-rose to-brand-violet",
    glow: "shadow-[0_0_34px_-10px_hsl(342_90%_62%/0.85)]",
  },
  indigo: {
    text: "text-brand-indigo",
    bg: "bg-brand-indigo",
    soft: "bg-brand-indigo/10",
    border: "border-brand-indigo/30",
    gradient: "from-brand-indigo to-brand-violet",
    glow: "shadow-[0_0_34px_-10px_hsl(232_85%_64%/0.85)]",
  },
} as const;

export type Tone = keyof typeof TONES;

export function Panel({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "glass rounded-2xl transition-colors duration-300 hover:border-white/20",
        className,
      )}
      {...props}
    />
  );
}

export function PanelHeader({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        {icon ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-foreground/80">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold tracking-tight">{title}</h3>
          {subtitle ? (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {action}
    </div>
  );
}

export function ViewHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="float-in mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-brand-violet">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 sm:gap-3">{actions}</div> : null}
    </header>
  );
}

export function Badge({
  tone = "violet",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
        TONES[tone].border,
        TONES[tone].soft,
        TONES[tone].text,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ProgressBar({
  value,
  tone = "violet",
  className,
}: {
  value: number;
  tone?: Tone;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/10", className)}>
      <div
        className={cn(
          "h-full rounded-full bg-gradient-to-r transition-[width] duration-700 ease-out",
          TONES[tone].gradient,
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function Sparkline({
  data,
  tone = "violet",
  className,
}: {
  data: number[];
  tone?: Tone;
  className?: string;
}) {
  const max = data.length > 0 ? Math.max(...data) : 1;
  return (
    <div className={cn("flex h-10 items-end gap-1", className)}>
      {data.map((value, index) => {
        const height = max > 0 ? Math.max(6, (value / max) * 100) : 6;
        return (
          <div
            key={index}
            className={cn(
              "flex-1 rounded-sm bg-gradient-to-t opacity-80 transition-opacity duration-300 hover:opacity-100",
              TONES[tone].gradient,
            )}
            style={{ height: `${height}%` }}
          />
        );
      })}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-white/5 text-muted-foreground">
        {icon}
      </span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
