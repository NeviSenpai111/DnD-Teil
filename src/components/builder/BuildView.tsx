import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useCharacterStore } from "../../store/characterStore";
import { useContentStore, selectActiveEntities } from "../../store/contentStore";
import { deriveFromCharacter } from "../../store/selectors";
import { characterLevel } from "../../model/character";
import { speciesLabel } from "../../engine/edition";
import { PageHome } from "./PageHome";
import { PageClass } from "./PageClass";
import { PageBackground } from "./PageBackground";
import { PageSpecies } from "./PageSpecies";
import { PageAbilities } from "./PageAbilities";
import { PageEquipment } from "./PageEquipment";
import { PageWhatsNext } from "./PageWhatsNext";

/**
 * D&D-Beyond-style builder: a dark tab bar (Home · 1. Class · 2. Background ·
 * 3. Species · 4. Abilities · 5. Equipment · What's Next), a character-name
 * header shared by every page, and prev/next arrows on the content edges.
 */
export function BuildView() {
  const draft = useCharacterStore((s) => s.draft);
  const hasContent = useContentStore((s) => selectActiveEntities(s).length > 0);
  const [pageId, setPageId] = useState("home");

  const pages: { id: string; label: string; num?: number; el: (goTo: (id: string) => void) => ReactNode }[] = [
    { id: "home", label: "Home", el: (goTo) => <PageHome goTo={goTo} /> },
    { id: "class", label: "Class", num: 1, el: () => <PageClass /> },
    { id: "background", label: "Background", num: 2, el: () => <PageBackground /> },
    { id: "species", label: speciesLabel(draft.edition), num: 3, el: () => <PageSpecies /> },
    { id: "abilities", label: "Abilities", num: 4, el: () => <PageAbilities /> },
    { id: "equipment", label: "Equipment", num: 5, el: () => <PageEquipment /> },
    { id: "next", label: "What's Next", el: (goTo) => <PageWhatsNext goTo={goTo} /> },
  ];
  const current = Math.max(0, pages.findIndex((p) => p.id === pageId));
  const goTo = (id: string) => setPageId(id);

  if (!hasContent) {
    return (
      <div className="grid h-full place-items-center text-center text-ink/60">
        <div>
          <p className="text-lg font-semibold">No content imported</p>
          <p className="text-sm">Import a 5eTools file (or load the sample) to start building.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded border border-blood/20">
      {/* dark builder bar: title + page tabs + quick actions */}
      <div className="bg-ink px-4 pt-2 text-parchment">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-sm font-bold leading-tight">Character Builder</div>
            <div className="text-xs text-parchment/60">{draft.name}</div>
          </div>
          <HeaderActions />
        </div>
        <nav className="mt-1 flex flex-wrap gap-1 text-xs font-bold uppercase tracking-wide">
          {pages.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPageId(p.id)}
              className={`border-b-2 px-2 py-2 ${
                i === current
                  ? "border-parchment text-parchment"
                  : "border-transparent text-parchment/60 hover:text-parchment"
              }`}
            >
              {p.num != null ? `${p.num}. ` : ""}
              {p.label}
              {p.id === "next" ? " ▸" : ""}
            </button>
          ))}
        </nav>
      </div>

      {/* content with side prev/next arrows */}
      <div className="relative flex-1 overflow-hidden bg-parchment/60">
        {current > 0 && (
          <PagerArrow side="left" onClick={() => setPageId(pages[current - 1].id)} />
        )}
        {current < pages.length - 1 && (
          <PagerArrow side="right" onClick={() => setPageId(pages[current + 1].id)} />
        )}
        <div className="h-full overflow-y-auto">
          <div className="mx-auto max-w-3xl px-12 py-6">
            <CharacterNameHeader />
            {pages[current].el(goTo)}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Avatar + editable character name, shown at the top of every page. */
function CharacterNameHeader() {
  const draft = useCharacterStore((s) => s.draft);
  const setName = useCharacterStore((s) => s.setName);
  const initials = draft.name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="mb-6 flex items-center gap-4 border-b border-blood/15 pb-4">
      <div
        className="grid h-16 w-16 shrink-0 place-items-center rounded border-2 border-dashed border-ink/30 bg-ink/5 text-xl font-bold text-ink/50"
        aria-hidden
      >
        {initials || "+"}
      </div>
      <label className="min-w-0 flex-1">
        <span className="block text-sm font-bold">Character Name</span>
        <input
          value={draft.name}
          onChange={(e) => setName(e.target.value)}
          className="mt-0.5 block w-full max-w-sm rounded border border-ink/20 bg-white px-2 py-1.5 text-sm"
        />
      </label>
    </div>
  );
}

/** Level/HP/AC chips + Save + Full view, right-aligned in the dark bar. */
function HeaderActions() {
  const draft = useCharacterStore((s) => s.draft);
  const index = useContentStore((s) => s.index);
  const saveDraftToLibrary = useCharacterStore((s) => s.saveDraftToLibrary);
  const [savedNote, setSavedNote] = useState(false);
  const derived = deriveFromCharacter(draft, index);

  return (
    <div className="ml-auto flex items-center gap-2 text-xs">
      <span className="hidden gap-2 sm:flex">
        <Stat label="LVL" value={characterLevel(draft)} />
        <Stat label="HP" value={derived.maxHp ?? "—"} />
        <Stat label="AC" value={derived.ac} />
      </span>
      <button
        type="button"
        onClick={() => {
          saveDraftToLibrary();
          setSavedNote(true);
          setTimeout(() => setSavedNote(false), 1500);
        }}
        className="rounded bg-blood px-2.5 py-1 font-bold uppercase tracking-wide text-parchment hover:bg-blood-light"
      >
        {savedNote ? "Saved ✓" : "Save"}
      </button>
      <Link
        to="/sheet/draft"
        className="rounded border border-parchment/40 px-2.5 py-1 font-bold uppercase tracking-wide text-parchment hover:bg-white/10"
      >
        Sheet ↗
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="rounded bg-white/10 px-2 py-1">
      <span className="text-parchment/60">{label}</span>{" "}
      <span className="font-bold">{value}</span>
    </span>
  );
}

function PagerArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous page" : "Next page"}
      className={`absolute top-1/2 z-10 grid h-10 w-8 -translate-y-1/2 place-items-center rounded bg-blood/80 text-lg font-bold text-parchment shadow hover:bg-blood ${
        side === "left" ? "left-1" : "right-1"
      }`}
    >
      {side === "left" ? "‹" : "›"}
    </button>
  );
}
