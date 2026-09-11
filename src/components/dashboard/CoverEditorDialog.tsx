import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  LayoutTemplate,
  Loader2,
  Plus,
  Save,
  Trash2,
  Type,
  Wand2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  COVER_FONTS,
  COVER_LAYOUTS,
  COVER_PRESETS,
  COVER_WEIGHTS,
  applyCoverLayout,
  applyCoverPreset,
  defaultCoverLayers,
  ean13Modules,
  makeCoverLayer,
  normalizeIsbn,
  presetFromLayers,
} from "@/data/cover";
import type { CoverLayoutId, CoverTextLayer, SavedCoverPreset } from "@/data/cover";
import { saveCoverImage } from "@/services/cover";

type CtxWithSpacing = CanvasRenderingContext2D & { letterSpacing?: string };

export type CoverTarget = "front" | "back";

/** Zeichnet einen EAN-13-Barcode (ISBN) ins Canvas. */
function drawBarcode(
  ctx: CanvasRenderingContext2D,
  layer: CoverTextLayer,
  width: number,
  height: number,
): void {
  const modules = ean13Modules(layer.text);
  const digits = normalizeIsbn(layer.text);
  if (!modules) return;

  const barHeight = layer.size * width;
  const barWidth = (barHeight * 0.95) / 95;
  const totalWidth = barWidth * 95;
  const anchorX = (layer.x / 100) * width;
  const anchorY = (layer.y / 100) * height;
  const startX = anchorX - totalWidth / 2;
  const top = anchorY - barHeight / 2;

  ctx.save();
  ctx.fillStyle = layer.color;
  modules.forEach((bar, index) => {
    if (!bar) return;
    ctx.fillRect(startX + index * barWidth, top, Math.max(1, barWidth * 0.9), barHeight);
  });

  const fontSize = barHeight * 0.26;
  ctx.font = `400 ${fontSize}px "Courier New", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(digits, anchorX, top + barHeight + fontSize * 0.18);
  ctx.restore();
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: CoverTextLayer,
  width: number,
  height: number,
): void {
  if (layer.role === "isbn") {
    drawBarcode(ctx, layer, width, height);
    return;
  }

  const fontSize = layer.size * width;
  const text = layer.uppercase ? layer.text.toUpperCase() : layer.text;
  const lines = text.split("\n");
  const lineHeight = 1.15;

  ctx.save();
  ctx.font = `${layer.italic ? "italic " : ""}${layer.fontWeight} ${fontSize}px "${layer.fontFamily}", sans-serif`;
  ctx.textAlign = layer.align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = layer.color;
  (ctx as CtxWithSpacing).letterSpacing = `${layer.letterSpacing * fontSize}px`;

  if (layer.shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.65)";
    ctx.shadowBlur = fontSize * 0.18;
    ctx.shadowOffsetY = fontSize * 0.05;
  } else {
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  const totalHeight = lines.length * lineHeight * fontSize;
  const anchorX = (layer.x / 100) * width;
  const anchorY = (layer.y / 100) * height;

  lines.forEach((line, index) => {
    const lineY = anchorY - totalHeight / 2 + lineHeight * fontSize * (index + 0.5);
    ctx.fillText(line, anchorX, lineY);
  });
  ctx.restore();
}

export function CoverEditorDialog({
  open,
  imageUrl,
  target,
  initialLayers,
  defaultTitle,
  defaultAuthor,
  onTargetChange,
  onClose,
  onSaved,
  onSaveLayers,
  customPresets = [],
  onSavePreset,
}: {
  open: boolean;
  imageUrl: string | undefined;
  target: CoverTarget;
  initialLayers?: CoverTextLayer[];
  defaultTitle?: string;
  defaultAuthor?: string;
  onTargetChange: (target: CoverTarget) => void;
  onClose: () => void;
  onSaved: (url: string) => void;
  onSaveLayers: (layers: CoverTextLayer[]) => void;
  customPresets?: SavedCoverPreset[];
  onSavePreset?: (label: string, layers: CoverTextLayer[]) => void;
}) {
  const [layers, setLayers] = useState<CoverTextLayer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewWidth, setPreviewWidth] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const seeded =
      initialLayers && initialLayers.length > 0
        ? initialLayers.map((layer) => ({ ...layer }))
        : defaultCoverLayers(defaultTitle ?? "Titel", defaultAuthor);
    setLayers(seeded);
    setSelectedId(seeded[0]?.id ?? null);
    setError(null);
    setBusy(false);
  }, [open, imageUrl, initialLayers, defaultTitle, defaultAuthor]);

  useEffect(() => {
    if (!open) return;
    const element = containerRef.current;
    if (!element) return;
    const update = () => setPreviewWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onClose]);

  const updateLayer = useCallback((id: string, patch: Partial<CoverTextLayer>) => {
    setLayers((prev) => prev.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)));
  }, []);

  if (!open) return null;

  const selected = layers.find((layer) => layer.id === selectedId) ?? null;

  const addLayer = (kind: "title" | "author" | "plain" | "isbn") => {
    const layer = makeCoverLayer(
      kind,
      kind === "plain" ? "Text" : kind === "author" ? "Autor" : kind === "isbn" ? "9783161484100" : "Titel",
    );
    setLayers((prev) => [...prev, layer]);
    setSelectedId(layer.id);
  };

  const removeLayer = (id: string) => {
    setLayers((prev) => prev.filter((layer) => layer.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  };

  const bake = async (): Promise<Blob> => {
    const image = imgRef.current;
    if (!image) throw new Error("Bild ist noch nicht geladen.");
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas nicht verfügbar.");
    ctx.drawImage(image, 0, 0, width, height);
    try {
      await document.fonts.ready;
    } catch {
      // Schriften sind optional
    }
    for (const layer of layers) drawLayer(ctx, layer, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("Export fehlgeschlagen."))),
        "image/png",
      );
    });
  };

  const applyToImage = async () => {
    setError(null);
    setBusy(true);
    try {
      const url = await saveCoverImage(await bake());
      onSaveLayers(layers);
      onSaved(url);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setBusy(false);
    }
  };

  const saveLayersOnly = () => {
    onSaveLayers(layers);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6">
      <div className="glass-strong float-in flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-violet to-brand-cyan text-white">
              <Type className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                {target === "front" ? "Front-Cover-Text" : "Back-Cover-Text"}
              </h2>
              <p className="text-xs text-muted-foreground">
                Text hinzufügen, Presets anwenden, frei positionieren — Layer bleiben editierbar.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
              {(["front", "back"] as CoverTarget[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onTargetChange(option)}
                  className={cn(
                    "rounded-lg px-3 py-1 text-[11px] font-semibold transition-colors",
                    target === option
                      ? "bg-white/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option === "front" ? "Front" : "Back"}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-lg text-muted-foreground hover:text-foreground"
              onClick={onClose}
              disabled={busy}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <div
              ref={containerRef}
              className="relative mx-auto w-full max-w-[420px] select-none touch-none overflow-hidden rounded-xl border border-white/10"
              onPointerDown={() => setSelectedId(null)}
            >
              {imageUrl ? (
                <img
                  ref={imgRef}
                  src={imageUrl}
                  alt={target === "front" ? "Front-Cover" : "Back-Cover"}
                  draggable={false}
                  className="block h-auto w-full"
                />
              ) : (
                <div className="flex aspect-[3/4] items-center justify-center text-xs text-muted-foreground">
                  Kein Bild — zuerst generieren.
                </div>
              )}

              {layers.map((layer) => (
                <div
                  key={layer.id}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setSelectedId(layer.id);
                    dragRef.current = layer.id;
                    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => {
                    if (dragRef.current !== layer.id) return;
                    const rect = containerRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    const x = ((event.clientX - rect.left) / rect.width) * 100;
                    const y = ((event.clientY - rect.top) / rect.height) * 100;
                    updateLayer(layer.id, {
                      x: Math.max(0, Math.min(100, x)),
                      y: Math.max(0, Math.min(100, y)),
                    });
                  }}
                  onPointerUp={(event) => {
                    dragRef.current = null;
                    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
                  }}
                  style={{
                    position: "absolute",
                    left: `${layer.x}%`,
                    top: `${layer.y}%`,
                    transform: `translate(${
                      layer.align === "left" ? "0%" : layer.align === "right" ? "-100%" : "-50%"
                    }, -50%)`,
                    fontFamily: `"${layer.fontFamily}", sans-serif`,
                    fontWeight: layer.fontWeight,
                    fontStyle: layer.italic ? "italic" : "normal",
                    fontSize: `${layer.size * previewWidth}px`,
                    lineHeight: 1.15,
                    letterSpacing: `${layer.letterSpacing}em`,
                    color: layer.color,
                    textAlign: layer.align,
                    textShadow: layer.shadow ? "0 2px 10px rgba(0,0,0,0.7)" : "none",
                    whiteSpace: "pre",
                    cursor: "grab",
                    userSelect: "none",
                    outline: layer.id === selectedId ? "1px dashed rgba(0,242,255,0.8)" : "none",
                    outlineOffset: "3px",
                  }}
                >
                  {layer.role === "isbn" ? (
                    <span className="inline-flex flex-col items-center gap-1">
                      {ean13Modules(layer.text) ? (
                        <span className="flex items-end" style={{ height: layer.size * previewWidth }}>
                          {(ean13Modules(layer.text) ?? []).map((bar, index) => (
                            <span
                              key={index}
                              style={{
                                width: Math.max(1, (layer.size * previewWidth * 0.95) / 95),
                                height: bar ? "100%" : "82%",
                                background: bar ? layer.color : "transparent",
                              }}
                            />
                          ))}
                        </span>
                      ) : (
                        <span style={{ fontSize: Math.max(7, layer.size * previewWidth * 0.3) }}>
                          ungültige ISBN
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: Math.max(6, layer.size * previewWidth * 0.26),
                          letterSpacing: "0.08em",
                        }}
                      >
                        {normalizeIsbn(layer.text) || "—"}
                      </span>
                    </span>
                  ) : layer.uppercase ? (
                    layer.text.toUpperCase()
                  ) : (
                    layer.text
                  )}
                </div>
              ))}
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              {Math.round(previewWidth)} px Vorschau · Text ziehen zum Positionieren
            </p>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Wand2 className="size-3.5" />
                Presets
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[...COVER_PRESETS, ...customPresets].map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setLayers((prev) => applyCoverPreset(prev, preset))}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] transition-colors hover:border-white/20 hover:text-foreground",
                      "custom" in preset && preset.custom
                        ? "border-brand-violet/40 bg-brand-violet/10 text-brand-violet"
                        : "border-white/10 bg-white/5",
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
                {onSavePreset ? (
                  <button
                    type="button"
                    onClick={() => {
                      const label = window.prompt("Name für dieses Cover-Preset?");
                      if (label?.trim()) onSavePreset(label.trim(), layers);
                    }}
                    className="rounded-full border border-dashed border-white/20 bg-transparent px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                    title="Aktuelle Schrift-/Stilwahl als Preset speichern"
                  >
                    + Preset speichern
                  </button>
                ) : null}
              </div>

              <p className="mt-3 mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <LayoutTemplate className="size-3.5" />
                Layout
              </p>
              <Select
                value=""
                onValueChange={(value) =>
                  setLayers((prev) => applyCoverLayout(prev, value as CoverLayoutId))
                }
              >
                <SelectTrigger size="sm" className="glass w-full rounded-lg border-white/10">
                  <SelectValue placeholder="Layout wählen…" />
                </SelectTrigger>
                <SelectContent className="glass-strong border-white/10">
                  {COVER_LAYOUTS.map((layout) => (
                    <SelectItem key={layout.id} value={layout.id}>
                      {layout.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="glass rounded-lg border-white/10" onClick={() => addLayer("title")}>
                <Plus className="size-3.5" /> Titel
              </Button>
              <Button size="sm" variant="outline" className="glass rounded-lg border-white/10" onClick={() => addLayer("author")}>
                <Plus className="size-3.5" /> Autor
              </Button>
              <Button size="sm" variant="outline" className="glass rounded-lg border-white/10" onClick={() => addLayer("plain")}>
                <Plus className="size-3.5" /> Text
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="glass rounded-lg border-white/10"
                onClick={() => addLayer("isbn")}
                title="ISBN-Barcode (EAN-13) einfügen"
              >
                <Plus className="size-3.5" /> ISBN
              </Button>
            </div>

            <div className="space-y-1">
              {layers.map((layer) => (
                <div
                  key={layer.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors",
                    layer.id === selectedId
                      ? "border-brand-cyan/40 bg-white/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10",
                  )}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left"
                    onClick={() => setSelectedId(layer.id)}
                  >
                    {layer.text.split("\n")[0] || "—"}
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground transition-colors hover:text-brand-rose"
                    onClick={() => removeLayer(layer.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {selected ? (
              <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Text</label>
                  <Textarea
                    rows={2}
                    value={selected.text}
                    onChange={(event) => updateLayer(selected.id, { text: event.target.value })}
                    className="glass rounded-lg border-white/10 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Schrift</label>
                    <Select
                      value={selected.fontFamily}
                      onValueChange={(value) => updateLayer(selected.id, { fontFamily: value })}
                    >
                      <SelectTrigger size="sm" className="glass w-full rounded-lg border-white/10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="glass-strong border-white/10">
                        {COVER_FONTS.map((font) => (
                          <SelectItem key={font} value={font}>
                            {font}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Stärke</label>
                    <Select
                      value={String(selected.fontWeight)}
                      onValueChange={(value) => updateLayer(selected.id, { fontWeight: Number(value) })}
                    >
                      <SelectTrigger size="sm" className="glass w-full rounded-lg border-white/10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="glass-strong border-white/10">
                        {COVER_WEIGHTS.map((weight) => (
                          <SelectItem key={weight} value={String(weight)}>
                            {weight}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Größe</label>
                  <input
                    type="range"
                    min={0.02}
                    max={0.18}
                    step={0.002}
                    value={selected.size}
                    onChange={(event) => updateLayer(selected.id, { size: Number(event.target.value) })}
                    className="w-full accent-[hsl(186_100%_55%)]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Farbe</label>
                    <input
                      type="color"
                      value={selected.color}
                      onChange={(event) => updateLayer(selected.id, { color: event.target.value })}
                      className="h-9 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Laufweite</label>
                    <input
                      type="range"
                      min={0}
                      max={0.4}
                      step={0.01}
                      value={selected.letterSpacing}
                      onChange={(event) =>
                        updateLayer(selected.id, { letterSpacing: Number(event.target.value) })
                      }
                      className="w-full accent-[hsl(186_100%_55%)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Ausrichtung</label>
                  <div className="flex gap-1">
                    {(
                      [
                        { id: "left", icon: AlignLeft },
                        { id: "center", icon: AlignCenter },
                        { id: "right", icon: AlignRight },
                      ] as const
                    ).map((option) => {
                      const Icon = option.icon;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => updateLayer(selected.id, { align: option.id })}
                          className={cn(
                            "flex h-8 flex-1 items-center justify-center rounded-lg border transition-colors",
                            selected.align === option.id
                              ? "border-brand-cyan/40 bg-white/10 text-brand-cyan"
                              : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <Icon className="size-3.5" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={selected.uppercase}
                      onChange={(event) => updateLayer(selected.id, { uppercase: event.target.checked })}
                      className="accent-[hsl(186_100%_55%)]"
                    />
                    GROSSBUCHSTABEN
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={selected.italic}
                      onChange={(event) => updateLayer(selected.id, { italic: event.target.checked })}
                      className="accent-[hsl(186_100%_55%)]"
                    />
                    Kursiv
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={selected.shadow}
                      onChange={(event) => updateLayer(selected.id, { shadow: event.target.checked })}
                      className="accent-[hsl(186_100%_55%)]"
                    />
                    Schatten
                  </label>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Wähle eine Textebene aus, um sie zu formatieren.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-5">
          {error ? <p className="text-sm text-brand-rose">{error}</p> : <span />}
          <div className="flex flex-wrap gap-3">
            <Button
              variant="ghost"
              className="rounded-xl text-muted-foreground hover:text-foreground"
              onClick={onClose}
              disabled={busy}
            >
              Abbrechen
            </Button>
            <Button
              variant="outline"
              className="glass rounded-xl border-white/10"
              onClick={saveLayersOnly}
              disabled={busy}
              title="Nur die Text-Layer speichern (Bild bleibt unverändert) — später weiterbearbeitbar"
            >
              <Save className="size-4" />
              Nur Text speichern
            </Button>
            <Button
              onClick={() => void applyToImage()}
              disabled={busy || !imageUrl}
              className="rounded-xl bg-gradient-to-r from-brand-cyan to-brand-indigo px-5 font-semibold text-white shadow-[0_0_30px_-10px_hsl(186_100%_55%/0.95)] disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Wird gespeichert…
                </>
              ) : (
                "Auf Bild anwenden"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
