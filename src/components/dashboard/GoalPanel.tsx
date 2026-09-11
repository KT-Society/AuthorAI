import { Minus, Plus, RotateCcw, Target } from "lucide-react";

import { Button } from "@/components/ui/button";

import { formatNumber } from "@/data/author";

import { Panel, PanelHeader } from "./primitives";

const STEP = 250;

export function GoalPanel({
  today,
  goal,
  onAdd,
  onReset,
}: {
  today: number;
  goal: number;
  onAdd: (amount: number) => void;
  onReset: () => void;
}) {
  const percent = goal > 0 ? Math.min(100, Math.round((today / goal) * 100)) : 0;
  const remaining = Math.max(0, goal - today);
  const reached = today >= goal;

  return (
    <Panel className="p-5">
      <PanelHeader
        icon={<Target className="size-4" />}
        title="Tagesziel"
        subtitle={reached ? "Ziel erreicht — stark!" : `${formatNumber(remaining)} Wörter bis zum Ziel`}
      />

      <div className="mt-5 flex items-center gap-5">
        <div
          className="relative flex size-24 shrink-0 items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(${
              reached ? "hsl(158 84% 46%)" : "hsl(186 100% 55%)"
            } ${percent * 3.6}deg, hsl(0 0% 100% / 0.08) 0)`,
          }}
        >
          <div className="flex size-[76px] flex-col items-center justify-center rounded-full bg-[hsl(240_24%_6%)]">
            <span className="text-xl font-bold tracking-tight">{percent}%</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Ziel</span>
          </div>
        </div>

        <div className="min-w-0">
          <p className="text-2xl font-bold tracking-tight">{formatNumber(today)}</p>
          <p className="text-xs text-muted-foreground">von {formatNumber(goal)} Wörtern heute</p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="glass rounded-lg border-white/10"
              onClick={() => onAdd(STEP)}
            >
              <Plus className="size-3.5" />
              {STEP}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="glass rounded-lg border-white/10"
              onClick={() => onAdd(-STEP)}
              disabled={today <= 0}
            >
              <Minus className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="mt-4 w-full justify-start text-muted-foreground hover:text-foreground"
        onClick={onReset}
      >
        <RotateCcw className="size-3.5" />
        Zähler zurücksetzen
      </Button>
    </Panel>
  );
}
