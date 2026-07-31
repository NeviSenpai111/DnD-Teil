import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { ImportButton } from "./components/common/ImportButton";
import { SourceToggle } from "./components/common/SourceToggle";
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
  const edition = useContentStore((s) => s.edition);
  const setEdition = useContentStore((s) => s.setEdition);

  return (
    <div className="grid h-full grid-rows-[auto_1fr]">
      <header className="flex items-center gap-6 border-b border-blood/30 bg-blood px-4 py-2 text-parchment">
        <span className="text-lg font-bold">🐉 5eTools Builder</span>
        <nav className="flex gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded px-3 py-1 text-sm font-medium ${
                  isActive ? "bg-parchment text-blood" : "hover:bg-white/15"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <label className="ml-auto flex items-center gap-2 text-sm">
          Edition
          <select
            value={edition}
            onChange={(e) => setEdition(e.target.value as typeof edition)}
            className="rounded bg-parchment px-2 py-1 text-ink"
          >
            <option value="classic">Classic (2014)</option>
            <option value="one">One (2024)</option>
          </select>
        </label>
      </header>

      <div className="grid grid-cols-[16rem_1fr] overflow-hidden">
        <aside className="flex flex-col gap-4 overflow-y-auto border-r border-blood/20 bg-parchment/40 p-3">
          <section>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-blood">Import</h2>
            <ImportButton />
          </section>
          <section>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-blood">Sources</h2>
            <SourceToggle />
          </section>
        </aside>

        <main className="overflow-hidden p-4">
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
