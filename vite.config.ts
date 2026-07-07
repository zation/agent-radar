import path from "node:path";
import type { IncomingMessage } from "node:http";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { createApiHandler } from "./src/api/handler.js";
import { createStaticRepository } from "./src/api/repository.js";
import { seedToolCards } from "./src/data/seed-tool-cards.js";
import { rateAllToolCards } from "./src/rating/engine.js";
import { buildSearchIndex } from "./src/search/index-builder.js";

const ratings = rateAllToolCards(seedToolCards);
const repository = createStaticRepository({
  cards: seedToolCards,
  ratings,
  index: buildSearchIndex(seedToolCards, ratings)
});
const handleApiRequest = createApiHandler(repository);

export default defineConfig({
  plugins: [react(), tailwindcss(), agentRadarApiDevPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src")
    }
  },
  build: {
    outDir: "dist-pages",
    emptyOutDir: true
  }
});

function agentRadarApiDevPlugin(): Plugin {
  return {
    name: "agent-radar-api-dev",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith("/api/")) {
          next();
          return;
        }

        void (async () => {
          try {
            const apiResponse = await handleApiRequest(await toFetchRequest(request));
            response.statusCode = apiResponse.status;
            apiResponse.headers.forEach((value, key) => response.setHeader(key, value));
            response.end(Buffer.from(await apiResponse.arrayBuffer()));
          } catch (error) {
            response.statusCode = 500;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ error: "dev_api_error", message: error instanceof Error ? error.message : "Unknown error" }));
          }
        })();
      });
    }
  };
}

async function toFetchRequest(request: IncomingMessage): Promise<Request> {
  const origin = `http://${request.headers.host ?? "127.0.0.1"}`;
  const url = new URL(request.url ?? "/", origin);
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  return new Request(url, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await readRequestBody(request)
  });
}

async function readRequestBody(request: IncomingMessage): Promise<ArrayBuffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const chunkValue = chunk as string | Uint8Array;
    chunks.push(typeof chunkValue === "string" ? Buffer.from(chunkValue) : Buffer.from(chunkValue));
  }
  const body = Buffer.concat(chunks);
  return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
}
