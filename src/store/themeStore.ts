/**
 * Appearance preferences: the colour scheme and frosted glass. Both live on
 * <html> as `data-theme` / `data-glass` (see index.css) and in localStorage,
 * which the inline script in index.html reads before first paint.
 */
import { create } from "zustand";

/** Colour schemes, in picker order; their tokens live in index.css. */
export const SCHEMES = [
  { id: "codex", name: "Codex", tone: "light" },
  { id: "legacy", name: "Legacy", tone: "light" },
  { id: "solarized", name: "Solarized Light", tone: "light" },
  { id: "nord", name: "Nord", tone: "dark" },
  { id: "gruvbox", name: "Gruvbox", tone: "dark" },
  { id: "catppuccin", name: "Catppuccin Mocha", tone: "dark" },
] as const;

export type SchemeId = (typeof SCHEMES)[number]["id"];

export const SCHEME_KEY = "builder.scheme";
export const GLASS_KEY = "builder.glass";

function isScheme(value: unknown): value is SchemeId {
  return SCHEMES.some((s) => s.id === value);
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the choice still applies for this visit.
  }
}

function apply(scheme: SchemeId, glass: boolean) {
  const root = document.documentElement;
  root.dataset.theme = scheme;
  root.dataset.glass = glass ? "on" : "off";
  // Match the mobile browser chrome to the new canvas.
  const canvas = getComputedStyle(root).getPropertyValue("--color-canvas").trim();
  if (canvas) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", canvas);
}

interface ThemeState {
  scheme: SchemeId;
  glass: boolean;
  setScheme: (scheme: SchemeId) => void;
  setGlass: (glass: boolean) => void;
}

const stored = read(SCHEME_KEY);
const initialScheme: SchemeId = isScheme(stored) ? stored : "codex";
const initialGlass = read(GLASS_KEY) !== "off";
apply(initialScheme, initialGlass);

export const useThemeStore = create<ThemeState>((set, get) => ({
  scheme: initialScheme,
  glass: initialGlass,
  setScheme: (scheme) => {
    write(SCHEME_KEY, scheme);
    apply(scheme, get().glass);
    set({ scheme });
  },
  setGlass: (glass) => {
    write(GLASS_KEY, glass ? "on" : "off");
    apply(get().scheme, glass);
    set({ glass });
  },
}));
