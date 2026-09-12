import { serve } from "bun";
import index from "./index.html";
import { loadRootEnv } from "@promptgen/server/env";
import { getDefaultLanguage, getPublicConfig } from "@promptgen/server/config";
import { ApiError, generateSoul } from "@promptgen/server/api";

import { rm } from "node:fs/promises";
import path from "node:path";

import type { SceneConstraint, Storyboard } from "./data/story";
import { coversDir, generateCover, saveCoverImage } from "./server/cover";
import { extractContinuity, checkCanon, checkCanonChapters, repairCanon } from "./server/continuity";
import type { CanonViolation } from "./server/continuity";
import { isStandaloneBinary, runtimePort } from "./server/paths";
import { runResearch } from "./server/research";
import {
  checkConsistency,
  checkTimeline,
  draftChapter,
  expandChapter,
  extractCharacters,
  extractWorld,
  generateStoryboard,
  refineStyle,
} from "./server/story";

// Load API keys from the repository root `.env` (server-side only).
loadRootEnv();

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    throw new ApiError("Ungültiger Request-Body.", 400);
  }
}

function requiredString(value: unknown, message: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new ApiError(message, 400);
  return text;
}

function optionalLanguage(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : getDefaultLanguage();
}

/** Optionaler, nicht-leerer String (z. B. der Kanon-Block). */
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * SSE-Antwort: `run` bekommt `emit` und schickt Ereignisse als `data: {...}`.
 * Fehler nach dem Start werden als `{ type: "error" }` gesendet (der Status ist dann 200).
 */
