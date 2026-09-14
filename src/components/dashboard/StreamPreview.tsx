import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { countWords } from "@/data/story";
import { extractProse } from "@/lib/prose";

/**
 * Live-Vorschau eines gestreamten Laufs: wachsender Text, Wortstand und Schritt-Info
 * („Kohärenz · Teil 2/5", „Ausbau · Kapitel 3/12").
 *
 * Reine Anzeige — der fertige Text landet am Ende im Kapitel (bzw. im Assistenten-State).
 * `text === null` bedeutet: kein Lauf aktiv, es wird nichts gerendert.
 */
export function StreamPreview({
  text,
  label,
  className,
  showWords = true,
  render,
}: {
  /**
   * Wachsender Rohtext (kann `<TEXT>`-Marker enthalten — wird über `extractProse` gelesen).
   * Bei gesetztem `render` dient er nur als Auslöser: gerendert wird `render(text)`.
   */
  text: string | null;
  /** Zusatzinfo links neben dem Wortstand. */
  label?: string | null;
  className?: string;
  /**
   * Wortstand anzeigen (Standard). Beim **Storyboard** steht dort keine Prosa, sondern die
   * Kapitelliste — eine Wortzahl wäre irreführend.
   */
  showWords?: boolean;
  /** Eigene Darstellung (z. B. eine Liste statt Prosa). */
  render?: (text: string) => ReactNode;
}) {
  if (text === null) return null;
  const prose = extractProse(text);
  const words = countWords(prose);

  return (
    <div
      className={`rounded-xl border border-brand-cyan/30 bg-brand-cyan/5 p-3 ${className ?? ""}`.trim()}
    >
      <p className="mb-1 inline-flex items-center gap-2 text-[11px] font-semibold text-brand-cyan">
        <Loader2 className="size-3.5 animate-spin" />
        {label ?? "Live-Vorschau"}
        {showWords ? (
          <>
            {" · "}
            <span className="tabular-nums">{words.toLocaleString("de-DE")} Wörter</span>
          </>
        ) : null}
      </p>
      <div className="max-h-52 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-foreground/85">
        {render ? render(text) : prose || "…"}
      </div>
    </div>
  );
}
