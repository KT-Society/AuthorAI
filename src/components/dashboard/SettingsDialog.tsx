import { useEffect, useRef, useState } from "react";
import { Cpu, Database, Download, KeyRound, Loader2, Palette, Plug, Save, Server, Settings, ShieldCheck, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  DEFAULT_LANGUAGE,
  FALLBACK_LANGUAGES,
  MODEL_STAGE_LABELS,
  MODEL_STAGES,
  emptyStageModels,
  readCanonWarn,
  readLanguage,
  readModel,
  readStageModelsRaw,
  readStyleProfile,
  writeCanonWarn,
  writeLanguage,
  writeModel,
  writeStageModel,
  writeStyleProfile,
} from "@/lib/generationSettings";
import type { ModelStage } from "@/lib/generationSettings";
import { fetchStoreInfo } from "@/services/state";
import type { StoreInfo } from "@/services/state";
import {
  DEFAULT_STYLE_PROFILE,
  STYLE_PRESETS,
  styleProfileLabel,
} from "@/data/style";
import type { StyleProfile } from "@/data/style";
import { fetchConfig } from "@/services/generate";
import type { AppConfig } from "@/services/generate";
import {
  fetchProvider,
  saveProvider,
  testProvider,
} from "@/services/provider";
import type { ProviderMode, ProviderStatus, ProviderTestResult } from "@/services/provider";
import { cn } from "@/lib/utils";
import { showToast } from "@/lib/toast";

const STATUS_OK = "#4caf50";
const STATUS_FAIL = "#ff5252";

