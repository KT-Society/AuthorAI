import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Layers, Plus, Trash2, X } from "lucide-react";

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
import type { Series } from "@/data/series";
import {
  addableSeries,
  availableVolumes,
  newSeriesId,
  seriesOfBook,
} from "@/data/series";
import { showToast } from "@/lib/toast";

import { Badge, Panel } from "./primitives";

/**
 * Serien-Verwaltung für ein Buch.
 *
 * Eine Reihe ist die einzige Quelle der Wahrheit: sie hält die Band-IDs in Lesereihenfolge.
 * Fakten und Beziehungen der ganzen Reihe gelten als gemeinsamer Kanon (gemeinsame Welt und
 * Figuren-Historie über die Bände).
 */
export function SeriesDialog({
  open,
  book,
  series,
  books,
  onSeriesChange,
  onClose,
}: {
  open: boolean;
  book: Book;
  series: Series[];
  books: Book[];
  onSeriesChange: (series: Series[]) => void;
  onClose: () => void;
}) {
  const current = seriesOfBook(series, book.id);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [attachTo, setAttachTo] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(current?.name ?? "");
    setDescription(current?.description ?? "");
    setAttachTo("");
  }, [open, current?.id, current?.name, current?.description]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const titleOf = (id: string) => books.find((entry) => entry.id === id)?.title ?? "(gelöscht)";

  const patchSeries = (id: string, patch: Partial<Series>) =>
    onSeriesChange(series.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));

  const createSeries = () => {
    const clean = name.trim();
    if (!clean) return;
    const entry: Series = {
      id: newSeriesId(),
      name: clean,
      description: description.trim() || undefined,
      volumeIds: [book.id],
      createdAt: new Date().toISOString(),
    };
    onSeriesChange([...series, entry]);
    showToast(`Reihe „${clean}" angelegt — Band 1`);
  };

  const attach = () => {
    const target = series.find((entry) => entry.id === attachTo);
    if (!target) return;
    patchSeries(target.id, { volumeIds: [...target.volumeIds, book.id] });
    showToast(`Band ${target.volumeIds.length + 1} in „${target.name}"`);
  };

  const move = (seriesId: string, bookId: string, direction: -1 | 1) => {
    const target = series.find((entry) => entry.id === seriesId);
    if (!target) return;
    const index = target.volumeIds.indexOf(bookId);
    const next = index + direction;
    if (index === -1 || next < 0 || next >= target.volumeIds.length) return;
    const volumeIds = [...target.volumeIds];
    const [moved] = volumeIds.splice(index, 1);
    volumeIds.splice(next, 0, moved ?? bookId);
    patchSeries(seriesId, { volumeIds });
  };

  const detach = (seriesId: string, bookId: string) => {
    const target = series.find((entry) => entry.id === seriesId);
    if (!target) return;
    patchSeries(seriesId, { volumeIds: target.volumeIds.filter((id) => id !== bookId) });
    showToast(`Aus „${target.name}" entfernt`);
  };

  const dissolve = (seriesId: string) => {
    const target = series.find((entry) => entry.id === seriesId);
    if (!target) return;
    if (!window.confirm(`Reihe „${target.name}" auflösen? Die Bücher bleiben erhalten.`)) return;
    onSeriesChange(series.filter((entry) => entry.id !== seriesId));
    showToast("Reihe aufgelöst — Bücher bleiben erhalten");
  };

  const candidates = current
    ? availableVolumes(series, books.map((entry) => entry.id)).filter((id) => id !== book.id)
    : [];
  const options = addableSeries(series, book.id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-strong float-in flex max-h-[86vh] w-full max-w-xl flex-col rounded-2xl p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-violet text-white">
              <Layers className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Reihe</h2>
              <p className="text-xs text-muted-foreground">
                {current
                  ? `„${current.name}" · ${current.volumeIds.length} Band/Bände`
                  : "Mehrere Bände mit gemeinsamer Welt, Figuren-Historie und Kanon."}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-lg text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
          {current ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Name der Reihe
                  </label>
                  <Input
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      patchSeries(current.id, { name: event.target.value });
                    }}
                    onBlur={() => {
                      if (name.trim().length === 0) patchSeries(current.id, { name: "Unbenannte Reihe" });
                    }}
                    className="glass h-10 rounded-xl border-white/10"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Beschreibung (optional)
                  </label>
                  <Input
                    value={description}
                    onChange={(event) => {
                      setDescription(event.target.value);
                      patchSeries(current.id, { description: event.target.value || undefined });
                    }}
                    placeholder="Roter Faden über die Bände …"
                    className="glass h-10 rounded-xl border-white/10"
                  />
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  Bände in Lesereihenfolge
                </p>
                <div className="space-y-1.5">
                  {current.volumeIds.map((id, index) => {
                    const isThis = id === book.id;
                    return (
                      <div
                        key={id}
                        className={cn(
                          "flex items-center gap-2 rounded-xl border px-3 py-2",
                          isThis
                            ? "border-brand-violet/40 bg-brand-violet/10"
                            : "border-white/10 bg-white/5",
                        )}
                      >
                        <Badge tone={isThis ? "violet" : "indigo"}>Band {index + 1}</Badge>
                        <span className="min-w-0 flex-1 truncate text-sm">{titleOf(id)}</span>
                        {isThis ? (
                          <span className="shrink-0 text-[10px] uppercase tracking-wide text-brand-violet">
                            dieses Buch
                          </span>
                        ) : null}
                        <button
                          type="button"
                          title="Nach oben"
                          disabled={index === 0}
                          onClick={() => move(current.id, id, -1)}
                          className="shrink-0 rounded-lg border border-white/10 p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                        >
                          <ArrowUp className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Nach unten"
                          disabled={index === current.volumeIds.length - 1}
                          onClick={() => move(current.id, id, 1)}
                          className="shrink-0 rounded-lg border border-white/10 p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                        >
                          <ArrowDown className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          title={isThis ? "Aus der Reihe entfernen" : "Band entfernen"}
                          onClick={() => detach(current.id, id)}
                          className="shrink-0 rounded-lg border border-white/10 p-1.5 text-muted-foreground transition-colors hover:text-brand-rose"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Select value={attachTo} onValueChange={setAttachTo}>
                  <SelectTrigger size="sm" className="glass h-9 w-56 border-white/10 text-xs">
                    <SelectValue placeholder="Band hinzufügen …" />
                  </SelectTrigger>
                  <SelectContent className="glass-strong border-white/10">
                    {candidates.length === 0 ? (
                      <SelectItem value="__none" disabled>
                        Kein freies Buch verfügbar
                      </SelectItem>
                    ) : (
                      candidates.map((id) => (
                        <SelectItem key={id} value={id}>
                          {titleOf(id)}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  className="glass h-9 rounded-lg border-white/10"
                  disabled={!attachTo}
                  onClick={() => {
                    patchSeries(current.id, { volumeIds: [...current.volumeIds, attachTo] });
                    showToast("Band hinzugefügt");
                    setAttachTo("");
                  }}
                >
                  <Plus className="size-3.5" />
                  Band
                </Button>
              </div>

              <Panel className="flex items-start justify-between gap-3 p-3">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Alle Bände teilen sich <strong>Weltenbau, Fakten und Beziehungen</strong> —
                  Prüf-Pässe bekommen den Kanon der ganzen Reihe. Figuren mit gleichem Namen
                  gelten über die Bände hinweg als dieselbe Figur.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="glass shrink-0 rounded-lg border-white/10 text-brand-rose"
                  onClick={() => dissolve(current.id)}
                >
                  <Trash2 className="size-3.5" />
                  Auflösen
                </Button>
              </Panel>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Neue Reihe
                  </label>
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="z. B. Die Aschenchronik"
                    className="glass h-10 rounded-xl border-white/10"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Beschreibung (optional)
                  </label>
                  <Input
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Roter Faden über die Bände …"
                    className="glass h-10 rounded-xl border-white/10"
                  />
                </div>
              </div>

              <Button
                onClick={createSeries}
                disabled={name.trim().length === 0}
                className="rounded-xl bg-gradient-to-r from-brand-indigo to-brand-violet px-5 font-semibold text-white disabled:opacity-50"
              >
                <Plus className="size-4" />
                Reihe anlegen — dieses Buch wird Band 1
              </Button>

              {options.length > 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">
                    … oder einer bestehenden Reihe beitreten
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={attachTo} onValueChange={setAttachTo}>
                      <SelectTrigger size="sm" className="glass h-9 w-56 border-white/10 text-xs">
                        <SelectValue placeholder="Reihe wählen" />
                      </SelectTrigger>
                      <SelectContent className="glass-strong border-white/10">
                        {options.map((entry) => (
                          <SelectItem key={entry.id} value={entry.id}>
                            {entry.name} ({entry.volumeIds.length})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      className="glass h-9 rounded-lg border-white/10"
                      disabled={!attachTo}
                      onClick={attach}
                    >
                      Beitreten
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-white/10 pt-5">
          <Button
            variant="ghost"
            className="rounded-xl text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            Fertig
          </Button>
        </div>
      </div>
    </div>
  );
}
