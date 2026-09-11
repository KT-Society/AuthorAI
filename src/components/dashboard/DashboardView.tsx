import { useEffect, useMemo, useState } from "react";

import type { Book, BookStatus, Idea } from "@/data/author";
import type { Character } from "@/data/characters";
import type { CanonFact, CharacterRelation } from "@/data/continuity";
import type { Series } from "@/data/series";
import type { WorldEntry } from "@/data/world";
import type { AppNotification } from "@/lib/notifications";

import { ActivityFeed } from "./ActivityFeed";
import { BookLibrary } from "./BookLibrary";
import type { SortKey } from "./BookLibrary";
import { BookWizard } from "./BookWizard";
import { ContinueHero } from "./ContinueHero";
import { GoalPanel } from "./GoalPanel";
import { IdeaList } from "./IdeaList";
import { StatGrid } from "./StatGrid";
import { TopBar } from "./TopBar";

export function DashboardView({
  books,
  series = [],
  characters = [],
  worlds = [],
  facts = [],
  relations = [],
  onAddBook,
  onOpenBook,
  onDeleteBook,
  createRequest,
  notifications,
  onClearActivity,
  ideas,
  onDeleteIdea,
  onClearIdeas,
  todayWords,
  goal,
  onAddWords,
  onResetWords,
  weeklyWords,
  streakCurrent,
  streakBest,
  onWordsWritten,
  profileName,
}: {
  books: Book[];
  series?: Series[];
  characters?: Character[];
  worlds?: WorldEntry[];
  facts?: CanonFact[];
  relations?: CharacterRelation[];
  onAddBook: (book: Book, seriesId?: string) => void;
  onOpenBook: (id: string) => void;
  onDeleteBook: (id: string) => void;
  createRequest: number;
  notifications: AppNotification[];
  onClearActivity: () => void;
  ideas: Idea[];
  onDeleteIdea: (id: string) => void;
  onClearIdeas: () => void;
  todayWords: number;
  goal: number;
  onAddWords: (amount: number) => void;
  onResetWords: () => void;
  weeklyWords: number[];
  streakCurrent: number;
  streakBest: number;
  onWordsWritten: (count: number) => void;
  profileName: string;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<BookStatus | "all">("all");
  const [sort, setSort] = useState<SortKey>("updated");
  const [selectedId, setSelectedId] = useState<string>(books[0]?.id ?? "");
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (createRequest > 0) setDialogOpen(true);
  }, [createRequest]);

  const selectedBook = useMemo(
    () => books.find((book) => book.id === selectedId) ?? books[0],
    [books, selectedId],
  );

  return (
    <>
      <TopBar
        query={query}
        onQueryChange={setQuery}
        onCreate={() => setDialogOpen(true)}
        profileName={profileName}
      />

      <ContinueHero
        book={selectedBook}
        onOpen={() => selectedBook && onOpenBook(selectedBook.id)}
      />

      <StatGrid
        books={books}
        weeklyWords={weeklyWords}
        streakCurrent={streakCurrent}
        streakBest={streakBest}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <BookLibrary
          books={books}
          query={query}
          status={status}
          sort={sort}
          onStatusChange={setStatus}
          onSortChange={setSort}
          selectedId={selectedBook?.id ?? ""}
          onSelect={setSelectedId}
          onOpenBook={onOpenBook}
          onDeleteBook={onDeleteBook}
        />

        <aside className="flex flex-col gap-6">
          <GoalPanel
            today={todayWords}
            goal={goal}
            onAdd={onAddWords}
            onReset={onResetWords}
          />
          <ActivityFeed items={notifications} onClear={onClearActivity} />
          <IdeaList ideas={ideas} onDelete={onDeleteIdea} onClear={onClearIdeas} />
        </aside>
      </div>

      <BookWizard
        open={dialogOpen}
        existingCount={books.length}
        series={series}
        books={books}
        characters={characters}
        worlds={worlds}
        facts={facts}
        relations={relations}
        onClose={() => setDialogOpen(false)}
        onCreate={onAddBook}
        onWordsWritten={onWordsWritten}
      />
    </>
  );
}
