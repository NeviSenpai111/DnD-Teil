/// <reference types="vitest/config" />
import { createHash } from "node:crypto";
import { defineConfig, type Plugin, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Content-Security-Policy for the built app, as a <meta> tag so it works on any
 * static host. Imported homebrew is rendered as text, so this is a second
 * line: if something ever did inject markup, no script but the app's own runs.
 * Homebrew images may live on any https host. Build-only, because the dev
 * server's hot reload relies on inline scripts.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        // Allow the inline scripts index.html ships with (the theme pre-paint), by hash.
        const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
          ([, code]) => `'sha256-${createHash("sha256").update(code).digest("base64")}'`,
        );
        const policy = [
          "default-src 'self'",
          `script-src 'self' ${inline.join(" ")}`.trim(),
          "style-src 'self'",
          "img-src 'self' data: blob: https:",
          "font-src 'self'",
          "connect-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; ");
        return [
          { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: policy }, injectTo: "head-prepend" },
        ];
      },
    },
  };
}

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
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  server: { proxy: ddbCharacterRelay },
  preview: { proxy: ddbCharacterRelay },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});
