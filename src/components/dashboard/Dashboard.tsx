import { useEffect, useRef, useState } from "react";

import { BOOKS, IDEAS } from "@/data/author";
import type { Book, DashboardMeta, Idea } from "@/data/author";
import { CHARACTERS, makeCharacter } from "@/data/characters";
import type { Character } from "@/data/characters";
import { CONTINUITY_FACTS, CONTINUITY_RELATIONS } from "@/data/continuity";
import type { CanonFact, CharacterRelation } from "@/data/continuity";
import type { CoverTextLayer, SavedCoverPreset } from "@/data/cover";
import { presetFromLayers } from "@/data/cover";
import { PLOT_CARDS } from "@/data/plot";
import type { PlotCard, PlotStatus } from "@/data/plot";
import { RESEARCH_NOTES } from "@/data/research";
import type { ResearchNote } from "@/data/research";
import { SERIES, addVolumeToSeries, removeBookFromSeries } from "@/data/series";
import type { Series } from "@/data/series";
import { WORLD_ENTRIES, entriesFromStoryWorld } from "@/data/world";
import type { WorldEntry } from "@/data/world";
import {
  loadBooks,
  loadCharacters,
  loadCoverPresets,
  loadFacts,
  loadIdeas,
  loadMeta,
  loadNotifications,
  loadPlot,
  loadRelations,
  loadResearch,
  loadSeries,
  loadWorld,
  saveBooks,
  saveCharacters,
  saveCoverPresets,
  saveFacts,
  saveIdeas,
  saveMeta,
  saveNotifications,
  savePlot,
  saveRelations,
  saveResearch,
  saveSeries,
  saveWorld,
} from "@/lib/persistence";
import { releaseCoverImage } from "@/lib/coverStore";
import { createBackup, parseBackup } from "@/lib/backup";
import type { ProfileBackup } from "@/lib/backup";
import { emptyMetaToday, normalizeMeta, recordWords } from "@/lib/streak";
import { findMatchingEntry } from "@/lib/worldMatch";
import { findMatchingCharacter } from "@/lib/characterMatch";
import {
  makeNotification,
  NotificationsContext,
  SEED_NOTIFICATIONS,
} from "@/lib/notifications";
import type { AppNotification, NotificationInput } from "@/lib/notifications";

import { BookDetailView } from "./BookDetailView";
import { ChaptersView } from "./ChaptersView";
import { CharactersView } from "./CharactersView";
import { ContinuityView } from "./ContinuityView";
import { DashboardView } from "./DashboardView";
import { JobCenter } from "./JobCenter";
import { LibraryView } from "./LibraryView";
import { PlotBoardView } from "./PlotBoardView";
import { ResearchView } from "./ResearchView";
import { SettingsDialog } from "./SettingsDialog";
import { Sidebar } from "./Sidebar";
import { StatsView } from "./StatsView";
import { WorldView } from "./WorldView";

/** Characters that exist in a book's storyboard but are not yet in the character list. */
function collectMissingCharacters(source: Book[], existing: Character[]): Character[] {
  const additions: Character[] = [];

  /** Überspringt, was es (fast) schon gibt: „Prinzessin Lysara" ≠ „Lysara" nur auf dem Papier. */
  const push = (character: Character) => {
    if (findMatchingCharacter(character, existing) || findMatchingCharacter(character, additions)) {
      return;
    }
    additions.push(character);
  };

  for (const book of source) {
    for (const entry of book.storyboard?.characters ?? []) {
      const name = entry.name.trim();
      if (!name) continue;

      const description = entry.description.trim();
      const role = entry.role.trim();
      push(
        makeCharacter(
          {
            name,
            role,
            description,
            bookId: book.id,
            tags: ["Storyboard"],
          },
          additions.length,
        ),
      );
    }
  }

  return additions;
}

