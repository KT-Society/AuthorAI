import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { subscribeToasts } from "@/lib/toast";
import type { ToastItem } from "@/lib/toast";

/** Rendert alle aktiven Toasts (fest unten mittig, nicht druckbar). */
export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => subscribeToasts(setItems), []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2 print:hidden">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            "glass-strong float-in flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg",
            item.tone === "ok" ? "text-brand-emerald" : "text-brand-rose",
          )}
        >
          {item.tone === "ok" ? (
            <CheckCircle2 className="size-4 shrink-0" />
          ) : (
            <AlertTriangle className="size-4 shrink-0" />
          )}
          {item.message}
        </div>
      ))}
    </div>
  );
}
