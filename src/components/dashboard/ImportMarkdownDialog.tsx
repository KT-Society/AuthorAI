import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Book } from "@/data/author";
import { buildImportedBook, parseManuscriptMarkdown } from "@/lib/markdownImport";
import { cn } from "@/lib/utils";

import { Badge } from "./primitives";

/** Dateiname → Titel-Ersatz („mein_roman.md" → „mein roman"). */
function titleFromFileName(fileName: string): string {
  return (
    fileName
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[_-]+/g, " ")
      .trim() || ""
  );
}

/**
 * Import eines vorhandenen Manuskripts (Markdown oder reiner Text).
 *
 * Der Dialog liest die Datei **im Browser** (nichts wird hochgeladen), zeigt vor dem Anlegen eine
 * Vorschau — erkannte Kapitel, Wortzahlen, Hinweise — und erlaubt Korrekturen an Titel, Untertitel
 * und Genre. Erst „Importieren" baut das Buch; ab da ist es ein ganz normales Projekt: bearbeiten,
 * prüfen lassen, Kanon/Figuren/Weltenbau daraus ableiten.
 */
export function ImportMarkdownDialog({
  open,
  paletteIndex = 0,
  onClose,
  onImport,
}: {
  open: boolean;
  /** Für die Cover-Farbwahl (z. B. Anzahl vorhandener Bücher). */
  paletteIndex?: number;
  onClose: () => void;
  onImport: (book: Book) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [raw, setRaw] = useState("");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [genre, setGenre] = useState("");
  const [deriveScenes, setDeriveScenes] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Beim Öffnen frisch starten — ein halb geladener Import soll nicht hängen bleiben.
  useEffect(() => {
    if (!open) return;
    setFileName("");
    setRaw("");
    setTitle("");
    setSubtitle("");
    setGenre("");
    setDeriveScenes(true);
    setError(null);
  }, [open]);

  const parsed = useMemo(
    () => (raw.trim() ? parseManuscriptMarkdown(raw, { fallbackTitle: titleFromFileName(fileName) }) : null),
    [raw, fileName],
  );

  // Erkannte Metadaten in die editierbaren Felder übernehmen (neue Datei = neuer Vorschlag).
  useEffect(() => {
    if (!parsed) return;
    setTitle(parsed.title);
    setSubtitle(parsed.subtitle);
    setGenre(parsed.genre);
  }, [parsed]);

  if (!open) return null;

  const totalWords = parsed?.chapters.reduce((sum, chapter) => sum + chapter.words, 0) ?? 0;
  const sceneCount = parsed?.chapters.reduce((sum, chapter) => sum + chapter.scenes.length, 0) ?? 0;

  const loadFile = async (file: File) => {
    setError(null);
    setReading(true);
    try {
      const text = await file.text();
      if (!text.trim()) {
        setError("Die Datei ist leer.");
        return;
      }
      setFileName(file.name);
      setRaw(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Datei konnte nicht gelesen werden.");
    } finally {
      setReading(false);
    }
  };

  const handleImport = () => {
    if (!parsed) return;
    const book = buildImportedBook(
      { ...parsed, title: title.trim() || parsed.title, subtitle, genre },
      { deriveScenes, paletteIndex },
    );
    onImport(book);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="glass-strong float-in flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-cyan to-brand-indigo text-white">
              <Upload className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Manuskript importieren</h2>
              <p className="text-xs text-muted-foreground">
                Markdown oder Text · Kapitel werden aus Überschriften gelesen (nichts wird hochgeladen)
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

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {/* Datei */}
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void loadFile(file);
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-5 text-center transition-colors",
              dragActive ? "border-brand-cyan/60 bg-brand-cyan/10" : "border-white/15 bg-white/5",
            )}
          >
            {reading ? (
              <Loader2 className="size-5 animate-spin text-brand-cyan" />
            ) : (
              <FileText className="size-5 text-muted-foreground" />
            )}
            <p className="text-sm">
              {fileName ? (
                <>
                  <span className="font-semibold">{fileName}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {raw.length.toLocaleString("de-DE")} Zeichen
                  </span>
                </>
              ) : (
                "Markdown-Datei hierher ziehen"
              )}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="outline"
                className="glass rounded-lg border-white/10"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="size-3.5" />
                Datei wählen
              </Button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground">
                <input
                  type="checkbox"
                  checked={deriveScenes}
                  onChange={(event) => setDeriveScenes(event.target.checked)}
                  className="size-3.5 accent-brand-cyan"
                />
                Szenen aus Szenentrennern ableiten
              </label>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void loadFile(file);
                event.target.value = "";
              }}
            />
          </div>

          {/* Alternativ: einfügen */}
          <details className="rounded-xl border border-white/10 bg-white/5 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
              Oder Text direkt einfügen
            </summary>
            <Textarea
              value={raw}
              onChange={(event) => {
                setFileName("");
                setRaw(event.target.value);
              }}
              placeholder="# Meine Geschichte&#10;&#10;## Kapitel 1: Der Anfang&#10;&#10;Es begann zu regnen…"
              className="mt-2 min-h-32 font-mono text-xs"
            />
          </details>

          {error ? (
            <p className="rounded-xl border border-brand-rose/30 bg-brand-rose/10 px-3 py-2 text-sm text-brand-rose">
              {error}
            </p>
          ) : null}

          {/* Vorschau */}
          {parsed ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-[11px] font-semibold text-muted-foreground">Titel</span>
                  <Input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="glass h-9 rounded-lg"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-semibold text-muted-foreground">Untertitel</span>
                  <Input
                    value={subtitle}
                    onChange={(event) => setSubtitle(event.target.value)}
                    className="glass h-9 rounded-lg"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-semibold text-muted-foreground">Genre</span>
                  <Input
                    value={genre}
                    onChange={(event) => setGenre(event.target.value)}
                    placeholder="Roman"
                    className="glass h-9 rounded-lg"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="cyan">
                  {parsed.chapters.length === 1 ? "1 Kapitel" : `${parsed.chapters.length} Kapitel`}
                </Badge>
                <Badge tone="emerald">{totalWords.toLocaleString("de-DE")} Wörter</Badge>
                {deriveScenes && sceneCount > 0 ? (
                  <Badge tone="violet">{sceneCount} Szenen erkannt</Badge>
                ) : null}
                {parsed.tags.length > 0 ? <Badge tone="amber">{parsed.tags.join(" · ")}</Badge> : null}
              </div>

              {parsed.warnings.length > 0 ? (
                <ul className="space-y-1 rounded-xl border border-brand-amber/30 bg-brand-amber/10 px-3 py-2 text-xs text-brand-amber">
                  {parsed.warnings.map((warning, index) => (
                    <li key={index}>• {warning}</li>
                  ))}
                </ul>
              ) : null}

              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="mb-2 text-[11px] font-semibold text-muted-foreground">
                  Erkannte Kapitel
                </p>
                <ol className="max-h-52 space-y-1 overflow-y-auto text-xs">
                  {parsed.chapters.map((chapter, index) => (
                    <li
                      key={index}
                      className="flex items-baseline justify-between gap-3 rounded-lg bg-black/20 px-2.5 py-1.5"
                    >
                      <span className="min-w-0 truncate">
                        <span className="text-muted-foreground">{index + 1}.</span> {chapter.title}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {chapter.words.toLocaleString("de-DE")} Wörter
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Nach dem Import ist das Buch ein normales Projekt: bearbeiten, Kohärenz/Stil prüfen,
                Fakten-Check. Figuren- und Welt-Daten leitest du anschließend in den Ansichten
                <span className="text-foreground/80"> „Charaktere"</span> bzw.
                <span className="text-foreground/80"> „Weltenbau"</span> ab — daraus entsteht der Kanon.
              </p>
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/10 p-4">
          <Button variant="outline" className="glass rounded-lg border-white/10" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            className="rounded-lg bg-gradient-to-r from-brand-cyan to-brand-indigo font-semibold text-white disabled:opacity-50"
            disabled={!parsed || parsed.chapters.every((chapter) => chapter.words === 0)}
            onClick={handleImport}
          >
            <Upload className="size-3.5" />
            Importieren
          </Button>
        </div>
      </div>
    </div>
  );
}