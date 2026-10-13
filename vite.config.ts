/// <reference types="vitest/config" />
import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * D&D Beyond's character API only answers its own origin (CORS), so the dev
 * and preview servers relay `/ddb-character/<id>` to it for "Import from
 * link". Nothing else is reachable through it, and no cookies are forwarded:
 * only public characters can be read.
 */
const ddbCharacterRelay: Record<string, ProxyOptions> = {
  "^/ddb-character/\\d+$": {
    target: "https://character-service.dndbeyond.com",
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/ddb-character\/(\d+)$/, "/character/v5/character/$1?includeCustomItems=true"),
    configure: (proxy) => {
      proxy.on("proxyReq", (request) => request.removeHeader("cookie"));
    },
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: ddbCharacterRelay },
  preview: { proxy: ddbCharacterRelay },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});
