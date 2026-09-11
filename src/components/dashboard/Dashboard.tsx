import { useEffect, useRef, useState } from "react";

import { BOOKS, IDEAS } from "@/data/author";
import type { Book, DashboardMeta, Idea } from "@/data/author";
import { CHARACTERS, CHARACTER_GRADIENTS, FALLBACK_GRADIENT } from "@/data/characters";
import type { Character } from "@/data/characters";
import { PLOT_CARDS } from "@/data/plot";
import type { PlotCard, PlotStatus } from "@/data/plot";
import { RESEARCH_NOTES } from "@/data/research";
import type { ResearchNote } from "@/data/research";
import { WORLD_ENTRIES, entriesFromStoryWorld } from "@/data/world";
import type { WorldEntry } from "@/data/world";
import {
  loadBooks,
  loadCharacters,
  loadIdeas,
  loadMeta,
  loadNotifications,
  loadPlot,
  loadResearch,
  loadWorld,
  saveBooks,
  saveCharacters,
  saveIdeas,
  saveMeta,
  saveNotifications,
  savePlot,
  saveResearch,
  saveWorld,
} from "@/lib/persistence";
import { releaseCoverImage } from "@/lib/coverStore";
import { emptyMetaToday, normalizeMeta, recordWords } from "@/lib/streak";
import {
  makeNotification,
  NotificationsContext,
  SEED_NOTIFICATIONS,
} from "@/lib/notifications";
import type { AppNotification, NotificationInput } from "@/lib/notifications";

import { BookDetailView } from "./BookDetailView";
import { ChaptersView } from "./ChaptersView";
import { CharactersView } from "./CharactersView";
import { DashboardView } from "./DashboardView";
import { LibraryView } from "./LibraryView";
import { PlotBoardView } from "./PlotBoardView";
import { ResearchView } from "./ResearchView";
import { SettingsDialog } from "./SettingsDialog";
import { Sidebar } from "./Sidebar";
import { StatsView } from "./StatsView";
import { WorldView } from "./WorldView";

