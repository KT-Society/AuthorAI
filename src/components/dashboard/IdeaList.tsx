import { Lightbulb, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { Idea } from "@/data/author";

import { Panel, PanelHeader } from "./primitives";

export function IdeaList({
  ideas,
  onDelete,
  onClear,
}: {
  ideas: Idea[];
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  if (ideas.length === 0) return null;

  return (
    <Panel className="p-5">
      <PanelHeader
        icon={<Sparkles className="size-4" />}
        title="Plot-Funken"
        subtitle="Ideen, die auf ihren Moment warten"
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

      <ul className="mt-4 space-y-3">
        {ideas.map((idea) => (
          <li
            key={idea.id}
            className="group flex gap-3 rounded-xl border border-white/10 bg-white/5 p-3 transition-colors duration-200 hover:border-white/20 hover:bg-white/10"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-amber/10 text-brand-amber">
              <Lightbulb className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug text-foreground/90">{idea.text}</p>
              <span className="mt-1 inline-block rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {idea.tag}
              </span>
            </div>
            <button
              type="button"
              title="Idee löschen"
              onClick={() => onDelete(idea.id)}
              className="shrink-0 self-start rounded-lg p-1 text-muted-foreground opacity-0 transition-opacity hover:text-brand-rose group-hover:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
