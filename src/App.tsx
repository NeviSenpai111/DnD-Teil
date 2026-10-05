import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ImportButton } from "./components/common/ImportButton";
import { SourceToggle } from "./components/common/SourceToggle";
import { useMediaQuery } from "./components/common/useMediaQuery";
import { BrowseView } from "./components/browser/BrowseView";
import { BuildView } from "./components/builder/BuildView";
import { CharactersView } from "./components/characters/CharactersView";
import { SheetView } from "./components/sheet/SheetView";
import { useContentStore } from "./store/contentStore";

const NAV = [
  { to: "/browse", label: "Browse" },
  { to: "/build", label: "Build" },
  { to: "/characters", label: "Characters" },
];

export default function App() {
  const { pathname } = useLocation();
  const isDesktop = useMediaQuery("(min-width: 64rem)");
  // The content panel is a static column on desktop and a drawer below `lg`.
  // Opening records the current route, so navigating anywhere closes it.
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawerOpen = !isDesktop && drawerPath === pathname;
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!drawerOpen) return;
    const menuButton = menuButtonRef.current;
    closeButtonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerPath(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      menuButton?.focus();
    };
  }, [drawerOpen]);

  return (
    <div className="grid h-full grid-rows-[auto_1fr]">
      <header
        data-surface="dark"
        inert={drawerOpen}
        className="flex items-center gap-2 border-b border-blood/30 bg-blood px-2 py-2 text-parchment sm:gap-6 sm:px-4"
      >
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setDrawerPath(pathname)}
          aria-expanded={drawerOpen}
          aria-controls="content-panel"
          aria-label="Open content panel"
          className="grid h-9 w-9 shrink-0 place-items-center rounded hover:bg-white/15 lg:hidden"
        >
          <MenuIcon />
        </button>
        <span className="shrink-0 text-lg font-bold">
          <span aria-hidden="true">🐉</span> <span className="max-sm:sr-only">5eTools Builder</span>
        </span>
        <nav aria-label="Main" className="flex gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded px-2.5 py-1.5 text-sm font-medium sm:px-3 ${
                  isActive ? "bg-parchment text-blood" : "hover:bg-white/15"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <EditionSelect className="ml-auto hidden sm:flex" selectClassName="bg-parchment text-ink" />
      </header>

      <div className="grid overflow-hidden lg:grid-cols-[16rem_1fr]">
        {drawerOpen && (
          <div
            aria-hidden="true"
            onClick={() => setDrawerPath(null)}
            className="fixed inset-0 z-30 bg-ink/40"
          />
        )}
        <aside
          id="content-panel"
          aria-label="Content"
          // Visibility only transitions on close (to let the slide finish); on
          // open it must flip at once so the close button can take focus.
          className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col gap-4 overflow-y-auto border-r border-blood/20 bg-parchment p-3 shadow-xl motion-safe:duration-200 lg:static lg:z-auto lg:visible lg:w-auto lg:translate-x-0 lg:bg-parchment/40 lg:shadow-none ${
            drawerOpen
              ? "translate-x-0 motion-safe:transition-[translate]"
              : "invisible -translate-x-full motion-safe:transition-[translate,visibility]"
          }`}
        >
          <div className="flex items-center justify-between lg:hidden">
            <span className="font-bold text-blood">Content</span>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setDrawerPath(null)}
              aria-label="Close content panel"
              className="grid h-9 w-9 place-items-center rounded text-lg text-blood hover:bg-blood/10"
            >
              ✕
            </button>
          </div>
          <section>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-blood">
              Import content
            </h2>
            <ImportButton />
            <p className="mt-2 text-xs text-ink-muted">
              5eTools data files — classes, spells, items. To bring in a finished character
              from a D&amp;D Beyond PDF, use{" "}
              <Link to="/characters" className="text-blood underline">
                Characters → Import character
              </Link>
              .
            </p>
          </section>
          <section className="sm:hidden">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-blood">Rules</h2>
            <EditionSelect selectClassName="border border-ink/20 bg-white text-ink" />
          </section>
          <section>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-blood">Sources</h2>
            <SourceToggle />
          </section>
        </aside>

        <main inert={drawerOpen} className="min-w-0 overflow-hidden p-3 sm:p-4">
          <Routes>
            <Route path="/" element={<Navigate to="/browse" replace />} />
            <Route path="/browse" element={<BrowseView />} />
            <Route path="/build" element={<BuildView />} />
            <Route path="/characters" element={<CharactersView />} />
            <Route path="/sheet/:id" element={<SheetView />} />
            <Route path="*" element={<Navigate to="/browse" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

/** Content-wide rules edition; in the header from `sm` up, in the content panel below. */
function EditionSelect({ className = "flex", selectClassName }: { className?: string; selectClassName: string }) {
  const edition = useContentStore((s) => s.edition);
  const setEdition = useContentStore((s) => s.setEdition);

  return (
    <label className={`items-center gap-2 text-sm ${className}`}>
      Edition
      <select
        value={edition}
        onChange={(e) => setEdition(e.target.value as typeof edition)}
        className={`rounded px-2 py-1 ${selectClassName}`}
      >
        <option value="classic">Classic (2014)</option>
        <option value="one">One (2024)</option>
      </select>
    </label>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" d="M3 5h14M3 10h14M3 15h14" />
    </svg>
  );
}
