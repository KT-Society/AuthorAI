import { useEffect, useState } from "react";
import { ArrowLeft, Copy, Download, Loader2, Save, UserPlus, Wand2, X } from "lucide-react";

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
import {
  FALLBACK_LANGUAGES,
  readLanguage,
  readModel,
  writeLanguage,
  writeModel,
} from "@/lib/generationSettings";

import type { Book } from "@/data/author";
import {
  CHARACTER_GRADIENTS,
  FALLBACK_GRADIENT,
  SOUL_SECTIONS,
  emptySoul,
  firstSentence,
  isSectionValid,
  soulToPrompt,
} from "@/data/characters";
import type { Character } from "@/data/characters";
import { fetchConfig, generateSoul } from "@/services/generate";
import type { AppConfig } from "@/services/generate";

type Step = "form" | "result";

export function CharacterGenerator({
  open,
  existingCount,
  books,
  onClose,
  onCreate,
}: {
  open: boolean;
  existingCount: number;
  books: Book[];
  onClose: () => void;
  onCreate: (character: Character) => void;
}) {
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [bookId, setBookId] = useState<string>("none");
  const [model, setModel] = useState("");
  const [language, setLanguage] = useState("German");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [soul, setSoul] = useState<Record<string, string>>(() => emptySoul());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("form");
    setName("");
    setRole("");
    setTagsInput("");
    setBookId("none");
    setModel(readModel());
    setSoul(emptySoul());
    setError(null);
    setLoading(false);

    fetchConfig().then((data) => {
      if (!data) return;
      setConfig(data);
      setLanguage(readLanguage() ?? data.defaultLanguage ?? "German");
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const languages = config?.languages?.length ? config.languages : FALLBACK_LANGUAGES;
  const languageOptions = languages.includes(language) ? languages : [language, ...languages];

  const generate = async () => {
    const slug = name.trim();
    const modelId = model.trim();
    if (!slug) {
      setError("Bitte einen Charakter-Namen angeben.");
      return;
    }
    if (!modelId) {
      setError("Bitte eine OpenRouter Model-ID eintragen.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      writeModel(modelId);
      writeLanguage(language);
      const data = await generateSoul({ slug, model: modelId, language });
      const next = emptySoul();
      for (const section of SOUL_SECTIONS) {
        next[section.key] = (data[section.key] ?? "").trim();
      }
      setSoul(next);
      setStep("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setLoading(false);
    }
  };

  const save = () => {
    const core =
      soul.core?.trim() ||
      firstSentence(soul.bio ?? "") ||
      firstSentence(soul.personality ?? "") ||
      "Frisch generierter Charakter.";
    const derivedRole =
      role.trim() || firstSentence(soul.occupation ?? "", 48) || "Charakter";
    const tags = tagsInput
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const gradient = CHARACTER_GRADIENTS[existingCount % CHARACTER_GRADIENTS.length] ?? FALLBACK_GRADIENT;

    onCreate({
      id: `${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "charakter"}-${Date.now().toString(36)}`,
      name: name.trim(),
      role: derivedRole,
      bookId: bookId === "none" ? undefined : bookId,
      gradient,
      tags,
      core,
      soul,
      createdAt: new Date().toISOString(),
    });
    onClose();
  };

  const prompt = soulToPrompt(soul);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        className="glass-strong float-in flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-violet to-brand-cyan text-white">
              {step === "form" ? <UserPlus className="size-5" /> : <Wand2 className="size-5" />}
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                {step === "form" ? "Neuen Charakter einführen" : `Soul: ${name}`}
              </h2>
              <p className="text-xs text-muted-foreground">
                {step === "form"
                  ? "Recherche + 12-teilige Soul-Synthese über die promptgen-Engine"
                  : "Sektionen prüfen, anpassen und in deine Welt speichern"}
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

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {step === "form" ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Name / Slug *
                </label>
                <Input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="z. B. Seraphine Vhalor"
                  className="glass h-10 rounded-xl border-white/10"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void generate();
                  }}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Rolle (optional)
                  </label>
                  <Input
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                    placeholder="z. B. Antagonistin"
                    className="glass h-10 rounded-xl border-white/10"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Tags (Komma-getrennt)
                  </label>
                  <Input
                    value={tagsInput}
                    onChange={(event) => setTagsInput(event.target.value)}
                    placeholder="Königin, Feuer, Verrat"
                    className="glass h-10 rounded-xl border-white/10"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Mit Buch verknüpfen
                  </label>
                  <Select value={bookId} onValueChange={setBookId}>
                    <SelectTrigger className="glass h-10 w-full rounded-xl border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-strong border-white/10">
                      <SelectItem value="none">Kein Projekt</SelectItem>
                      {books.map((book) => (
                        <SelectItem key={book.id} value={book.id}>
                          {book.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Ausgabesprache
                  </label>
                  <Select value={language} onValueChange={(value) => {
                    setLanguage(value);
                    writeLanguage(value);
                  }}>
                    <SelectTrigger className="glass h-10 w-full rounded-xl border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-strong border-white/10">
                      {languageOptions.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Model (OpenRouter) *
                </label>
                <Input
                  value={model}
                  onChange={(event) => {
                    setModel(event.target.value);
                    writeModel(event.target.value);
                  }}
                  placeholder="OpenRouter Model-ID"
                  className="glass h-10 rounded-xl border-white/10"
                />
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Freie Eingabe — wird lokal gespeichert. Keys liest der Server aus der Root-
                  <code>.env</code>.
                </p>
              </div>

              {error ? (
                <p className="rounded-xl border border-brand-rose/30 bg-brand-rose/10 px-3 py-2 text-sm text-brand-rose">
                  {error}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              {SOUL_SECTIONS.map((section) => {
                const value = soul[section.key] ?? "";
                const valid = isSectionValid(value);
                return (
                  <div
                    key={section.key}
                    className="rounded-xl border border-white/10 bg-white/5 p-3"
                  >
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
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-5">
          {step === "form" ? (
            <>
              <p className="text-[11px] text-muted-foreground">
                {config?.tavily === false ? "⚠️ Tavily-Key fehlt in der .env" : ""}
                {config?.openrouter === false ? "  ⚠️ OpenRouter-Key fehlt in der .env" : ""}
              </p>
              <div className="flex gap-3">
                <Button
                  variant="ghost"
                  className="rounded-xl text-muted-foreground hover:text-foreground"
                  onClick={onClose}
                >
                  Abbrechen
                </Button>
                <Button
                  onClick={() => void generate()}
                  disabled={loading}
                  className="rounded-xl bg-gradient-to-r from-brand-violet to-brand-indigo px-5 font-semibold text-white shadow-[0_0_30px_-10px_hsl(258_90%_66%/0.95)] disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Synthese läuft…
                    </>
                  ) : (
                    <>
                      <Wand2 className="size-4" />
                      Soul generieren
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                className="rounded-xl text-muted-foreground hover:text-foreground"
                onClick={() => setStep("form")}
              >
                <ArrowLeft className="size-4" />
                Zurück
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="glass rounded-xl border-white/10"
                  onClick={() => void navigator.clipboard.writeText(prompt)}
                >
                  <Copy className="size-4" />
                  Kopieren
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
                <Button
                  onClick={save}
                  className="rounded-xl bg-gradient-to-r from-brand-cyan to-brand-indigo px-5 font-semibold text-white shadow-[0_0_30px_-10px_hsl(186_100%_55%/0.95)]"
                >
                  <Save className="size-4" />
                  Charakter speichern
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
