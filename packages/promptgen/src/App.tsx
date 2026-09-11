import { useEffect, useState } from "react";
import {
  Box,
  Container,
  Typography,
  TextField,
  Button,
  Grid,
  Paper,
  Divider,
  Chip,
  MenuItem,
} from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadIcon from "@mui/icons-material/Download";
import SettingsIcon from "@mui/icons-material/Settings";
import SecurityIcon from "@mui/icons-material/Security";
import CircularProgress from "@mui/material/CircularProgress";

import { fetchConfig, generateSoul } from "./services/api";
import type { AppConfig } from "./services/api";

interface PromptSection {
  id: string;
  title: string;
  content: string;
  valid: boolean;
}

const INITIAL_SECTIONS: PromptSection[] = [
  { id: "head", title: "Prompt Head Override", content: "", valid: false },
  { id: "core", title: "Core", content: "", valid: false },
  { id: "bio", title: "Static Bio", content: "", valid: false },
  { id: "trivia", title: "Trivia", content: "", valid: false },
  { id: "appearance", title: "Appearance", content: "", valid: false },
  { id: "personality", title: "Personality", content: "", valid: false },
  { id: "relationships", title: "Relationships", content: "", valid: false },
  { id: "occupation", title: "Occupation", content: "", valid: false },
  { id: "skills", title: "Skills", content: "", valid: false },
  { id: "speech", title: "Speech Style", content: "", valid: false },
  { id: "goals", title: "Goals", content: "", valid: false },
  { id: "emotes", title: "Emote Moods Override", content: "", valid: false },
];

const FALLBACK_LANGUAGES = ["German", "English", "Japanese", "French"];
const FALLBACK_LANGUAGE = "German";

const STATUS_OK = "#4caf50";
const STATUS_FAIL = "#ff5252";

type SettingKey = "model" | "language";

