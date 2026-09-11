import { serve } from "bun";
import index from "./index.html";
import { loadRootEnv } from "@promptgen/server/env";
import { getDefaultLanguage, getPublicConfig } from "@promptgen/server/config";
import { ApiError, generateSoul } from "@promptgen/server/api";

import { rm } from "node:fs/promises";
import path from "node:path";

import type { Storyboard } from "./data/story";
import { coversDir, generateCover, saveCoverImage } from "./server/cover";
import { runResearch } from "./server/research";
import {
  checkConsistency,
  draftChapter,
  expandChapter,
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

function optionalInt(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asStoryboard(value: unknown): Storyboard {
  const obj = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (!obj || !Array.isArray(obj.chapters)) {
    throw new ApiError("Ungültiges Storyboard.", 400);
  }
  return value as Storyboard;
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

const server = serve({
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
          const storyboard = await generateStoryboard({ idea, model, language, chapters });
          return Response.json({ storyboard });
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
          const draft = await draftChapter({ storyboard, chapterIndex, model, language });
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
          const result = await checkConsistency({ storyboard, chapterIndex, model, language, text });
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
          const result = await refineStyle({ storyboard, chapterIndex, model, language, text });
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
          const world = await extractWorld({ storyboard, model, language });
          return Response.json({ world });
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

console.log(`🚀 AuthorAI running at ${server.url}`);
