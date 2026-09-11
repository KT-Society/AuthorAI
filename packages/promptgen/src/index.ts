import { serve } from "bun";
import index from "./index.html";
import { loadRootEnv } from "./server/env";
import { getDefaultLanguage, getPublicConfig } from "./server/config";
import { ApiError, generateSoul } from "./server/api";

// Load API keys from the repository root `.env` (server-side only).
loadRootEnv();

interface GenerateBody {
  slug?: unknown;
  model?: unknown;
  language?: unknown;
}

// The root app defaults to 3000; promptgen uses 3001 so both can run together.
const port = Number(process.env.PORT ?? 3001);

const server = serve({
  port,
  routes: {
    // Non-secret capability probe + configurable language options.
    "/api/config": {
      GET() {
        return Response.json(getPublicConfig());
      },
    },

    // Server-side research + synthesis. Keys never leave the server.
    "/api/generate": {
      async POST(req) {
        let payload: GenerateBody;
        try {
          payload = (await req.json()) as GenerateBody;
        } catch {
          return Response.json({ error: "Ungültiger Request-Body." }, { status: 400 });
        }

        const slug = typeof payload.slug === "string" ? payload.slug.trim() : "";
        if (!slug) {
          return Response.json({ error: "Bitte einen Character-Slug angeben." }, { status: 400 });
        }

        // The model is a free-form OpenRouter ID supplied by the client.
        const model = typeof payload.model === "string" ? payload.model.trim() : "";
        if (!model) {
          return Response.json({ error: "Bitte eine Model-ID angeben." }, { status: 400 });
        }

        const language =
          typeof payload.language === "string" && payload.language.trim()
            ? payload.language.trim()
            : getDefaultLanguage();

        try {
          const soul = await generateSoul({ slug, model, language });
          return Response.json({ soul });
        } catch (err) {
          const status = err instanceof ApiError ? err.status : 500;
          const message = err instanceof Error ? err.message : "Unbekannter Serverfehler.";
          console.error("[api/generate]", message);
          return Response.json({ error: message }, { status });
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

console.log(`🚀 Canon-Slug Generator running at ${server.url}`);
