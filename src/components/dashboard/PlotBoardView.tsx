import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, GitBranch, Pencil, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { Book } from "@/data/author";
import { PLOT_ACTS, PLOT_STATUSES, PLOT_STATUS_LABELS } from "@/data/plot";
import type { PlotCard, PlotStatus } from "@/data/plot";

import { Badge, EmptyState, Panel, ViewHeader } from "./primitives";
import type { Tone } from "./primitives";

const STATUS_TONE: Record<PlotStatus, Tone> = {
  idea: "amber",
  planned: "cyan",
  written: "emerald",
};

export function PlotBoardView({
  cards,
  books,
  onCreate,
  onUpdate,
  onDelete,
}: {
  cards: PlotCard[];
  books: Book[];
  onCreate: (card: PlotCard) => void;
  onUpdate: (card: PlotCard) => void;
  onDelete: (id: string) => void;
}) {
  const [bookFilter, setBookFilter] = useState<string>(books[0]?.id ?? "all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [act, setAct] = useState(PLOT_ACTS[0] ?? "Akt I");
  const [status, setStatus] = useState<PlotStatus>("idea");
  const [dialogBookId, setDialogBookId] = useState(books[0]?.id ?? "");

  const bookTitle = (id: string) => books.find((book) => book.id === id)?.title ?? "";

  const visible = useMemo(
    () => cards.filter((card) => bookFilter === "all" || card.bookId === bookFilter),
    [cards, bookFilter],
  );

  const openNew = (initialStatus: PlotStatus) => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setAct(PLOT_ACTS[0] ?? "Akt I");
    setStatus(initialStatus);
    setDialogBookId(bookFilter === "all" ? (books[0]?.id ?? "") : bookFilter);
    setDialogOpen(true);
  };

  const openEdit = (card: PlotCard) => {
    setEditingId(card.id);
    setTitle(card.title);
    setDescription(card.description);
    setAct(card.act);
    setStatus(card.status);
    setDialogBookId(card.bookId);
    setDialogOpen(true);
  };

  const submit = () => {
    if (!title.trim() || !dialogBookId) return;
    const payload: PlotCard = {
      id: editingId ?? `plot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      bookId: dialogBookId,
      title: title.trim(),
      description: description.trim(),
      act,
      status,
      order: editingId ? cards.find((card) => card.id === editingId)?.order ?? 0 : visible.length,
    };
    if (editingId) onUpdate(payload);
    else onCreate(payload);
    setDialogOpen(false);
  };

  const moveStatus = (card: PlotCard, direction: -1 | 1) => {
    const index = PLOT_STATUSES.indexOf(card.status);
    const next = PLOT_STATUSES[index + direction];
    if (!next) return;
    onUpdate({ ...card, status: next });
  };

  return (
    <div>
      <ViewHeader
        eyebrow="Plot-Board"
        title="Plot-Board"
        subtitle="Story-Beats nach Akt und Status planen"
        actions={
          <>
            <Select value={bookFilter} onValueChange={setBookFilter}>
              <SelectTrigger size="sm" className="glass w-56 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="glass-strong border-white/10">
                <SelectItem value="all">Alle Projekte</SelectItem>
                {books.map((book) => (
                  <SelectItem key={book.id} value={book.id}>
                    {book.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => openNew("idea")}
              className="h-10 rounded-xl bg-gradient-to-r from-brand-violet to-brand-indigo px-4 font-semibold text-white shadow-[0_0_30px_-10px_hsl(258_90%_66%/0.95)]"
            >
              <Plus className="size-4" />
              Neue Karte
            </Button>
          </>
        }
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={<GitBranch className="size-6" />}
          title="Keine Plot-Karten"
          description="Lege Beats an und sortiere sie über die Spalten nach Fortschritt."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {PLOT_STATUSES.map((columnStatus) => {
            const columnCards = visible
              .filter((card) => card.status === columnStatus)
              .sort((a, b) => a.order - b.order);
            return (
              <Panel key={columnStatus} className="flex flex-col p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold">
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        columnStatus === "idea"
                          ? "bg-brand-amber"
                          : columnStatus === "planned"
                            ? "bg-brand-cyan"
                            : "bg-brand-emerald",
                      )}
                    />
                    {PLOT_STATUS_LABELS[columnStatus]}
                    <span className="rounded-full bg-white/10 px-1.5 text-[10px]">
                      {columnCards.length}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => openNew(columnStatus)}
                    className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                    title="Karte hinzufügen"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>

                <div className="space-y-2">
                  {columnCards.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-[11px] text-muted-foreground">
                      leer
                    </p>
                  ) : (
                    columnCards.map((card) => (
                      <div
                        key={card.id}
                        className="group rounded-xl border border-white/10 bg-white/5 p-3 transition-colors hover:border-white/20"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold leading-snug">{card.title}</p>
                          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => openEdit(card)}
                              className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDelete(card.id)}
                              className="rounded p-1 text-muted-foreground transition-colors hover:text-brand-rose"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>

                        {card.description ? (
                          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                            {card.description}
                          </p>
                        ) : null}

                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <Badge tone={STATUS_TONE[card.status]}>{card.act}</Badge>
                            {bookFilter === "all" ? (
                              <span className="truncate text-[10px] text-muted-foreground">
                                {bookTitle(card.bookId)}
                              </span>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => moveStatus(card, -1)}
                              disabled={card.status === PLOT_STATUSES[0]}
                              className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                            >
                              <ArrowLeft className="size-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveStatus(card, 1)}
                              disabled={card.status === PLOT_STATUSES[PLOT_STATUSES.length - 1]}
                              className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                            >
                              <ArrowRight className="size-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {dialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setDialogOpen(false)}
        >
          <div
            className="glass-strong float-in w-full max-w-lg rounded-2xl p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-violet to-brand-cyan text-white">
                  <GitBranch className="size-5" />
                </span>
                <h2 className="text-lg font-semibold tracking-tight">
                  {editingId ? "Karte bearbeiten" : "Neue Plot-Karte"}
                </h2>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-lg text-muted-foreground hover:text-foreground"
                onClick={() => setDialogOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Titel</label>
                <Input
                  autoFocus
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="glass h-10 rounded-xl border-white/10"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Projekt
                  </label>
                  <Select value={dialogBookId} onValueChange={setDialogBookId}>
                    <SelectTrigger className="glass h-10 w-full rounded-xl border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-strong border-white/10">
                      {books.map((book) => (
                        <SelectItem key={book.id} value={book.id}>
                          {book.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Akt</label>
                  <Select value={act} onValueChange={setAct}>
                    <SelectTrigger className="glass h-10 w-full rounded-xl border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-strong border-white/10">
                      {PLOT_ACTS.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Status
                  </label>
                  <Select value={status} onValueChange={(value) => setStatus(value as PlotStatus)}>
                    <SelectTrigger className="glass h-10 w-full rounded-xl border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-strong border-white/10">
                      {PLOT_STATUSES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {PLOT_STATUS_LABELS[item]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Beschreibung
                </label>
                <Textarea
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="glass rounded-xl border-white/10 text-sm"
                />
              </div>
            </div>

            <div className="mt-7 flex justify-end gap-3">
              <Button
                variant="ghost"
                className="rounded-xl text-muted-foreground hover:text-foreground"
                onClick={() => setDialogOpen(false)}
              >
                Abbrechen
              </Button>
              <Button
                onClick={submit}
                disabled={title.trim().length === 0 || !dialogBookId}
                className="rounded-xl bg-gradient-to-r from-brand-violet to-brand-indigo px-5 font-semibold text-white disabled:opacity-50"
              >
                Speichern
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