/** Characters that exist in a book's storyboard but are not yet in the character list. */
function collectMissingCharacters(source: Book[], existing: Character[]): Character[] {
  const seen = new Set(existing.map((character) => character.name.trim().toLowerCase()));
  const additions: Character[] = [];

  for (const book of source) {
    for (const entry of book.storyboard?.characters ?? []) {
      const name = entry.name.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const description = entry.description.trim();
      const role = entry.role.trim();
      additions.push({
        id: `char-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        role: role || "Figur",
        bookId: book.id,
        gradient:
          CHARACTER_GRADIENTS[additions.length % CHARACTER_GRADIENTS.length] ?? FALLBACK_GRADIENT,
        tags: ["Storyboard"],
        core: description,
        soul: {
          ...(description ? { core: description } : {}),
          ...(role ? { occupation: role } : {}),
        },
        createdAt: new Date().toISOString(),
      });
    }
  }

  return additions;
}

/** World locations that exist in a book's storyboard but are not yet in the world list. */
function collectMissingWorld(source: Book[], existing: WorldEntry[]): WorldEntry[] {
  const seen = new Set(
    existing.map(
      (entry) => `${entry.bookId ?? ""}|${entry.category}|${entry.title.trim().toLowerCase()}`,
    ),
  );
  const additions: WorldEntry[] = [];

  const push = (entry: WorldEntry) => {
    const key = `${entry.bookId ?? ""}|${entry.category}|${entry.title.trim().toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    additions.push(entry);
  };

  for (const book of source) {
    if (book.storyboard?.world) {
      for (const entry of entriesFromStoryWorld(book.storyboard.world, book.id)) push(entry);
      continue;
    }

    // Fallback for storyboards without a world section: use chapter settings.
    (book.storyboard?.chapters ?? []).forEach((chapter, index) => {
      const title = chapter.setting.trim();
      if (!title) return;
      push({
        id: `world-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        category: "Ort",
        bookId: book.id,
        description: `Schauplatz aus Kapitel ${index + 1}: ${chapter.title}.`,
        tags: ["Storyboard"],
        createdAt: new Date().toISOString(),
      });
    });
  }

  return additions;
}

function plotActFor(index: number, total: number): string {
  const ratio = total > 0 ? index / total : 0;
  if (ratio < 0.25) return "Akt I";
  if (ratio < 0.75) return "Akt II";
  return "Akt III";
}

/** Plot cards derived from a book's storyboard chapters. */
function collectMissingPlot(source: Book[], existing: PlotCard[]): PlotCard[] {
  const seen = new Set(existing.map((card) => `${card.bookId}|${card.title.trim().toLowerCase()}`));
  const additions: PlotCard[] = [];

  for (const book of source) {
    const chapters = book.storyboard?.chapters ?? [];
    const manuscript = book.manuscript ?? [];
    chapters.forEach((chapter, index) => {
      const title = chapter.title.trim();
      if (!title) return;
      const key = `${book.id}|${title.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);

      const content = manuscript[index];
      const status: PlotStatus = content?.expanded.trim()
        ? "written"
        : content?.draft.trim()
          ? "planned"
          : "idea";

      additions.push({
        id: `plot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        bookId: book.id,
        title,
        description: chapter.summary.trim(),
        act: plotActFor(index, chapters.length),
        status,
        order: index,
      });
    });
  }

  return additions;
}

export function Dashboard({
  profileId,
  profileName,
  onSwitchProfile,
}: {
  profileId: string;
  profileName: string;
  onSwitchProfile: () => void;
}) {
  const [books, setBooks] = useState<Book[]>(() => loadBooks(profileId) ?? BOOKS);
  const [characters, setCharacters] = useState<Character[]>(
    () => loadCharacters(profileId) ?? CHARACTERS,
  );
  const [worlds, setWorlds] = useState<WorldEntry[]>(() => loadWorld(profileId) ?? WORLD_ENTRIES);
  const [plotCards, setPlotCards] = useState<PlotCard[]>(() => loadPlot(profileId) ?? PLOT_CARDS);
  const [notes, setNotes] = useState<ResearchNote[]>(
    () => loadResearch(profileId) ?? RESEARCH_NOTES,
  );
  const [notifications, setNotifications] = useState<AppNotification[]>(
    () => loadNotifications(profileId) ?? SEED_NOTIFICATIONS,
  );
  const [ideas, setIdeas] = useState<Idea[]>(() => loadIdeas(profileId) ?? IDEAS);
  const [meta, setMeta] = useState<DashboardMeta>(() => normalizeMeta(loadMeta(profileId)));
  const [activeNav, setActiveNav] = useState("dashboard");
  const [openBookId, setOpenBookId] = useState<string | null>(null);
  const [openChapterIndex, setOpenChapterIndex] = useState(0);
  const [createRequest, setCreateRequest] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    saveBooks(profileId, books);
  }, [profileId, books]);
  useEffect(() => {
    saveCharacters(profileId, characters);
  }, [profileId, characters]);
  useEffect(() => {
    saveWorld(profileId, worlds);
  }, [profileId, worlds]);
  useEffect(() => {
    savePlot(profileId, plotCards);
  }, [profileId, plotCards]);
  useEffect(() => {
    saveResearch(profileId, notes);
  }, [profileId, notes]);
  useEffect(() => {
    saveNotifications(profileId, notifications);
  }, [profileId, notifications]);
  useEffect(() => {
    saveIdeas(profileId, ideas);
  }, [profileId, ideas]);
  useEffect(() => {
    saveMeta(profileId, meta);
  }, [profileId, meta]);

  // Import characters/world/plot that already exist in stored storyboards (one-time).
  useEffect(() => {
    setCharacters((prev) => {
      const additions = collectMissingCharacters(books, prev);
      return additions.length > 0 ? [...additions, ...prev] : prev;
    });
    setWorlds((prev) => {
      const additions = collectMissingWorld(books, prev);
      return additions.length > 0 ? [...additions, ...prev] : prev;
    });
    setPlotCards((prev) => {
      const additions = collectMissingPlot(books, prev);
      return additions.length > 0 ? [...additions, ...prev] : prev;
    });
    // Runs once for the loaded profile.
  }, []);

  const openBook = (id: string, chapterIndex = 0) => {
    setOpenBookId(id);
    setOpenChapterIndex(chapterIndex);
  };

  const pushNotification = (input: NotificationInput) => {
    setNotifications((prev) => [makeNotification(input), ...prev].slice(0, 50));
  };

  // Auto-events: notify when something is added (refs avoid firing on mount).
  const prevCounts = useRef({
    books: books.length,
    characters: characters.length,
    worlds: worlds.length,
    plot: plotCards.length,
    notes: notes.length,
  });

  useEffect(() => {
    if (books.length > prevCounts.current.books) {
      const latest = books[0];
      pushNotification({
        kind: "book",
        title: "Neues Buch",
        message: latest
          ? `„${latest.title}“ wurde deiner Bibliothek hinzugefügt.`
          : "Ein neues Buch wurde angelegt.",
        view: "library",
        bookId: latest?.id,
      });
    }
    prevCounts.current.books = books.length;
  }, [books]);

  useEffect(() => {
    if (characters.length > prevCounts.current.characters) {
      const latest = characters[0];
      pushNotification({
        kind: "character",
        title: "Neuer Charakter",
        message: latest ? `„${latest.name}“ wurde deiner Welt hinzugefügt.` : "Ein Charakter wurde angelegt.",
        view: "characters",
      });
    }
    prevCounts.current.characters = characters.length;
  }, [characters]);

  useEffect(() => {
    if (worlds.length > prevCounts.current.worlds) {
      const latest = worlds[0];
      pushNotification({
        kind: "world",
        title: "Neuer Welteneintrag",
        message: latest ? `„${latest.title}“ (${latest.category}) wurde ergänzt.` : "Ein Welteneintrag wurde ergänzt.",
        view: "world",
      });
    }
    prevCounts.current.worlds = worlds.length;
  }, [worlds]);

  useEffect(() => {
    if (plotCards.length > prevCounts.current.plot) {
      const latest = plotCards[plotCards.length - 1];
      pushNotification({
        kind: "plot",
        title: "Neue Plot-Karte",
        message: latest ? `„${latest.title}“ wurde dem Board hinzugefügt.` : "Eine Plot-Karte wurde hinzugefügt.",
        view: "plot",
      });
    }
    prevCounts.current.plot = plotCards.length;
  }, [plotCards]);

  useEffect(() => {
    if (notes.length > prevCounts.current.notes) {
      const latest = notes[0];
      pushNotification({
        kind: "research",
        title: "Recherche gespeichert",
        message: latest ? `Notiz „${latest.title}“ wurde abgelegt.` : "Eine Recherche-Notiz wurde gespeichert.",
        view: "research",
      });
    }
    prevCounts.current.notes = notes.length;
  }, [notes]);

  const addBook = (book: Book) => {
    setBooks((prev) => [book, ...prev]);
    setCharacters((prev) => {
      const additions = collectMissingCharacters([book], prev);
      return additions.length > 0 ? [...additions, ...prev] : prev;
    });
    setWorlds((prev) => {
      const additions = collectMissingWorld([book], prev);
      return additions.length > 0 ? [...additions, ...prev] : prev;
    });
    setPlotCards((prev) => {
      const additions = collectMissingPlot([book], prev);
      return additions.length > 0 ? [...additions, ...prev] : prev;
    });
    openBook(book.id, 0);
  };

  const addCharacter = (character: Character) =>
    setCharacters((prev) => [character, ...prev]);

  const deleteBook = (id: string) => {
    const target = books.find((book) => book.id === id);
    setBooks((prev) => prev.filter((book) => book.id !== id));
    setOpenBookId((prev) => (prev === id ? null : prev));
    if (target?.coverUrl) {
      void releaseCoverImage(target.coverUrl, {
        ignoreRef: { profileId, bookId: id },
      });
    }
  };

  const deleteCharacter = (id: string) =>
    setCharacters((prev) => prev.filter((character) => character.id !== id));

  const deleteIdea = (id: string) => setIdeas((prev) => prev.filter((idea) => idea.id !== id));
  const clearIdeas = () => setIdeas([]);
  const clearActivity = () => setNotifications([]);
  const addWords = (amount: number) => setMeta((prev) => recordWords(prev, amount));
  const resetWords = () => setMeta((prev) => ({ ...prev, todayWords: 0 }));
  const resetStats = () => setMeta(emptyMetaToday());

  const updateBook = (updated: Book) => {
    const previous = books.find((book) => book.id === updated.id);
    setBooks((prev) => prev.map((book) => (book.id === updated.id ? updated : book)));
    if (previous?.coverUrl && previous.coverUrl !== updated.coverUrl) {
      void releaseCoverImage(previous.coverUrl, {
        ignoreRef: { profileId, bookId: updated.id },
      });
    }
  };

  const startCreate = () => {
    setOpenBookId(null);
    setActiveNav("dashboard");
    setCreateRequest((prev) => prev + 1);
  };

  const activateNotification = (notification: AppNotification) => {
    setNotifications((prev) =>
      prev.map((item) => (item.id === notification.id ? { ...item, read: true } : item)),
    );
    if (notification.bookId && books.some((book) => book.id === notification.bookId)) {
      openBook(notification.bookId, 0);
      return;
    }
    if (notification.view) {
      setOpenBookId(null);
      setActiveNav(notification.view);
    }
  };

  const openedBook = openBookId ? books.find((book) => book.id === openBookId) : undefined;
  const unread = notifications.filter((item) => !item.read).length;

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unread,
        push: pushNotification,
        markRead: (id) =>
          setNotifications((prev) =>
            prev.map((item) => (item.id === id ? { ...item, read: true } : item)),
          ),
        markAllRead: () =>
          setNotifications((prev) => prev.map((item) => ({ ...item, read: true }))),
        clear: () => setNotifications([]),
        activate: activateNotification,
      }}
    >
      <div className="relative min-h-screen">
        <div className="mx-auto flex max-w-[1600px] gap-6 px-3 py-4 lg:px-6 lg:py-6">
          <Sidebar
            active={openedBook ? "library" : activeNav}
            onSelect={(id) => {
              setOpenBookId(null);
              setActiveNav(id);
            }}
            onOpenSettings={() => setSettingsOpen(true)}
            profileName={profileName}
            onSwitchProfile={onSwitchProfile}
            characterCount={characters.length}
          />

          <main className="min-w-0 flex-1">
            {openedBook ? (
              <BookDetailView
                key={`${openedBook.id}-${openChapterIndex}`}
                book={openedBook}
                characters={characters}
                initialChapterIndex={openChapterIndex}
                onBack={() => setOpenBookId(null)}
                onUpdate={updateBook}
                onDelete={deleteBook}
                onWordsWritten={addWords}
              />
            ) : activeNav === "library" ? (
              <LibraryView
                books={books}
                onOpenBook={(id) => openBook(id)}
                onDeleteBook={deleteBook}
                onCreate={startCreate}
              />
            ) : activeNav === "chapters" ? (
              <ChaptersView books={books} onOpenChapter={(id, index) => openBook(id, index)} />
            ) : activeNav === "characters" ? (
              <CharactersView
                books={books}
                characters={characters}
                onAddCharacter={addCharacter}
                onUpdateCharacter={(character) =>
                  setCharacters((prev) =>
                    prev.map((item) => (item.id === character.id ? character : item)),
                  )
                }
                onDeleteCharacter={deleteCharacter}
              />
            ) : activeNav === "world" ? (
            <WorldView
              entries={worlds}
              books={books}
              onCreate={(entry) => setWorlds((prev) => [entry, ...prev])}
              onCreateMany={(list) => setWorlds((prev) => [...list, ...prev])}
              onUpdate={(entry) =>
                setWorlds((prev) => prev.map((item) => (item.id === entry.id ? entry : item)))
              }
              onDelete={(id) => setWorlds((prev) => prev.filter((item) => item.id !== id))}
            />
            ) : activeNav === "plot" ? (
              <PlotBoardView
                cards={plotCards}
                books={books}
                onCreate={(card) => setPlotCards((prev) => [...prev, card])}
                onUpdate={(card) =>
                  setPlotCards((prev) => prev.map((item) => (item.id === card.id ? card : item)))
                }
                onDelete={(id) => setPlotCards((prev) => prev.filter((item) => item.id !== id))}
              />
            ) : activeNav === "research" ? (
              <ResearchView
                notes={notes}
                books={books}
                onCreate={(note) => setNotes((prev) => [note, ...prev])}
                onDelete={(id) => setNotes((prev) => prev.filter((item) => item.id !== id))}
              />
            ) : activeNav === "stats" ? (
              <StatsView
                books={books}
                characters={characters}
                worlds={worlds}
                plotCards={plotCards}
                notes={notes}
                weeklyWords={meta.weeklyWords}
                onResetStats={resetStats}
              />
            ) : (
              <DashboardView
                books={books}
                onAddBook={addBook}
                onOpenBook={(id) => openBook(id)}
                onDeleteBook={deleteBook}
                createRequest={createRequest}
                notifications={notifications}
                onClearActivity={clearActivity}
                ideas={ideas}
                onDeleteIdea={deleteIdea}
                onClearIdeas={clearIdeas}
                todayWords={meta.todayWords}
                goal={meta.goal}
                onAddWords={addWords}
                onResetWords={resetWords}
                onWordsWritten={addWords}
                weeklyWords={meta.weeklyWords}
                streakCurrent={meta.streakCurrent}
                streakBest={meta.streakBest}
                profileName={profileName}
              />
            )}
          </main>
        </div>

        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    </NotificationsContext.Provider>
  );
}

export default Dashboard;