/** World locations that exist in a book's storyboard but are not yet in the world list. */
function collectMissingWorld(source: Book[], existing: WorldEntry[]): WorldEntry[] {
  const additions: WorldEntry[] = [];

  const push = (entry: WorldEntry) => {
    if (findMatchingEntry(entry, existing) || findMatchingEntry(entry, additions)) return;
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
  onImportProfile,
}: {
  profileId: string;
  profileName: string;
  onSwitchProfile: () => void;
  onImportProfile?: (backup: ProfileBackup) => void;
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
  const [coverPresets, setCoverPresets] = useState<SavedCoverPreset[]>(
    () => loadCoverPresets(profileId) ?? [],
  );
  const [facts, setFacts] = useState<CanonFact[]>(
    () => loadFacts(profileId) ?? CONTINUITY_FACTS,
  );
  const [relations, setRelations] = useState<CharacterRelation[]>(
    () => loadRelations(profileId) ?? CONTINUITY_RELATIONS,
  );
  const [series, setSeries] = useState<Series[]>(() => loadSeries(profileId) ?? SERIES);
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
    saveCoverPresets(profileId, coverPresets);
  }, [profileId, coverPresets]);
  useEffect(() => {
    saveFacts(profileId, facts);
  }, [profileId, facts]);
  useEffect(() => {
    saveRelations(profileId, relations);
  }, [profileId, relations]);
  useEffect(() => {
    saveSeries(profileId, series);
  }, [profileId, series]);
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

  const addBook = (book: Book, seriesId?: string) => {
    setBooks((prev) => [book, ...prev]);
    // Neuen Band direkt an die gewählte Reihe hängen (er wird der nächste Band).
    if (seriesId) setSeries((prev) => addVolumeToSeries(prev, seriesId, book.id));
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
    // Buch aus allen Reihen nehmen (die Reihe selbst bleibt bestehen).
    setSeries((prev) => removeBookFromSeries(prev, id));
    if (target?.coverUrl) {
      void releaseCoverImage(target.coverUrl, {
        ignoreRef: { profileId, bookId: id },
      });
    }
  };

  const deleteCharacter = (id: string) => {
    setCharacters((prev) => prev.filter((character) => character.id !== id));
    // Kanon mit aufräumen: Fakten der Figur und Beziehungen mit ihr entfernen.
    setFacts((prev) => prev.filter((fact) => fact.entityId !== id));
    setRelations((prev) =>
      prev.filter((relation) => relation.fromId !== id && relation.toId !== id),
    );
  };

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

  /* ── Projekt-Backup (Export/Import) ─────────────────────────────────── */

  const handleExportBackup = () => {
    const backup = createBackup(profileName, {
      books,
      characters,
      world: worlds,
      plot: plotCards,
      research: notes,
      ideas,
      notifications,
      facts,
      relations,
      series,
      meta,
    });

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const name = profileName.replace(/[^\p{L}\p{N}\-_ ]+/gu, "").trim() || "profil";
    anchor.href = url;
    anchor.download = `authorai-backup-${name}-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = async (file: File) => {
    try {
      const parsed = parseBackup(await file.text());
      const confirmed = window.confirm(
        `Backup „${parsed.profileName}“ importieren?\n\n` +
          `Achtung: ersetzt die Daten dieses Profils.\n\n` +
          `${parsed.books.length} Bücher · ${parsed.characters.length} Charaktere · ` +
          `${parsed.world.length} Welteneinträge · ${parsed.plot.length} Plot-Karten · ` +
          `${parsed.research.length} Recherchenotizen · ${parsed.facts.length} Fakten · ` +
          `${parsed.relations.length} Beziehungen · ${parsed.series.length} Reihen`,
      );
      if (!confirmed) return;

      // Cover der ersetzten Bücher freigeben, sofern sie nirgends mehr referenziert werden.
      for (const previous of books) {
        if (previous.coverUrl) {
          void releaseCoverImage(previous.coverUrl, { ignoreProfile: profileId });
        }
      }

      setBooks(parsed.books);
      setCharacters(parsed.characters);
      setWorlds(parsed.world);
      setPlotCards(parsed.plot);
      setNotes(parsed.research);
      setIdeas(parsed.ideas);
      setNotifications(parsed.notifications);
      setFacts(parsed.facts);
      setRelations(parsed.relations);
      setSeries(parsed.series);
      setMeta(normalizeMeta(parsed.meta ?? null));
      setOpenBookId(null);
      setActiveNav("dashboard");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Import fehlgeschlagen.");
    }
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

  const handleImportBackupAsProfile = async (file: File) => {
    try {
      const parsed = parseBackup(await file.text());
      if (!onImportProfile) {
        window.alert("Import als neues Profil ist in dieser Umgebung nicht verfügbar.");
        return;
      }
      onImportProfile(parsed);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Import fehlgeschlagen.");
    }
  };

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
        {/* Hintergrund-Jobs: sichtbar, auch wenn der auslösende Dialog zu ist. */}
        <div className="pointer-events-none fixed bottom-6 right-6 z-[65] w-80 print:hidden">
          <JobCenter />
        </div>

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
              facts={facts}
              relations={relations}
              worlds={worlds}
              series={series}
              onSeriesChange={setSeries}
              books={books}
              authorName={profileName}
              coverPresets={coverPresets}
              onSaveCoverPreset={(label, layers) =>
                setCoverPresets((prev) => [
                  presetFromLayers(layers, `preset-${Date.now().toString(36)}`, label),
                  ...prev,
                ])
              }
              initialChapterIndex={openChapterIndex}
              onBack={() => setOpenBookId(null)}
              onUpdate={updateBook}
              onDelete={deleteBook}
              onWordsWritten={addWords}
            />
            ) : activeNav === "library" ? (
              <LibraryView
                books={books}
                series={series}
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
                facts={facts}
                relations={relations}
                onFactsChange={setFacts}
                onRelationsChange={setRelations}
                onAddCharacter={addCharacter}
                onAddCharacters={(list) => setCharacters((prev) => [...list, ...prev])}
                onDeleteCharacters={(ids) => {
                  const drop = new Set(ids);
                  setCharacters((prev) => prev.filter((item) => !drop.has(item.id)));
                  setFacts((prev) => prev.filter((fact) => !drop.has(fact.entityId)));
                  setRelations((prev) =>
                    prev.filter(
                      (relation) => !drop.has(relation.fromId) && !drop.has(relation.toId),
                    ),
                  );
                }}
                onUpdateCharacter={(character) =>
                  setCharacters((prev) =>
                    prev.map((item) => (item.id === character.id ? character : item)),
                  )
                }
                onDeleteCharacter={deleteCharacter}
              />
            ) : activeNav === "continuity" ? (
              <ContinuityView
                books={books}
                characters={characters}
                worlds={worlds}
                facts={facts}
                relations={relations}
                series={series}
                onFactsChange={setFacts}
                onRelationsChange={setRelations}
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
              onDelete={(id) => {
                setWorlds((prev) => prev.filter((item) => item.id !== id));
                // Fakten zu diesem Welteneintrag mit entfernen.
                setFacts((prev) => prev.filter((fact) => fact.entityId !== id));
              }}
              onDeleteMany={(ids) => {
                const drop = new Set(ids);
                setWorlds((prev) => prev.filter((item) => !drop.has(item.id)));
                setFacts((prev) => prev.filter((fact) => !drop.has(fact.entityId)));
              }}
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
                series={series}
                characters={characters}
                worlds={worlds}
                facts={facts}
                relations={relations}
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

        <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onExportBackup={handleExportBackup}
        onImportBackup={(file) => void handleImportBackup(file)}
        onImportBackupAsProfile={(file) => void handleImportBackupAsProfile(file)}
      />
      </div>
    </NotificationsContext.Provider>
  );
}

export default Dashboard;
