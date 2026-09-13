import { cn } from "@/lib/utils";
import type { DiffPart } from "@/lib/diff";

/**
 * Stellt einen Wort-Diff dar: Entferntes rot/durchgestrichen, Hinzugefügtes grün.
 * Rein darstellend — die Daten kommen aus `lib/diff.ts`.
 */
export function DiffView({ parts, className }: { parts: DiffPart[]; className?: string }) {
  return (
    <p
      className={cn(
        "whitespace-pre-wrap break-words font-serif text-[13px] leading-relaxed text-foreground/90",
        className,
      )}
    >
      {parts.map((part, index) =>
        part.op === "same" ? (
          <span key={index}>{part.text}</span>
        ) : part.op === "remove" ? (
          <span
            key={index}
            className="rounded bg-brand-rose/15 text-brand-rose line-through decoration-brand-rose/60"
          >
            {part.text}
          </span>
        ) : (
          <span key={index} className="rounded bg-brand-emerald/15 text-brand-emerald">
            {part.text}
          </span>
        ),
      )}
    </p>
  );
}
