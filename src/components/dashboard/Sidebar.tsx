import {
  BarChart3,
  Feather,
  GitBranch,
  Globe2,
  LayoutDashboard,
  Library,
  ListTree,
  Search,
  Settings,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "library", label: "Bibliothek", icon: Library },
  { id: "chapters", label: "Kapitel", icon: ListTree },
  { id: "characters", label: "Charaktere", icon: Users },
  { id: "world", label: "Weltenbau", icon: Globe2 },
  { id: "plot", label: "Plot-Board", icon: GitBranch },
  { id: "research", label: "Recherche", icon: Search },
  { id: "stats", label: "Statistiken", icon: BarChart3 },
];

export function Sidebar({
  active,
  onSelect,
  onOpenSettings,
  profileName,
  onSwitchProfile,
  characterCount,
}: {
  active: string;
  onSelect: (id: string) => void;
  onOpenSettings: () => void;
  profileName: string;
  onSwitchProfile: () => void;
  characterCount: number;
}) {
  return (
    <aside className="glass sticky top-6 hidden h-[calc(100vh-3rem)] w-[84px] shrink-0 flex-col rounded-2xl p-3 md:flex xl:w-[264px]">
      <div className="flex items-center gap-3 px-1 py-2">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-violet to-brand-cyan text-white shadow-[0_0_30px_-8px_hsl(258_90%_66%/0.9)]">
          <Feather className="size-5" />
        </span>
        <div className="hidden min-w-0 xl:block">
          <p className="truncate text-sm font-bold tracking-tight">AuthorAI</p>
          <p className="truncate text-[11px] text-muted-foreground">Dein KI-Buchautor</p>
        </div>
      </div>

      <nav className="mt-4 flex flex-1 flex-col gap-1 overflow-y-auto">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          const badge = item.id === "characters" && characterCount > 0 ? characterCount : null;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              title={item.label}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-brand-violet to-brand-cyan transition-opacity",
                  isActive ? "opacity-100" : "opacity-0",
                )}
              />
              <Icon
                className={cn("size-4 shrink-0", isActive ? "text-brand-cyan" : "text-current")}
              />
              <span className="hidden truncate xl:block">{item.label}</span>
              {badge !== null ? (
                <span className="ml-auto hidden rounded-full bg-white/10 px-1.5 text-[10px] font-semibold text-foreground/80 xl:block">
                  {badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="mt-2 flex flex-col gap-1">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <Settings className="size-4 shrink-0" />
          <span className="hidden xl:block">Einstellungen</span>
        </button>

        <button
          type="button"
          onClick={onSwitchProfile}
          title="Profil wechseln"
          className="mt-1 flex w-full items-center gap-3 rounded-xl bg-white/5 p-2 text-left transition-colors hover:bg-white/10"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-rose to-brand-violet text-sm font-bold text-white">
            {profileName.charAt(0).toUpperCase() || "A"}
          </span>
          <div className="hidden min-w-0 xl:block">
            <p className="truncate text-sm font-semibold">{profileName}</p>
            <p className="truncate text-[11px] text-brand-amber">Profil wechseln</p>
          </div>
        </button>
      </div>
    </aside>
  );
}
