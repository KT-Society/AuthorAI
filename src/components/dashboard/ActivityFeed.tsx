import { useMemo } from "react";
import { Flame, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { timeAgo } from "@/data/author";
import { NOTIFICATION_META } from "@/lib/notifications";
import type { AppNotification } from "@/lib/notifications";

import { Panel, PanelHeader } from "./primitives";

export function ActivityFeed({
  items,
  onClear,
}: {
  items: AppNotification[];
  onClear: () => void;
}) {
  const visible = useMemo(() => items.slice(0, 6), [items]);

  if (visible.length === 0) return null;

  return (
    <Panel className="p-5">
      <PanelHeader
        icon={<Flame className="size-4" />}
        title="Aktivität"
        subtitle="Die letzten Ereignisse"
        action={
          <Button
            variant="ghost"
            size="sm"
            className="rounded-lg text-[11px] text-muted-foreground hover:text-brand-rose"
            onClick={onClear}
          >
            <Trash2 className="size-3.5" />
            Leeren
          </Button>
        }
      />

      <ol className="relative mt-5 space-y-4">
        <span className="absolute left-[15px] top-2 bottom-2 w-px bg-white/10" />
        {visible.map((item) => {
          const meta = NOTIFICATION_META[item.kind];
          const Icon = meta.icon;
          return (
            <li key={item.id} className="relative flex gap-3">
              <span
                className={cn(
                  "z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-white/10",
                  meta.className,
                )}
              >
                <Icon className="size-3.5" />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-sm leading-snug text-foreground/90">{item.title}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                  {item.message}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                  {timeAgo(item.createdAt)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