function App() {
  const [slug, setSlug] = useState("");
  const [sections, setSections] = useState<PromptSection[]>(INITIAL_SECTIONS);
  const [settings, setSettings] = useState(() => ({
    model: localStorage.getItem("model") || "",
    language: localStorage.getItem("language") || FALLBACK_LANGUAGE,
  }));
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    let active = true;
    fetchConfig().then((data) => {
      if (!active || !data) return;
      setConfig(data);
      setSettings((prev) => ({
        ...prev,
        language: localStorage.getItem("language") || data.defaultLanguage || prev.language,
      }));
    });
    return () => {
      active = false;
    };
  }, []);

  const languages = config?.languages?.length ? config.languages : FALLBACK_LANGUAGES;
  const languageOptions = languages.includes(settings.language)
    ? languages
    : [settings.language, ...languages];

  const updateSetting = (key: SettingKey, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    localStorage.setItem(key, value);
  };

  const checkSentences = (text: string) => {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 5);
    return sentences.length >= 3;
  };

  const handleGenerate = async () => {
    const cleanSlug = slug.trim();
    if (!cleanSlug) return;

    const model = settings.model.trim();
    if (!model) {
      alert("Bitte zuerst eine OpenRouter Model-ID im Settings-Feld eintragen! 😈");
      setShowSettings(true);
      return;
    }

    setLoading(true);
    try {
      const soulData = await generateSoul({
        slug: cleanSlug,
        model,
        language: settings.language,
      });

      setSections((prev) =>
        prev.map((section) => {
          const content = soulData[section.id] ?? "";
          return { ...section, content, valid: checkSentences(content) };
        }),
      );
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Unbekannter Fehler.";
      alert(
        `Ups, da ist was schiefgelaufen beim Beschwören der Seele... 💀\n\n${message}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const fullPrompt = sections
    .map((s) => `** ${s.title} **\n${s.content}`)
    .join("\n\n");

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box className="glass p-8 mb-8 neon-border" sx={{ position: "relative" }}>
        <Box sx={{ position: "absolute", top: 20, right: 20 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<SettingsIcon />}
            onClick={() => setShowSettings(!showSettings)}
            sx={{ borderColor: "#ff00db", color: "#ff00db" }}
          >
            Settings
          </Button>
        </Box>

        <Typography
          variant="h3"
          className="neon-text mb-4"
          sx={{ fontWeight: "bold", color: "#00f2ff" }}
        >
          Canon-Slug Generator 😈
        </Typography>

        {showSettings && (
          <Box
            sx={{
              mb: 4,
              p: 3,
              borderRadius: 2,
              bgcolor: "rgba(255,255,255,0.03)",
              border: "1px dashed #ff00db",
            }}
          >
            <Typography
              variant="h6"
              sx={{
                color: "#ff00db",
                mb: 2,
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <SecurityIcon /> Konfiguration
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  size="small"
                  label="Model (OpenRouter)"
                  placeholder="OpenRouter Model-ID"
                  value={settings.model}
                  onChange={(e) => updateSetting("model", e.target.value)}
                  helperText="Freie Eingabe – wird lokal gespeichert"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  size="small"
                  label="Output Language"
                  select
                  value={settings.language}
                  onChange={(e) => updateSetting("language", e.target.value)}
                >
                  {languageOptions.map((language) => (
                    <MenuItem key={language} value={language}>
                      {language}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12}>
                <Typography
                  variant="caption"
                  sx={{ display: "block", mt: 1, opacity: 0.75 }}
                >
                  API-Keys werden serverseitig aus der Root-<code>.env</code>{" "}
                  gelesen und niemals an den Browser ausgeliefert.
                </Typography>
              </Grid>
              {config && (
                <Grid item xs={12}>
                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1 }}>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={`Tavily: ${config.tavily ? "verbunden" : "fehlt"}`}
                      sx={{
                        borderColor: config.tavily ? STATUS_OK : STATUS_FAIL,
                        color: config.tavily ? STATUS_OK : STATUS_FAIL,
                        fontWeight: "bold",
                      }}
                    />
                    <Chip
                      size="small"
                      variant="outlined"
                      label={`OpenRouter: ${config.openrouter ? "verbunden" : "fehlt"}`}
                      sx={{
                        borderColor: config.openrouter ? STATUS_OK : STATUS_FAIL,
                        color: config.openrouter ? STATUS_OK : STATUS_FAIL,
                        fontWeight: "bold",
                      }}
                    />
                  </Box>
                </Grid>
              )}
            </Grid>
          </Box>
        )}
        <Typography variant="body1" sx={{ mb: 4, opacity: 0.8 }}>
          Transformiere Charakter-Lores in hochpräzise AI-Soul Prompts.
          Standalone &amp; Habitat-Ready.
        </Typography>
        <Box sx={{ display: "flex", gap: 2, mb: 4 }}>
          <TextField
            fullWidth
            label="Character Slug (z.B. Harley Quinn)"
            variant="outlined"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={loading}
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: "8px",
                borderColor: slug ? "#00f2ff" : "inherit",
              },
            }}
          />
          <Button
            variant="contained"
            startIcon={
              loading ? (
                <CircularProgress size={20} color="inherit" />
              ) : (
                <AutoFixHighIcon />
              )
            }
            onClick={handleGenerate}
            disabled={!slug || loading}
            sx={{
              px: 4,
              py: 1.5,
              borderRadius: "8px",
              fontWeight: "bold",
              bgcolor: slug && !loading ? "#00f2ff" : "grey.800",
              color: "#0a0b10",
              "&:hover": { bgcolor: "#00d0dd" },
            }}
          >
            {loading
              ? "Synthese läuft..."
              : `Synthese starten für "${slug || "..."}"`}
          </Button>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {sections.map((section) => (
          <Grid item xs={12} md={6} key={section.id}>
            <Paper
              className="glass p-6 neon-border"
              sx={{ height: "100%", position: "relative", overflow: "hidden" }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 2,
                }}
              >
                <Typography
                  variant="h6"
                  sx={{
                    color: "#ff00db",
                    fontWeight: "bold",
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  <Divider
                    orientation="vertical"
                    flexItem
                    sx={{
                      borderRightWidth: 4,
                      borderColor: "#ff00db",
                      mr: 1,
                      borderRadius: 2,
                    }}
                  />
                  {section.title}
                </Typography>
                <Chip
                  label={section.valid ? "VALID" : "3+ Sätze nötig"}
                  color={section.valid ? "success" : "warning"}
                  size="small"
                  variant="outlined"
                  sx={{
                    borderColor: section.valid ? STATUS_OK : "#ff9800",
                    color: section.valid ? STATUS_OK : "#ff9800",
                    fontWeight: "bold",
                  }}
                />
              </Box>
              <TextField
                multiline
                rows={4}
                fullWidth
                variant="standard"
                placeholder={`Beschreibe ${section.title} für ${slug || "den Charakter"}...`}
                value={section.content}
                onChange={(e) => {
                  const newContent = e.target.value;
                  setSections(
                    sections.map((s) =>
                      s.id === section.id
                        ? {
                            ...s,
                            content: newContent,
                            valid: checkSentences(newContent),
                          }
                        : s,
                    ),
                  );
                }}
                InputProps={{
                  disableUnderline: true,
                  sx: {
                    fontSize: "0.9rem",
                    opacity: 0.9,
                    color: section.valid ? "#fff" : "#aaa",
                    transition: "color 0.3s ease",
                  },
                }}
              />
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Box sx={{ mt: 6, display: "flex", justifyContent: "center", gap: 3 }}>
        <Button
          variant="outlined"
          startIcon={<ContentCopyIcon />}
          sx={{ borderRadius: "8px", borderColor: "#00f2ff", color: "#00f2ff" }}
          onClick={() => {
            navigator.clipboard.writeText(fullPrompt);
            alert("Prompt in die Zwischenablage kopiert! 😈");
          }}
        >
          Prompt kopieren
        </Button>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          sx={{ borderRadius: "8px", borderColor: "#ff00db", color: "#ff00db" }}
          onClick={() => {
            const blob = new Blob([fullPrompt], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${slug || "soul"}_prompt.txt`;
            a.click();
          }}
        >
          .prompt Datei laden
        </Button>
      </Box>
    </Container>
  );
}

export default App;
