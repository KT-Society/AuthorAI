import { useMemo, useState } from "react";
import { Loader2, Plus, Search, Sparkles, Users, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type { Book } from "@/data/author";
import type { Character } from "@/data/characters";
import { makeCharacter } from "@/data/characters";
import type { CanonFact, CharacterRelation } from "@/data/continuity";
import type { StoryCharacter } from "@/data/story";
import { manuscriptOf } from "@/lib/bookManuscript";
import { dedupeCharacters, findMatchingCharacter } from "@/lib/characterMatch";
import { readLanguage, readStageModel } from "@/lib/generationSettings";
import { showToast } from "@/lib/toast";
import { streamCharactersExtract } from "@/services/story";

import { CharacterCard } from "./CharacterCard";
import { CharacterEditorDialog } from "./CharacterEditorDialog";
import { CharacterExtractDialog } from "./CharacterExtractDialog";
import { CharacterGenerator } from "./CharacterGenerator";
import { EmptyState } from "./primitives";

export function CharactersView({
  books,
  characters,
  facts = [],
  relations = [],
  onFactsChange,
  onRelationsChange,
  onAddCharacter,
  onAddCharacters,
  onUpdateCharacter,
  onDeleteCharacter,
  onDeleteCharacters,
}: {
  books: Book[];
  characters: Character[];
  facts?: CanonFact[];
  relations?: CharacterRelation[];
  onFactsChange?: (facts: CanonFact[]) => void;
  onRelationsChange?: (relations: CharacterRelation[]) => void;
  onAddCharacter: (character: Character) => void;
  onAddCharacters: (characters: Character[]) => void;
  onUpdateCharacter: (character: Character) => void;
  onDeleteCharacter: (id: string) => void;
  /** Mehrere Figuren auf einmal entfernen (Dubletten-Aufräumen). */
  onDeleteCharacters: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [bookFilter, setBookFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Character | null>(null);
  const [extractBookId, setExtractBookId] = useState<string>(
    () => books.find((book) => (book.manuscript?.length ?? 0) > 0)?.id ?? books[0]?.id ?? "",
  );
  const [extractBusy, setExtractBusy] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<StoryCharacter[] | null>(null);

  const runExtract = async () => {
    const book = books.find((item) => item.id === extractBookId);
    if (!book) {
      setExtractError("Bitte ein Projekt auswählen.");
      return;
    }
    const chapters = manuscriptOf(book)
      .map((chapter, index) => ({
        title: chapter.title?.trim() || book.storyboard?.chapters[index]?.title || `Kapitel ${index + 1}`,
        text: (chapter.expanded || chapter.draft || "").trim(),
      }))
      .filter((chapter) => chapter.text.length > 0);
    if (chapters.length === 0) {
      setExtractError("Dieses Projekt hat noch kein Manuskript — bitte zuerst Kapitel schreiben.");
      return;
    }
    const model = readStageModel("storyboard");
    if (!model.trim()) {
      setExtractError("Bitte eine Model-ID für „Storyboard“ in den Einstellungen eintragen.");
      return;
    }
    setExtractError(null);
    setExtractBusy(true);
    // Dialog sofort öffnen — die Figuren treffen live ein.
    setCandidates([]);
    const live: StoryCharacter[] = [];
    try {
      const known = [
        ...characters.map((character) => character.name),
        ...(book.storyboard?.characters ?? []).map((entry) => entry.name),
      ];
      const found = await streamCharactersExtract(
        {
          bookTitle: book.title,
          genre: book.storyboard?.genre,
          chapters,
          knownCharacters: known,
          model,
          language: readLanguage() ?? "German",
        },
        {
          onCharacter: (character) => {
            // Namen gegen Vorhandenes und gegen die Live-Liste prüfen — kein doppelter Vorschlag.
            const taken = new Set(live.map((entry) => entry.name.toLowerCase()));
            if (taken.has(character.name.toLowerCase())) return;
            live.push(character);
            setCandidates([...live]);
          },
        },
      );
      // Abschluss: validierte Liste. Live gefundene Figuren bleiben erhalten, sofern der Server
      // sie auch bestätigt (gleiche Namen) — so geht die Auswahl des Nutzers nicht verloren.
      const confirmedNames = new Set(found.map((character) => character.name.toLowerCase()));
      const confirmed = live.filter((character) => confirmedNames.has(character.name.toLowerCase()));
      const final = live.length === 0 ? found : confirmed;
      if (final.length === 0) {
        setCandidates(null);
        setExtractError("Keine neuen Figuren gefunden (alles bereits vorhanden).");
        return;
      }
      setCandidates(final);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Unbekannter Fehler.");
      setCandidates(live.length > 0 ? [...live] : null);
    } finally {
      setExtractBusy(false);
    }
  };

  const acceptCandidates = (accepted: StoryCharacter[]) => {
    const book = books.find((item) => item.id === extractBookId);
    const created: Character[] = [];
    let skipped = 0;

    for (const entry of accepted) {
      const candidate = makeCharacter(
        {
          name: entry.name,
          role: entry.role,
          description: entry.description,
          bookId: book?.id,
          tags: ["Manuskript"],
        },
        characters.length + created.length,
      );
      // Dublettenprüfung: „Prinzessin Lysara" ist „Lysara" (Anreden/Ränge werden ignoriert).
      if (
        findMatchingCharacter(candidate, characters) ||
        findMatchingCharacter(candidate, created)
      ) {
        skipped += 1;
        continue;
      }
      created.push(candidate);
    }

    if (created.length > 0) onAddCharacters(created);

    const parts = [
      created.length > 0
        ? created.length === 1
          ? "1 Figur übernommen"
          : `${created.length} Figuren übernommen`
        : "",
      skipped > 0 ? `${skipped} bereits vorhanden (übersprungen)` : "",
    ].filter(Boolean);
    showToast(parts.join(" · ") || "Nichts übernommen", created.length > 0 ? "ok" : "info");
    setCandidates(null);
  };

  /** Bestehende Dubletten aufräumen (behält je Figur den ersten Eintrag). */
  const removeDuplicates = () => {
    const { kept, removed } = dedupeCharacters(characters);
    if (removed.length === 0) {
      showToast("Keine Dubletten gefunden", "info");
      return;
    }
    const confirmed = window.confirm(
      `${removed.length} Dublette${removed.length === 1 ? "" : "n"} entfernen? Es bleiben ${kept.length} Figuren.` +
        `\n\nBehalten wird jeweils der erste Eintrag. Fakten und Beziehungen der entfernten Figuren werden mitgelöscht.`,
    );
    if (!confirmed) return;
    onDeleteCharacters(removed.map((character) => character.id));
    showToast(
      removed.length === 1 ? "1 Dublette entfernt" : `${removed.length} Dubletten entfernt`,
    );
  };

  /** Wie viele Dubletten stecken aktuell in der Liste? (für die Button-Beschriftung) */
  const duplicateCount = useMemo(
    () => dedupeCharacters(characters).removed.length,
    [characters],
  );

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
            {characters.length} Figuren in deiner Welt — per promptgen oder aus dem Manuskript.
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

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Select value={extractBookId} onValueChange={setExtractBookId}>
          <SelectTrigger size="sm" className="glass w-56 border-white/10">
            <SelectValue placeholder="Projekt wählen" />
          </SelectTrigger>
          <SelectContent className="glass-strong border-white/10">
            {books.map((book) => (
              <SelectItem key={book.id} value={book.id}>
                {book.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          className="glass rounded-lg border-white/10"
          onClick={() => void runExtract()}
          disabled={extractBusy || books.length === 0}
          title="Benannte Figuren aus dem Manuskript ableiten — findet auch Figuren, die erst im Text auftauchen"
        >
          {extractBusy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          Figuren aus Manuskript ableiten
        </Button>
        <Button
          size="sm"
          variant={duplicateCount > 0 ? "default" : "outline"}
          className={cn(
            "rounded-lg",
            duplicateCount > 0
              ? "bg-gradient-to-r from-brand-amber to-brand-rose font-semibold text-white"
              : "glass border-white/10",
          )}
          onClick={removeDuplicates}
          disabled={characters.length < 2}
          title="Figuren mit gleichem Namen zusammenfassen — Anreden wie Prinzessin werden ignoriert"
        >
          <Wand2 className="size-3.5" />
          {duplicateCount > 0 ? `Dubletten entfernen (${duplicateCount})` : "Dubletten entfernen"}
        </Button>
      </div>

      {extractError ? (
        <div className="mb-4 rounded-xl border border-brand-rose/30 bg-brand-rose/10 px-3 py-2 text-sm text-brand-rose">
          {extractError}
        </div>
      ) : null}

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

      <CharacterExtractDialog
        open={candidates !== null}
        candidates={candidates ?? []}
        running={extractBusy}
        bookTitle={books.find((book) => book.id === extractBookId)?.title ?? ""}
        onClose={() => setCandidates(null)}
        onAccept={acceptCandidates}
      />

      <CharacterEditorDialog
        open={editing !== null}
        character={editing}
        characters={characters}
        facts={facts}
        relations={relations}
        onFactsChange={onFactsChange}
        onRelationsChange={onRelationsChange}
        onClose={() => setEditing(null)}
        onSave={onUpdateCharacter}
      />
    </div>
  );
}
