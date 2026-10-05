import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Icon } from "./components/common/Icon";
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
        inert={drawerOpen}
        className="flex h-14 items-center gap-2 border-b border-line bg-surface px-2 sm:gap-4 sm:px-4"
      >
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setDrawerPath(pathname)}
          aria-expanded={drawerOpen}
          aria-controls="content-panel"
          aria-label="Open content panel"
          className="btn btn-ghost btn-icon lg:hidden"
        >
          <Icon name="menu" className="h-5 w-5" />
        </button>
        <span className="flex shrink-0 items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-on-accent shadow-sm">
            <Icon name="sigil" className="h-5 w-5" />
          </span>
          <span className="text-[0.9375rem] font-semibold tracking-tight max-sm:sr-only">5eTools Builder</span>
        </span>
        <nav aria-label="Main" className="segmented sm:ml-2">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <EditionSelect className="ml-auto hidden sm:flex" />
      </header>

      <div className="grid overflow-hidden lg:grid-cols-[17rem_1fr]">
        {drawerOpen && (
          <div
            aria-hidden="true"
            onClick={() => setDrawerPath(null)}
            className="fixed inset-0 z-30 animate-fade-in bg-ink/30"
          />
        )}
        <aside
          id="content-panel"
          aria-label="Content"
          // Visibility only transitions on close (to let the slide finish); on
          // open it must flip at once so the close button can take focus.
          className={`fixed inset-y-0 left-0 z-40 flex w-80 max-w-[calc(100vw-3rem)] flex-col overflow-y-auto border-r border-line bg-surface-sunk shadow-xl motion-safe:duration-(--duration-settle) motion-safe:ease-spring lg:static lg:z-auto lg:visible lg:w-auto lg:max-w-none lg:translate-x-0 lg:shadow-none ${
            drawerOpen
              ? "translate-x-0 motion-safe:transition-[translate]"
              : "invisible -translate-x-full motion-safe:transition-[translate,visibility]"
          }`}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4 lg:hidden">
            <span className="text-sm font-semibold">Content</span>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setDrawerPath(null)}
              aria-label="Close content panel"
              className="btn btn-ghost btn-icon"
            >
              <Icon name="close" className="h-5 w-5" />
            </button>
          </div>
          <section className="p-4">
            <h2 className="eyebrow mb-3">Import content</h2>
            <ImportButton />
            <p className="mt-3 text-xs leading-relaxed text-ink-muted">
              5eTools data files: classes, spells, items. To bring in a finished character
              from a D&amp;D Beyond PDF, use{" "}
              <Link to="/characters" className="font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent">
                Characters → Import character
              </Link>
              .
            </p>
          </section>
          <section className="border-t border-line p-4 sm:hidden">
            <h2 className="eyebrow mb-3">Rules</h2>
            <EditionSelect />
          </section>
          <section className="border-t border-line p-4">
            <h2 className="eyebrow mb-3">Sources</h2>
            <SourceToggle />
          </section>
        </aside>

        <main inert={drawerOpen} className="min-w-0 overflow-hidden p-3 sm:p-4 lg:p-6">
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
function EditionSelect({ className = "flex" }: { className?: string }) {
  const edition = useContentStore((s) => s.edition);
  const setEdition = useContentStore((s) => s.setEdition);

  return (
    <label className={`items-center gap-2 text-sm text-ink-muted ${className}`}>
      Edition
      <select
        value={edition}
        onChange={(e) => setEdition(e.target.value as typeof edition)}
        className="field w-auto font-medium"
      >
        <option value="classic">Classic (2014)</option>
        <option value="one">One (2024)</option>
      </select>
    </label>
  );
}
