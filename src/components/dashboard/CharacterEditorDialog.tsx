import { useEffect, useState } from "react";
import { Copy, Download, Loader2, Save, Sparkles, UserCog, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  SOUL_SECTIONS,
  emptySoul,
  filledSectionCount,
  isSectionValid,
  soulToPrompt,
} from "@/data/characters";
import type { Character } from "@/data/characters";
import { readLanguage, readModel } from "@/lib/generationSettings";
import { copyText } from "@/lib/clipboard";
import { showToast } from "@/lib/toast";
import { generateSoul } from "@/services/generate";

export function CharacterEditorDialog({
  open,
  character,
  onClose,
  onSave,
}: {
  open: boolean;
  character: Character | null;
  onClose: () => void;
  onSave: (character: Character) => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [soul, setSoul] = useState<Record<string, string>>(() => emptySoul());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !character) return;
    setName(character.name);
    setRole(character.role);
    setTagsInput(character.tags.join(", "));
    setSoul({ ...emptySoul(), ...character.soul });
    setError(null);
    setBusy(false);
  }, [open, character]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onClose]);

  if (!open || !character) return null;

  const scan = async () => {
    const slug = name.trim();
    if (!slug) {
      setError("Bitte einen Namen angeben.");
      return;
    }
    const model = readModel();
    if (!model.trim()) {
      setError("Bitte das Standard-Model in den Einstellungen eintragen.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await generateSoul({
        slug,
        model,
        language: readLanguage() ?? "German",
      });
      setSoul((prev) => {
        const next = { ...prev };
        for (const section of SOUL_SECTIONS) {
          const value = (data[section.key] ?? "").trim();
          if (value) next[section.key] = value;
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    onSave({
      ...character,
      name: name.trim() || character.name,
      role: role.trim() || character.role,
      tags: tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      soul,
      core: (soul.core ?? "").trim() || character.core,
    });
    onClose();
  };

  const filled = filledSectionCount(soul);
  const prompt = soulToPrompt(soul);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        className="glass-strong float-in flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-violet to-brand-cyan text-white">
              <UserCog className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{character.name}</h2>
              <p className="text-xs text-muted-foreground">
                {filled}/{SOUL_SECTIONS.length} Soul-Sektionen gefüllt
              </p>
            </div>
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

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Name</label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="glass h-10 rounded-xl border-white/10"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Rolle</label>
              <Input
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className="glass h-10 rounded-xl border-white/10"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Tags (Komma)
              </label>
              <Input
                value={tagsInput}
                onChange={(event) => setTagsInput(event.target.value)}
                className="glass h-10 rounded-xl border-white/10"
              />
            </div>
          </div>

          {error ? (
            <p className="mt-4 rounded-xl border border-brand-rose/30 bg-brand-rose/10 px-3 py-2 text-sm text-brand-rose">
              {error}
            </p>
          ) : null}

          <div className="mt-5 space-y-4">
            {SOUL_SECTIONS.map((section) => {
              const value = soul[section.key] ?? "";
              const valid = isSectionValid(value);
              return (
                <div key={section.key} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-sm font-semibold">
                      <span className="h-4 w-1 rounded-full bg-gradient-to-b from-brand-violet to-brand-cyan" />
                      {section.label}
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                        valid
                          ? "border-brand-emerald/30 bg-brand-emerald/10 text-brand-emerald"
                          : "border-brand-amber/30 bg-brand-amber/10 text-brand-amber",
                      )}
                    >
                      {valid ? "VALID" : "3+ Sätze nötig"}
                    </span>
                  </div>
                  <Textarea
                    rows={3}
                    value={value}
                    onChange={(event) =>
                      setSoul((prev) => ({ ...prev, [section.key]: event.target.value }))
                    }
                    placeholder={`${section.label} …`}
                    className="glass rounded-lg border-white/10 text-sm"
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-5">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="glass rounded-xl border-white/10"
              onClick={() => {
                void copyText(prompt).then((ok) =>
                  showToast(ok ? "Prompt kopiert" : "Kopieren fehlgeschlagen", ok ? "ok" : "error"),
                );
              }}
            >
              <Copy className="size-4" />
              Prompt kopieren
            </Button>
            <Button
              variant="outline"
              className="glass rounded-xl border-white/10"
              onClick={() => {
                const blob = new Blob([prompt], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = `${name.trim() || "soul"}_prompt.txt`;
                anchor.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="size-4" />
              .txt
            </Button>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="glass rounded-xl border-white/10"
              onClick={() => void scan()}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Soul-Scan
            </Button>
            <Button
              onClick={save}
              disabled={busy}
              className="rounded-xl bg-gradient-to-r from-brand-cyan to-brand-indigo px-5 font-semibold text-white shadow-[0_0_30px_-10px_hsl(186_100%_55%/0.95)]"
            >
              <Save className="size-4" />
              Speichern
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
