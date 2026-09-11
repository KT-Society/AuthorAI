import { useMemo, useState } from "react";
import { Plus, Search, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { Book } from "@/data/author";
import type { Character } from "@/data/characters";

import { CharacterCard } from "./CharacterCard";
import { CharacterEditorDialog } from "./CharacterEditorDialog";
import { CharacterGenerator } from "./CharacterGenerator";
import { EmptyState } from "./primitives";

export function CharactersView({
  books,
  characters,
  onAddCharacter,
  onUpdateCharacter,
  onDeleteCharacter,
}: {
  books: Book[];
  characters: Character[];
  onAddCharacter: (character: Character) => void;
  onUpdateCharacter: (character: Character) => void;
  onDeleteCharacter: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [bookFilter, setBookFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Character | null>(null);

  const booksWithCharacters = useMemo(() => {
    const ids = new Set(
      characters.map((character) => character.bookId).filter((id): id is string => Boolean(id)),
    );
    return books.filter((book) => ids.has(book.id));
  }, [books, characters]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return characters.filter((character) => {
      const matchesQuery =
        normalized.length === 0 ||
        character.name.toLowerCase().includes(normalized) ||
        character.role.toLowerCase().includes(normalized) ||
        character.tags.some((tag) => tag.toLowerCase().includes(normalized));
      const matchesBook = bookFilter === "all" || character.bookId === bookFilter;
      return matchesQuery && matchesBook;
    });
  }, [characters, query, bookFilter]);

  return (
    <div>
      <header className="float-in mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-brand-violet">
            Figuren
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Charaktere</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {characters.length} Figuren in deiner Welt — neue per promptgen einführen.
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative flex-1 lg:w-72 lg:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Charaktere durchsuchen…"
              className="glass h-10 rounded-xl pl-9"
            />
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            className="h-10 rounded-xl bg-gradient-to-r from-brand-violet to-brand-indigo px-4 font-semibold text-white shadow-[0_0_30px_-10px_hsl(258_90%_66%/0.95)] transition-transform hover:scale-[1.02]"
          >
            <Plus className="size-4" />
            Neuer Charakter
          </Button>
        </div>
      </header>

      <div className="mb-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setBookFilter("all")}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200",
            bookFilter === "all"
              ? "border-transparent bg-gradient-to-r from-brand-violet to-brand-indigo text-white shadow-[0_0_26px_-12px_hsl(258_90%_66%/0.95)]"
              : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20 hover:text-foreground",
          )}
        >
          Alle
          <span className="ml-2 rounded-full bg-white/10 px-1.5 text-[10px]">{characters.length}</span>
        </button>
        {booksWithCharacters.map((book) => {
          const count = characters.filter((character) => character.bookId === book.id).length;
          const isActive = bookFilter === book.id;
          return (
            <button
              key={book.id}
              type="button"
              onClick={() => setBookFilter(book.id)}
              className={cn(
                "max-w-[220px] truncate rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200",
                isActive
                  ? "border-transparent bg-gradient-to-r from-brand-cyan to-brand-indigo text-white shadow-[0_0_26px_-12px_hsl(186_100%_55%/0.95)]"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20 hover:text-foreground",
              )}
            >
              {book.title}
              <span className="ml-2 rounded-full bg-white/10 px-1.5 text-[10px]">{count}</span>
            </button>
          );
        })}
      </div>

      {visible.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {visible.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              book={books.find((book) => book.id === character.bookId)}
              onEdit={setEditing}
              onDelete={onDeleteCharacter}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Users className="size-6" />}
          title="Keine Charaktere gefunden"
          description="Passe Suche oder Filter an — oder führe mit promptgen einen neuen Charakter ein."
        />
      )}

      <CharacterGenerator
        open={dialogOpen}
        existingCount={characters.length}
        books={books}
        onClose={() => setDialogOpen(false)}
        onCreate={onAddCharacter}
      />

      <CharacterEditorDialog
        open={editing !== null}
        character={editing}
        onClose={() => setEditing(null)}
        onSave={onUpdateCharacter}
      />
    </div>
  );
}
