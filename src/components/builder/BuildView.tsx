import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useCharacterStore } from "../../store/characterStore";
import { useContentStore, selectActiveEntities } from "../../store/contentStore";
import { deriveFromCharacter } from "../../store/selectors";
import { characterLevel } from "../../model/character";
import { speciesLabel } from "../../engine/edition";
import { EmptyState } from "../common/EmptyState";
import { LoadSampleButton } from "../common/ImportButton";
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
  const prev = current > 0 ? pages[current - 1] : undefined;
  const next = current < pages.length - 1 ? pages[current + 1] : undefined;
  const tabLabel = (p: (typeof pages)[number]) => `${p.num != null ? `${p.num}. ` : ""}${p.label}`;

  const tabsRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const goTo = (id: string) => {
    setPageId(id);
    scrollRef.current?.scrollTo?.({ top: 0 });
  };

  // Keep the active step visible when the tab strip scrolls (narrow screens).
  useEffect(() => {
    tabsRef.current
      ?.querySelector<HTMLElement>('[aria-current="step"]')
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [current]);

  if (!hasContent) {
    return (
      <EmptyState title="No content imported" actions={<LoadSampleButton />}>
        The builder needs classes, backgrounds and species to choose from. Load the bundled sample,
        or import your own 5eTools files from the Import content panel.
      </EmptyState>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded border border-blood/20">
      {/* dark builder bar: title + page tabs + quick actions */}
      <div data-surface="dark" className="bg-ink px-3 pt-2 text-parchment sm:px-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <h1 className="text-sm font-bold leading-tight">Character Builder</h1>
            <div className="truncate text-xs text-parchment/70">{draft.name}</div>
          </div>
          <HeaderActions />
        </div>
        <nav
          ref={tabsRef}
          aria-label="Builder steps"
          className="-mx-3 mt-1 flex gap-1 overflow-x-auto px-3 text-xs font-bold uppercase tracking-wide sm:-mx-4 sm:px-4"
        >
          {pages.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => goTo(p.id)}
              aria-current={i === current ? "step" : undefined}
              className={`shrink-0 whitespace-nowrap border-b-2 px-2 py-2 ${
                i === current
                  ? "border-parchment text-parchment"
                  : "border-transparent text-parchment/70 hover:text-parchment"
              }`}
            >
              {tabLabel(p)}
              {p.id === "next" ? " ▸" : ""}
            </button>
          ))}
        </nav>
      </div>

      {/* content with side prev/next arrows (md+) or a footer pager (narrow) */}
      <div className="relative flex-1 overflow-hidden bg-parchment/60">
        {prev && <PagerArrow side="left" target={tabLabel(prev)} onClick={() => goTo(prev.id)} />}
        {next && <PagerArrow side="right" target={tabLabel(next)} onClick={() => goTo(next.id)} />}
        <div ref={scrollRef} className="h-full overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 md:px-12 md:py-6">
            <CharacterNameHeader />
            {pages[current].el(goTo)}
            <nav
              aria-label="Step navigation"
              className="mt-8 flex justify-between gap-2 border-t border-blood/15 pt-4 md:hidden"
            >
              {prev ? (
                <button
                  type="button"
                  onClick={() => goTo(prev.id)}
                  className="rounded border border-blood/40 px-3 py-2 text-sm font-semibold text-blood hover:bg-blood/10"
                >
                  ‹ {tabLabel(prev)}
                </button>
              ) : (
                <span />
              )}
              {next && (
                <button
                  type="button"
                  onClick={() => goTo(next.id)}
                  className="rounded bg-blood px-3 py-2 text-sm font-semibold text-parchment hover:bg-blood-light"
                >
                  {tabLabel(next)} ›
                </button>
              )}
            </nav>
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
    <div className="mb-6 flex items-center gap-3 border-b border-blood/15 pb-4 sm:gap-4">
      <div
        className="grid h-12 w-12 shrink-0 place-items-center rounded border-2 border-dashed border-ink/30 bg-ink/5 text-lg font-bold text-ink-muted sm:h-16 sm:w-16 sm:text-xl"
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

  useEffect(() => {
    if (!savedNote) return;
    const timer = setTimeout(() => setSavedNote(false), 1500);
    return () => clearTimeout(timer);
  }, [savedNote]);

  return (
    <div className="ml-auto flex shrink-0 items-center gap-2 text-xs">
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
        }}
        className="rounded bg-blood px-2.5 py-1 font-bold uppercase tracking-wide text-parchment hover:bg-blood-light"
      >
        {savedNote ? "Saved ✓" : "Save"}
      </button>
      <span role="status" className="sr-only">
        {savedNote ? `${draft.name} saved to your characters.` : ""}
      </span>
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
      <span className="text-parchment/70">{label}</span>{" "}
      <span className="font-bold">{value}</span>
    </span>
  );
}

function PagerArrow({ side, target, onClick }: { side: "left" | "right"; target: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${side === "left" ? "Previous" : "Next"} step: ${target}`}
      title={target}
      className={`absolute top-1/2 z-10 hidden h-10 w-8 -translate-y-1/2 place-items-center rounded bg-blood/80 text-lg font-bold text-parchment shadow-sm hover:bg-blood md:grid ${
        side === "left" ? "left-1" : "right-1"
      }`}
    >
      {side === "left" ? "‹" : "›"}
    </button>
  );
}
