import { useState } from "react";
import { Feather, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { createProfile } from "@/lib/profile";
import type { Profile } from "@/lib/profile";

export function ProfileGate({
  profiles,
  onSelect,
  onCreate,
  onDelete,
}: {
  profiles: Profile[];
  onSelect: (id: string) => void;
  onCreate: (profile: Profile) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(createProfile(trimmed));
    setName("");
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      <div className="glass-strong float-in w-full max-w-md rounded-2xl p-7">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-violet to-brand-cyan text-white shadow-[0_0_30px_-8px_hsl(258_90%_66%/0.9)]">
            <Feather className="size-5" />
          </span>
          <div>
            <p className="text-sm font-bold tracking-tight">AuthorAI</p>
            <p className="text-[11px] text-muted-foreground">Dein KI-Buchautor</p>
          </div>
        </div>

        <h1 className="mt-6 text-xl font-bold tracking-tight">Wer schreibt heute?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Jedes Profil hat seine eigene Bibliothek. In jedem neuen Profil sind die Beispielprojekte
          vorhanden — Löschen und Anlegen betrifft nur dich.
        </p>

        {profiles.length > 0 ? (
          <div className="mt-5 space-y-2">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2 transition-colors hover:border-white/20"
              >
                <button
                  type="button"
                  onClick={() => onSelect(profile.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-rose to-brand-violet text-sm font-bold text-white">
                    {profile.name.charAt(0).toUpperCase() || "A"}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{profile.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      Profil öffnen
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  title="Profil löschen"
                  onClick={() => {
                    if (window.confirm(`Profil „${profile.name}“ und alle zugehörigen Daten löschen?`)) {
                      onDelete(profile.id);
                    }
                  }}
                  className="rounded-lg p-2 text-muted-foreground opacity-0 transition-opacity hover:text-brand-rose group-hover:opacity-100"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-3">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Neues Profil
          </label>
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
              placeholder="Dein Name"
              className="glass h-10 rounded-xl border-white/10"
            />
            <Button
              onClick={submit}
              disabled={name.trim().length === 0}
              className="h-10 shrink-0 rounded-xl bg-gradient-to-r from-brand-violet to-brand-indigo px-4 font-semibold text-white shadow-[0_0_30px_-10px_hsl(258_90%_66%/0.95)] disabled:opacity-50"
            >
              <Plus className="size-4" />
              Anlegen
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