/** Anzeigenamen der gespeicherten Sammlungen. */
export function SettingsDialog({
  open,
  profileId,
  onClose,
  onExportBackup,
  onImportBackup,
  onImportBackupAsProfile,
}: {
  open: boolean;
  /** Für die Speicherbelegung (kann fehlen, dann wird sie nicht gezeigt). */
  profileId?: string;
  onClose: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onImportBackupAsProfile: (file: File) => void;
}) {
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const backupProfileInputRef = useRef<HTMLInputElement | null>(null);
  const [model, setModel] = useState("");
  const [stageModels, setStageModels] = useState<Record<ModelStage, string>>(emptyStageModels);
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [styleProfile, setStyleProfile] = useState<StyleProfile>(DEFAULT_STYLE_PROFILE);
  const [canonWarn, setCanonWarn] = useState(true);
  /* ── LLM-Anbieter (OpenRouter oder eigener OpenAI-kompatibler Anbieter) ── */
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [providerMode, setProviderMode] = useState<ProviderMode>("openrouter");
  const [providerBaseUrl, setProviderBaseUrl] = useState("");
  const [providerKey, setProviderKey] = useState("");
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [providerTest, setProviderTest] = useState<ProviderTestResult | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  /** Belegung der SQLite-Datenbank (kein Browserspeicher-Limit mehr). */
  const [store, setStore] = useState<StoreInfo | null>(null);

  useEffect(() => {
    if (!open) return;
    void fetchStoreInfo().then((info) => setStore(info));
    setModel(readModel());
    setStageModels(readStageModelsRaw());
    setLanguage(readLanguage() ?? DEFAULT_LANGUAGE);
    setStyleProfile(readStyleProfile());
    setCanonWarn(readCanonWarn());
    void fetchProvider().then((info) => {
      if (!info) return;
      setProvider(info);
      setProviderMode(info.mode);
      setProviderBaseUrl(info.baseUrl);
      setProviderKey("");
    });
    fetchConfig().then((data) => {
      if (data) setConfig(data);
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

  /** Speichert die Anbieter-Konfiguration; ohne Key-Angabe bleibt der gespeicherte Key erhalten. */
  const persistProvider = async (apiKey?: string | null) => {
    setProviderBusy(true);
    setProviderError(null);
    setProviderTest(null);
    try {
      const status = await saveProvider({ mode: providerMode, baseUrl: providerBaseUrl, apiKey });
      setProvider(status);
      setProviderKey("");
      showToast("Anbieter gespeichert", "ok");
    } catch (err) {
      setProviderError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    } finally {
      setProviderBusy(false);
    }
  };

  const runProviderTest = async () => {
    setProviderBusy(true);
    setProviderError(null);
    setProviderTest(null);
    try {
      setProviderTest(
        await testProvider({
          mode: providerMode,
          baseUrl: providerBaseUrl,
          apiKey: providerKey.trim() || undefined,
        }),
      );
    } catch (err) {
      setProviderError(err instanceof Error ? err.message : "Test fehlgeschlagen.");
    } finally {
      setProviderBusy(false);
    }
  };

  if (!open) return null;

  const languages = config?.languages?.length ? config.languages : FALLBACK_LANGUAGES;
  const languageOptions = languages.includes(language) ? languages : [language, ...languages];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-strong float-in flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-violet to-brand-cyan text-white">
              <Settings className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Einstellungen</h2>
              <p className="text-xs text-muted-foreground">
                Modelle pro Schritt + Ausgabesprache.
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

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Cpu className="size-3.5" />
                Standard-Model (Fallback)
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
                Gilt für Charakter-Generierung und für alle Schritte ohne eigene Model-ID.
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Model pro Schritt
              </p>
              <div className="space-y-3">
                {MODEL_STAGES.map((stage) => {
                  const own = stageModels[stage].trim().length > 0;
                  return (
                    <div key={stage}>
                      <label className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] font-medium text-muted-foreground">
                        {MODEL_STAGE_LABELS[stage]}
                        {own ? (
                          <span className="rounded-full border border-brand-violet/40 bg-brand-violet/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-violet">
                            eigene Model-ID
                          </span>
                        ) : (
                          <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px]">
                            erbt Standard
                          </span>
                        )}
                      </label>
                      <div className="flex items-center gap-2">
                        <Input
                          value={stageModels[stage]}
                          onChange={(event) => {
                            const value = event.target.value;
                            setStageModels((prev) => ({ ...prev, [stage]: value }));
                            writeStageModel(stage, value);
                          }}
                          placeholder={model.trim() || "OpenRouter Model-ID"}
                          className="glass h-9 rounded-lg border-white/10 text-sm"
                        />
                        {own ? (
                          <button
                            type="button"
                            onClick={() => {
                              setStageModels((prev) => ({ ...prev, [stage]: "" }));
                              writeStageModel(stage, "");
                            }}
                            className="shrink-0 rounded-lg border border-white/10 px-2 py-1.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                            title="Eigene Model-ID entfernen — die Stufe erbt wieder das Standard-Model"
                          >
                            zurücksetzen
                          </button>
                        ) : null}
                      </div>
                      {own ? (
                        <p className="mt-1 text-[10px] text-brand-violet">
                          Nutzt <strong>{stageModels[stage]}</strong> statt des Standard-Models.
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Leer = erbt das Standard-Model. Für jeden Schritt kannst du eine eigene OpenRouter
                Model-ID eintragen.
              </p>
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Server className="size-3.5" />
                Anbieter (LLM)
              </label>

              <div className="glass inline-flex rounded-xl border border-white/10 p-1">
                {(["openrouter", "custom"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setProviderMode(value)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                      providerMode === value
                        ? "bg-gradient-to-r from-brand-violet to-brand-indigo text-white"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {value === "openrouter" ? "OpenRouter" : "Eigener Anbieter"}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {providerMode === "openrouter"
                  ? "Standard — Key aus der Root-.env (OPENROUTER_API_KEY)."
                  : "OpenAI-kompatibler Endpunkt: Base-URL und Key von deinem Anbieter. Die Model-IDs je Stufe müssen zu ihm passen."}
              </p>

              {providerMode === "custom" ? (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Base-URL
                    </label>
                    <Input
                      value={providerBaseUrl}
                      onChange={(event) => setProviderBaseUrl(event.target.value)}
                      placeholder="https://api.openai.com/v1"
                      className="glass h-10 rounded-xl border-white/10"
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      API-Key
                    </label>
                    <Input
                      type="password"
                      value={providerKey}
                      onChange={(event) => setProviderKey(event.target.value)}
                      placeholder={
                        provider?.hasKey ? "gespeichert — leer lassen zum Behalten" : "sk-…"
                      }
                      className="glass h-10 rounded-xl border-white/10"
                      spellCheck={false}
                      autoComplete="new-password"
                    />
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Der Key wird <strong>serverseitig</strong> gespeichert, nie an den Browser
                      zurückgegeben und nie geloggt.
                      {provider?.hasKey ? " Ein Key ist hinterlegt." : ""}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  className="glass rounded-xl border-white/10"
                  onClick={() => void runProviderTest()}
                  disabled={providerBusy}
                >
                  {providerBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plug className="size-4" />
                  )}
                  Verbindung testen
                </Button>
                <Button
                  className="rounded-xl bg-gradient-to-r from-brand-violet to-brand-indigo font-semibold text-white"
                  onClick={() =>
                    void persistProvider(
                      providerKey.trim().length > 0 ? providerKey.trim() : undefined,
                    )
                  }
                  disabled={providerBusy}
                >
                  <Save className="size-4" />
                  Speichern
                </Button>
                {provider?.hasKey ? (
                  <button
                    type="button"
                    onClick={() => void persistProvider(null)}
                    disabled={providerBusy}
                    className="text-[11px] font-semibold text-muted-foreground transition-colors hover:text-brand-rose disabled:opacity-50"
                  >
                    Key entfernen
                  </button>
                ) : null}
              </div>

              {providerTest ? (
                <p
                  className={cn(
                    "mt-2 text-[11px]",
                    providerTest.ok ? "text-brand-emerald" : "text-brand-rose",
                  )}
                >
                  {providerTest.ok ? "✓ " : "✗ "}
                  {providerTest.detail}
                </p>
              ) : null}
              {providerError ? (
                <p className="mt-2 text-[11px] text-brand-rose">{providerError}</p>
              ) : null}

              <p className="mt-2 text-[11px] text-muted-foreground">
                Aktiv:{" "}
                {provider
                  ? provider.effective === "custom"
                    ? `Eigener Anbieter (${provider.effectiveBaseUrl})`
                    : provider.openrouterAvailable
                      ? "OpenRouter"
                      : "OpenRouter — kein Key in der .env"
                  : "…"}
                {provider && !provider.ready ? " · nicht einsatzbereit" : ""}
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Ausgabesprache
              </label>
              <Select
                value={language}
                onValueChange={(value) => {
                  setLanguage(value);
                  writeLanguage(value);
                }}
              >
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

            <div>
              <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Palette className="size-3.5" />
                Stil-Profil (Zielstimme)
              </label>
              <Select
                value={styleProfile.presetId}
                onValueChange={(value) => {
                  const next = { ...styleProfile, presetId: value };
                  setStyleProfile(next);
                  writeStyleProfile(next);
                }}
              >
                <SelectTrigger className="glass h-10 w-full rounded-xl border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="glass-strong border-white/10">
                  {STYLE_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <textarea
                rows={2}
                value={styleProfile.custom}
                onChange={(event) => {
                  const next = { ...styleProfile, custom: event.target.value };
                  setStyleProfile(next);
                  writeStyleProfile(next);
                }}
                placeholder="Zusatz (optional), z. B. kurze Dialoge, kein Adverb-Overkill"
                className="glass mt-2 w-full rounded-xl border border-white/10 p-2.5 text-sm"
              />
              <p className="mt-2 text-[11px] text-muted-foreground">
                Gilt verbindlich für den <strong>Stil-Pass</strong> — nie auf Kosten von Inhalt,
                Fakten oder Bedeutung. Aktuell: {styleProfileLabel(styleProfile)}.
              </p>
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <ShieldCheck className="size-3.5" />
                Kanon-Warnung beim Kapitelwechsel
              </label>
              <label className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/5 p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-brand-emerald"
                  checked={canonWarn}
                  onChange={(event) => {
                    setCanonWarn(event.target.checked);
                    writeCanonWarn(event.target.checked);
                  }}
                />
                <span className="text-xs text-foreground/85">
                  Beim Wechsel prüft AuthorAI das verlassene Kapitel still gegen den Kanon und
                  warnt, wenn es Widersprüche gibt. Die Prüfung ist <strong>nicht blockierend</strong>{" "}
                  — kein Text geht verloren, das Ergebnis landet in der Prüf-Historie des Kapitels.
                  Bereits geprüfte, unveränderte Kapitel kosten nichts (Antwort-Cache).
                </span>
              </label>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Nutzt das Modell der Stufe <strong>Kohärenz</strong>.
              </p>
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Database className="size-3.5" />
                Daten &amp; Backup
              </label>
              <p className="mb-2 text-[11px] text-muted-foreground">
                Alle Profildaten (Bücher, Charaktere, Welt, Plot, Recherche, Metriken) als JSON.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="glass rounded-xl border-white/10"
                  onClick={onExportBackup}
                >
                  <Download className="size-4" />
                  Backup exportieren
                </Button>
                <Button
                  variant="outline"
                  className="glass rounded-xl border-white/10"
                  onClick={() => backupInputRef.current?.click()}
                  title="Ersetzt die Daten des aktuellen Profils"
                >
                  <Upload className="size-4" />
                  Backup importieren
                </Button>
                <Button
                  variant="outline"
                  className="glass rounded-xl border-white/10"
                  onClick={() => backupProfileInputRef.current?.click()}
                  title="Legt ein neues Profil aus dem Backup an — nichts wird überschrieben"
                >
                  <Upload className="size-4" />
                  Als neues Profil
                </Button>
                <input
                  ref={backupInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onImportBackup(file);
                    event.target.value = "";
                  }}
                />
                <input
                  ref={backupProfileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onImportBackupAsProfile(file);
                    event.target.value = "";
                  }}
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <KeyRound className="size-3.5" />
                API-Keys (serverseitig, Root-.env)
              </label>
              <div className="flex flex-wrap gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                  style={{
                    borderColor: config?.tavily ? STATUS_OK : STATUS_FAIL,
                    color: config?.tavily ? STATUS_OK : STATUS_FAIL,
                  }}
                >
                  Tavily: {config ? (config.tavily ? "verbunden" : "fehlt") : "…"}
                </span>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                  style={{
                    borderColor: config?.openrouter ? STATUS_OK : STATUS_FAIL,
                    color: config?.openrouter ? STATUS_OK : STATUS_FAIL,
                  }}
                >
                  OpenRouter: {config ? (config.openrouter ? "verbunden" : "fehlt") : "…"}
                </span>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                  style={{
                    borderColor: config?.pollinations ? STATUS_OK : STATUS_FAIL,
                    color: config?.pollinations ? STATUS_OK : STATUS_FAIL,
                  }}
                >
                  Pollinations: {config ? (config.pollinations ? "verbunden" : "fehlt") : "…"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-white/10 p-6">
          <Button
            onClick={onClose}
            className="rounded-xl bg-gradient-to-r from-brand-violet to-brand-indigo px-5 font-semibold text-white shadow-[0_0_30px_-10px_hsl(258_90%_66%/0.95)]"
          >
            Fertig
          </Button>
        </div>
      </div>
    </div>
  );
}
