import { BookOpen, Pencil, Sparkles, Trash2 } from "lucide-react";

import type { Book } from "@/data/author";
import type { Character } from "@/data/characters";
import { characterInitials, filledSectionCount, SOUL_SECTIONS } from "@/data/characters";

import { Panel } from "./primitives";

export function CharacterCard({
  character,
  book,
  onEdit,
  onDelete,
}: {
  character: Character;
  book: Book | undefined;
  onEdit: (character: Character) => void;
  onDelete: (id: string) => void;
}) {
  const filled = filledSectionCount(character.soul);

  return (
    <Panel className="group flex h-full flex-col p-5 transition-all duration-300 hover:-translate-y-1 hover:border-white/20">
      <div className="flex items-center gap-3">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-[0_10px_30px_-12px_rgba(0,0,0,0.9)]"
          style={{
            backgroundImage: `linear-gradient(140deg, ${character.gradient[0]}, ${character.gradient[1]})`,
          }}
        >
          {characterInitials(character.name)}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold tracking-tight">{character.name}</h3>
          <p className="truncate text-xs text-muted-foreground">{character.role}</p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            title="Charakter bearbeiten"
            onClick={() => onEdit(character)}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            title="Charakter löschen"
            onClick={() => {
              if (window.confirm(`„${character.name}“ löschen?`)) onDelete(character.id);
            }}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-brand-rose"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-foreground/80">
        {character.core}
      </p>

      <div className="mt-auto pt-4">
        {character.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {character.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-brand-violet" />
            {filled}/{SOUL_SECTIONS.length} Soul-Sektionen
          </span>
          {book ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <BookOpen className="size-3.5 text-brand-cyan" />
              <span className="max-w-[140px] truncate">{book.title}</span>
            </span>
          ) : (
            <span>Standalone</span>
          )}
        </div>
      </div>
    </Panel>
  );
}