function sseResponse(run: (emit: (event: Record<string, unknown>) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        await run(emit);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unbekannter Fehler.";
        emit({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function optionalInt(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Verbindliche Szenen aus dem Request-Body (oder undefined). */
function asScenes(value: unknown): SceneConstraint[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const scenes: SceneConstraint[] = [];
  for (const entry of value) {
    const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const text = typeof item.text === "string" ? item.text.trim() : "";
    if (!text) continue;
    scenes.push({
      text,
      characters: Array.isArray(item.characters)
        ? item.characters.filter((name): name is string => typeof name === "string")
        : [],
      pov: typeof item.pov === "string" && item.pov.trim() ? item.pov.trim() : undefined,
      setting:
        typeof item.setting === "string" && item.setting.trim() ? item.setting.trim() : undefined,
      time: typeof item.time === "string" && item.time.trim() ? item.time.trim() : undefined,
    });
  }
  return scenes.length > 0 ? scenes : undefined;
}

/** Szenen-Matrix (pro Kapitel) aus dem Request-Body. */
function asSceneMatrix(value: unknown): SceneConstraint[][] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => asScenes(entry) ?? []);
}

function asStoryboard(value: unknown): Storyboard {
  const obj = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (!obj || !Array.isArray(obj.chapters)) {
    throw new ApiError("Ungültiges Storyboard.", 400);
  }
  return value as Storyboard;
}

/** Liste nicht-leerer Strings aus dem Request-Body. */
function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Figuren-Referenzen (Name + Rolle) für die Kontinuitäts-Extraktion. */
function asCharacterRefs(value: unknown): { name: string; role?: string }[] {
  if (!Array.isArray(value)) return [];
  const list: { name: string; role?: string }[] = [];
  for (const entry of value) {
    const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) continue;
    const role = typeof item.role === "string" && item.role.trim() ? item.role.trim() : undefined;
    list.push({ name, role });
  }
  return list;
}

/** Kapitel-Texte für den gestreamten Fakten-Check. */
function asChapterTexts(value: unknown): { index: number; text: string }[] {
  if (!Array.isArray(value)) return [];
  const list: { index: number; text: string }[] = [];
  for (const entry of value) {
    const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const text = typeof item.text === "string" ? item.text.trim() : "";
    if (!text) continue;
    const index =
      typeof item.index === "number" ? item.index : Number.parseInt(String(item.index ?? ""), 10);
    list.push({ index: Number.isFinite(index) ? index : list.length, text });
  }
  return list;
}

/** Gemeldete Widersprüche (fact/quote/fix) aus dem Request-Body. */
function asCanonViolations(value: unknown): CanonViolation[] {
  if (!Array.isArray(value)) return [];
  const list: CanonViolation[] = [];
  for (const entry of value) {
    const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const fact = typeof item.fact === "string" ? item.fact.trim() : "";
    const quote = typeof item.quote === "string" ? item.quote.trim() : "";
    if (!fact || !quote) continue;
    list.push({
      fact,
      quote,
      fix: typeof item.fix === "string" ? item.fix.trim() : "",
      part: typeof item.part === "number" ? item.part : undefined,
    });
  }
  return list;
}

/** Bereits getrackte Welteneinträge (Titel + Kategorie) aus dem Request-Body. */function asKnownWorldEntries(value: unknown): { title: string; category: string }[] {
  if (!Array.isArray(value)) return [];
  const entries: { title: string; category: string }[] = [];
  for (const entry of value) {
    const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const title = typeof item.title === "string" ? item.title.trim() : "";
    if (!title) continue;
    const category = typeof item.category === "string" ? item.category.trim() : "";
    entries.push({ title, category });
  }
  return entries;
}

/** Manuskript-Kapitel (Titel + Text) aus dem Request-Body — leere Kapitel fallen weg. */
function asManuscriptChapters(value: unknown): { title: string; text: string }[] {
  if (!Array.isArray(value)) return [];
  const chapters: { title: string; text: string }[] = [];
  for (const entry of value) {
    const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const text = typeof item.text === "string" ? item.text.trim() : "";
    if (!text) continue;
    const title =
      typeof item.title === "string" && item.title.trim()
        ? item.title.trim()
        : `Kapitel ${chapters.length + 1}`;
    chapters.push({ title, text });
  }
  return chapters;
}

function asChapterIndex(value: unknown, count: number): number {
  const parsed = optionalInt(value, -1);
  if (parsed < 0 || parsed >= count) {
    throw new ApiError("Ungültiger Kapitel-Index.", 400);
  }
  return parsed;
}

function errorResponse(err: unknown): Response {
  const status = err instanceof ApiError ? err.status : 500;
  const message = err instanceof Error ? err.message : "Unbekannter Serverfehler.";
  console.error("[api]", message);
  return Response.json({ error: message }, { status });
}

/** Öffnet die App im Standard-Browser (Standalone-Feel; abschaltbar via AUTHORAI_OPEN=0). */
function openInBrowser(url: string): void {
  try {
    const options = { stdio: ["ignore", "ignore", "ignore"] as const };
    if (process.platform === "win32") {
      Bun.spawn(["cmd", "/c", "start", "", url], options);
    } else if (process.platform === "darwin") {
      Bun.spawn(["open", url], options);
    } else {
      Bun.spawn(["xdg-open", url], options);
    }
  } catch {
    // Browser-Start ist optional — Fehler dürfen den Server nicht stören.
  }
}

const server = serve({
  port: runtimePort(3000),
  // Lange Läufe (Chunk-Pässe, Ausbau, Cover-Varianten) dürfen nicht abgeschnitten werden.
  idleTimeout: 180,
  routes: {
    // Non-secret capability probe + configurable language options.
    "/api/config": {
      GET() {
        return Response.json(getPublicConfig());
      },
    },

    // Character generation powered by the promptgen engine.
    "/api/generate": {
      async POST(req) {
        try {
          const body = await readJson(req);
          const slug = requiredString(body.slug, "Bitte einen Charakter-Namen angeben.");
          const model = requiredString(body.model, "Bitte eine Model-ID angeben.");
          const language = optionalLanguage(body.language);
          const soul = await generateSoul({ slug, model, language });
          return Response.json({ soul });
        } catch (err) {
          return errorResponse(err);
        }
      },
    },

    // Stage 1: idea -> storyboard.
    "/api/storyboard": {
      async POST(req) {
        try {
          const body = await readJson(req);
          const idea = requiredString(body.idea, "Bitte eine Buchidee eingeben.");
          const model = requiredString(body.model, "Bitte eine Model-ID angeben.");
          const language = optionalLanguage(body.language);
          const chapters = optionalInt(body.chapters, 12);
          const storyboard = await generateStoryboard({
            idea,
            model,
            language,
            chapters,
            seriesContext: optionalString(body.seriesContext),
          });
          return Response.json({ storyboard });
        } catch (err) {
          return errorResponse(err);
        }
      },
    },

    // Streaming-Variante des Rohentwurfs: Textstücke kommen als SSE-Ereignisse.
    "/api/chapter/draft/stream": {
      async POST(req) {
        try {
          const body = await readJson(req);
          const storyboard = asStoryboard(body.storyboard);
          const chapterIndex = asChapterIndex(body.chapterIndex, storyboard.chapters.length);
          const model = requiredString(body.model, "Bitte eine Model-ID angeben.");
          const language = optionalLanguage(body.language);
          const input = {
            storyboard,
            chapterIndex,
            model,
            language,
            scenes: asScenes(body.scenes),
            canon: optionalString(body.canon),
          };
          return sseResponse(async (emit) => {
            const draft = await draftChapter(input, (delta) => emit({ type: "delta", text: delta }));
            emit({ type: "done", text: draft });
          });
        } catch (err) {
          return errorResponse(err);
        }
      },
    },

    // Streaming-Variante des Ausbaus.
    "/api/chapter/expand/stream": {
      async POST(req) {
        try {
          const body = await readJson(req);
          const storyboard = asStoryboard(body.storyboard);
          const chapterIndex = asChapterIndex(body.chapterIndex, storyboard.chapters.length);
          const model = requiredString(body.model, "Bitte eine Model-ID angeben.");
          const language = optionalLanguage(body.language);
          const input = {
            storyboard,
            chapterIndex,
            model,
            language,
            scenes: asScenes(body.scenes),
            canon: optionalString(body.canon),
            draft: typeof body.draft === "string" ? body.draft : "",
            targetWords: optionalInt(body.targetWords, 1200),
          };
          return sseResponse(async (emit) => {
            const expanded = await expandChapter(input, (delta) =>
              emit({ type: "delta", text: delta }),
            );
            emit({ type: "done", text: expanded });
          });
        } catch (err) {
          return errorResponse(err);
        }
      },
    },

    // Stage 2: storyboard -> ~500 word rough chapter.
    "/api/chapter/draft": {
      async POST(req) {
        try {
          const body = await readJson(req);
          const storyboard = asStoryboard(body.storyboard);
          const chapterIndex = asChapterIndex(body.chapterIndex, storyboard.chapters.length);
          const model = requiredString(body.model, "Bitte eine Model-ID angeben.");
          const language = optionalLanguage(body.language);
          const draft = await draftChapter({
            storyboard,
            chapterIndex,
            model,
            language,
            scenes: asScenes(body.scenes),
            canon: optionalString(body.canon),
          });
          return Response.json({ draft });
        } catch (err) {
          return errorResponse(err);
        }
      },
    },

    // Stage 3: rough chapter -> 3000-5000 word full chapter.
    "/api/chapter/expand": {
      async POST(req) {
        try {
          const body = await readJson(req);
          const storyboard = asStoryboard(body.storyboard);
          const chapterIndex = asChapterIndex(body.chapterIndex, storyboard.chapters.length);
          const model = requiredString(body.model, "Bitte eine Model-ID angeben.");
          const language = optionalLanguage(body.language);
          const draft = typeof body.draft === "string" ? body.draft : "";
          const targetWords = optionalInt(body.targetWords, 4000);
          const expanded = await expandChapter({
            storyboard,
            chapterIndex,
            model,
            language,
            draft,
            targetWords,
            scenes: asScenes(body.scenes),
            canon: optionalString(body.canon),
          });
          return Response.json({ expanded });
        } catch (err) {
          return errorResponse(err);
        }
      },
    },

    // Stage 4: coherence / logic pass.
    "/api/chapter/consistency": {
      async POST(req) {
        try {
          const body = await readJson(req);
          const storyboard = asStoryboard(body.storyboard);
          const chapterIndex = asChapterIndex(body.chapterIndex, storyboard.chapters.length);
          const model = requiredString(body.model, "Bitte eine Model-ID angeben.");
          const language = optionalLanguage(body.language);
          const text = typeof body.text === "string" ? body.text : "";
          if (!text.trim()) throw new ApiError("Kein Kapiteltext für die Prüfung.", 400);
          const result = await checkConsistency({
            storyboard,
            chapterIndex,
            model,
            language,
            text,
            scenes: asScenes(body.scenes),
            canon: optionalString(body.canon),
          });
          return Response.json(result);
        } catch (err) {
          return errorResponse(err);
        }
      },
    },

    // Stage 5: style / language pass.
    "/api/chapter/style": {
      async POST(req) {
        try {
          const body = await readJson(req);
          const storyboard = asStoryboard(body.storyboard);
          const chapterIndex = asChapterIndex(body.chapterIndex, storyboard.chapters.length);
          const model = requiredString(body.model, "Bitte eine Model-ID angeben.");
          const language = optionalLanguage(body.language);
          const text = typeof body.text === "string" ? body.text : "";
          if (!text.trim()) throw new ApiError("Kein Kapiteltext für die Prüfung.", 400);
          const result = await refineStyle({
            storyboard,
            chapterIndex,
            model,
            language,
            text,
            scenes: asScenes(body.scenes),
            canon: optionalString(body.canon),
            styleProfile: optionalString(body.styleProfile),
          });
          return Response.json(result);
        } catch (err) {
          return errorResponse(err);
        }
      },
    },

    // Timeline-Validierung über alle Kapitel/Szenen.
    "/api/timeline/check": {
      async POST(req) {
        try {
          const body = await readJson(req);
          const storyboard = asStoryboard(body.storyboard);
          const model = requiredString(body.model, "Bitte eine Model-ID angeben.");
          const language = optionalLanguage(body.language);
          const result = await checkTimeline({
            storyboard,
            scenesByChapter: asSceneMatrix(body.scenesByChapter),
            canon: optionalString(body.canon),
            model,
            language,
          });
          return Response.json(result);
        } catch (err) {
          return errorResponse(err);
        }
      },
    },

    // Worldbuilding extraction from an existing storyboard.
    "/api/world/extract": {
      async POST(req) {
        try {
          const body = await readJson(req);
          const storyboard = asStoryboard(body.storyboard);
          const model = requiredString(body.model, "Bitte eine Model-ID angeben.");
          const language = optionalLanguage(body.language);
          const knownEntries = asKnownWorldEntries(body.knownEntries);
          const world = await extractWorld({ storyboard, model, language, knownEntries });
          return Response.json({ world });
        } catch (err) {
          return errorResponse(err);
        }
      },
    },

    // Character extraction from the finished manuscript (finds figures the storyboard never knew).
    "/api/characters/extract": {
      async POST(req) {
        try {
          const body = await readJson(req);
          const model = requiredString(body.model, "Bitte eine Model-ID angeben.");
          const language = optionalLanguage(body.language);
          const bookTitle = typeof body.bookTitle === "string" ? body.bookTitle.trim() : "";
          const genre =
            typeof body.genre === "string" && body.genre.trim() ? body.genre.trim() : undefined;
          const chapters = asManuscriptChapters(body.chapters);
          const knownCharacters = Array.isArray(body.knownCharacters)
            ? body.knownCharacters.filter((name): name is string => typeof name === "string")
            : [];
          const characters = await extractCharacters({
            bookTitle,
            genre,
            chapters,
            knownCharacters,
            model,
            language,
          });
          return Response.json({ characters });
        } catch (err) {
          return errorResponse(err);
        }
      },
    },

    // Fact check against the canon only (separate from the coherence pass).
    "/api/continuity/check": {
      async POST(req) {
        try {
          const body = await readJson(req);
          const storyboard = asStoryboard(body.storyboard);
          const model = requiredString(body.model, "Bitte eine Model-ID angeben.");
          const language = optionalLanguage(body.language);
          const result = await checkCanon({
            storyboard,
            chapterIndex: optionalInt(body.chapterIndex, 0),
            text: typeof body.text === "string" ? body.text : "",
            canon: optionalString(body.canon) ?? "",
            model,
            language,
          });
          return Response.json(result);
        } catch (err) {
          return errorResponse(err);
        }
      },
    },

    // Streaming fact check: one SSE event per finished chapter (limited concurrency).
    "/api/continuity/check/stream": {
      async POST(req) {
        try {
          const body = await readJson(req);
          const storyboard = asStoryboard(body.storyboard);
          const model = requiredString(body.model, "Bitte eine Model-ID angeben.");
          const language = optionalLanguage(body.language);
          const chapters = asChapterTexts(body.chapters);
          if (chapters.length === 0) {
            throw new ApiError("Keine Kapitel mit Text für die Prüfung.", 400);
          }
          const canon = optionalString(body.canon) ?? "";
          // Vor dem Stream validieren — sonst käme der Fehler erst als SSE-Ereignis (HTTP 200).
          if (!canon.trim()) {
            throw new ApiError(
              "Kein Kanon vorhanden — bitte zuerst Fakten oder Beziehungen erfassen oder ableiten.",
              400,
            );
          }
          const input = {
            storyboard,
            chapters,
            canon,
            model,
            language,
            concurrency: optionalInt(body.concurrency, 3),
          };
          return sseResponse(async (emit) => {
            await checkCanonChapters(input, (event) => emit(event));
            emit({ type: "done" });
          });
        } catch (err) {
          return errorResponse(err);
        }
      },
    },

    // Quick fix: repair the reported canon contradictions in one chapter.
    "/api/continuity/repair": {
      async POST(req) {
        try {
          const body = await readJson(req);
          const storyboard = asStoryboard(body.storyboard);
          const model = requiredString(body.model, "Bitte eine Model-ID angeben.");
          const language = optionalLanguage(body.language);
          const text = typeof body.text === "string" ? body.text : "";
          if (!text.trim()) throw new ApiError("Kein Kapiteltext für die Korrektur.", 400);
          const result = await repairCanon({
            storyboard,
            chapterIndex: optionalInt(body.chapterIndex, 0),
            text,
            violations: asCanonViolations(body.violations),
            canon: optionalString(body.canon) ?? "",
            model,
            language,
          });
          return Response.json(result);
        } catch (err) {
          return errorResponse(err);
        }
      },
    },

    // Continuity extraction: facts + relations from storyboard and register.
    "/api/continuity/extract": {
      async POST(req) {
        try {
          const body = await readJson(req);
          const storyboard = asStoryboard(body.storyboard);
          const model = requiredString(body.model, "Bitte eine Model-ID angeben.");
          const language = optionalLanguage(body.language);
          const characters = asCharacterRefs(body.characters);
          const result = await extractContinuity({
            storyboard,
            characters,
            worldNames: asStringList(body.worldNames),
            knownStatements: asStringList(body.knownStatements),
            knownRelations: asStringList(body.knownRelations),
            model,
            language,
          });
          return Response.json(result);
        } catch (err) {
          return errorResponse(err);
        }
      },
    },

    // Research lookup via Tavily (server-side key).
    "/api/research": {
      async POST(req) {
        try {
          const body = await readJson(req);
          const query = requiredString(body.query, "Bitte einen Suchbegriff angeben.");
          const maxResults = optionalInt(body.maxResults, 5);
          const data = await runResearch(query, maxResults);
          return Response.json(data);
        } catch (err) {
          return errorResponse(err);
        }
      },
    },

    // Cover generation via Pollinations (server-side key).
    "/api/cover": {
      async POST(req) {
        try {
          const body = await readJson(req);
          const prompt = requiredString(body.prompt, "Bitte einen Cover-Prompt angeben.");
          const model =
            typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined;
          const width = optionalInt(body.width, 768);
          const height = optionalInt(body.height, 1024);
          const seed = optionalInt(body.seed, Math.floor(Math.random() * 1_000_000_000));
          const url = await generateCover({ prompt, model, width, height, seed });
          return Response.json({ url });
        } catch (err) {
          return errorResponse(err);
        }
      },
    },

    // Persist a client-composed cover PNG (text baked in) on the server.
    "/api/cover/save": {
      async POST(req) {
        try {
          const contentType = req.headers.get("content-type") ?? "";
          if (!contentType.startsWith("image/png")) {
            throw new ApiError("Erwartet image/png.", 400);
          }
          const buffer = new Uint8Array(await req.arrayBuffer());
          if (buffer.byteLength === 0) {
            throw new ApiError("Leeres Bild.", 400);
          }
          if (buffer.byteLength > 15 * 1024 * 1024) {
            throw new ApiError("Bild zu groß (max. 15 MB).", 413);
          }
          const url = await saveCoverImage(buffer);
          return Response.json({ url });
        } catch (err) {
          return errorResponse(err);
        }
      },
    },

    // Serve generated cover images.
    "/covers/:file": {
      async GET(req) {
        const file = req.params.file;
        if (!file || !/^[a-zA-Z0-9._-]+\.png$/.test(file)) {
          return new Response("Not found", { status: 404 });
        }
        const fileRef = Bun.file(path.join(coversDir(), file));
        if (!(await fileRef.exists())) {
          return new Response("Not found", { status: 404 });
        }
        return new Response(fileRef, {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      },
    },

    // Delete a generated cover image (avoids orphaned files).
    "/api/cover/:file": {
      async DELETE(req) {
        try {
          const file = req.params.file;
          if (!file || !/^[a-zA-Z0-9._-]+\.png$/.test(file)) {
            throw new ApiError("Ungültiger Dateiname.", 400);
          }
          await rm(path.join(coversDir(), file), { force: true });
          return Response.json({ ok: true });
        } catch (err) {
          return errorResponse(err);
        }
      },
    },

    // Serve the SPA for all unmatched routes.
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

const baseUrl = server.url.toString();

console.log("");
console.log("  AuthorAI");
console.log(`  → ${baseUrl}`);
console.log("  Daten bleiben lokal im Browser · Keys aus .env oder Umgebungsvariablen");
console.log("");

if (isStandaloneBinary() && process.env.AUTHORAI_OPEN !== "0") {
  openInBrowser(baseUrl);
}
