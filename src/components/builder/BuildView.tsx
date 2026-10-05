import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useCharacterStore } from "../../store/characterStore";
import { useContentStore, selectActiveEntities } from "../../store/contentStore";
import { deriveFromCharacter } from "../../store/selectors";
import { characterLevel } from "../../model/character";
import { speciesLabel } from "../../engine/edition";
import { EmptyState } from "../common/EmptyState";
import { Icon } from "../common/Icon";
import { LoadSampleButton } from "../common/ImportButton";
import { PageHome } from "./PageHome";
import { PageClass } from "./PageClass";
import { PageBackground } from "./PageBackground";
import { PageSpecies } from "./PageSpecies";
import { PageAbilities } from "./PageAbilities";
import { PageEquipment } from "./PageEquipment";
import { PageWhatsNext } from "./PageWhatsNext";

/**
 * D&D-Beyond-style builder: a tab bar (Home · 1. Class · 2. Background ·
 * 3. Species · 4. Abilities · 5. Equipment · What's Next), a character-name
 * header shared by every page, and a prev/next pager row under the content.
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
      <EmptyState title="No content imported" icon="sigil" actions={<LoadSampleButton />}>
        The builder needs classes, backgrounds and species to choose from. Load the bundled sample,
        or import your own 5eTools files from the Import content panel.
      </EmptyState>
    );
  }

  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      {/* builder bar: title + live readouts + page tabs */}
      <div className="border-b border-line">
        <div className="flex items-center gap-3 px-4 pt-3 sm:px-5">
          <div className="min-w-0">
            <h1 className="eyebrow">Character Builder</h1>
            <DraftTitle />
          </div>
          <HeaderActions />
        </div>
        <nav
          ref={tabsRef}
          aria-label="Builder steps"
          className="mt-1.5 flex gap-0.5 overflow-x-auto px-2 sm:px-3"
        >
          {pages.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => goTo(p.id)}
              aria-current={i === current ? "step" : undefined}
              className="tab"
            >
              {tabLabel(p)}
            </button>
          ))}
        </nav>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div key={pages[current].id} className="mx-auto max-w-[46rem] animate-settle-in px-4 py-6 sm:px-8 md:py-8">
          <CharacterNameHeader />
          {pages[current].el(goTo)}
        </div>
      </div>

      {/* step pager: its own row, never over the content */}
      <nav
        aria-label="Step navigation"
        className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-t border-line bg-surface-sunk px-2 py-2 sm:px-3"
      >
        <span>
          {prev && (
            <button
              type="button"
              onClick={() => goTo(prev.id)}
              aria-label={`Back: ${tabLabel(prev)}`}
              className="btn btn-ghost max-w-full max-sm:px-2.5"
            >
              <Icon name="chevron-left" />
              <span className="truncate max-sm:hidden">{`Back: ${tabLabel(prev)}`}</span>
            </button>
          )}
        </span>
        <span className="flex items-center gap-1" aria-hidden="true">
          {pages.map((p, i) => (
            <span
              key={p.id}
              className={`h-1.5 rounded-full transition-all duration-300 ease-snap ${
                i === current ? "w-4 bg-accent" : i < current ? "w-1.5 bg-ink-faint" : "w-1.5 bg-line-strong"
              }`}
            />
          ))}
        </span>
        <span className="flex justify-end">
          {next && (
            <button
              type="button"
              onClick={() => goTo(next.id)}
              aria-label={`Next: ${tabLabel(next)}`}
              className="btn btn-primary max-w-full"
            >
              <span className="truncate max-sm:hidden">{`Next: ${tabLabel(next)}`}</span>
              <span className="sm:hidden">Next</span>
              <Icon name="chevron-right" />
            </button>
          )}
        </span>
      </nav>
    </div>
  );
}

/** Draft name with a live "unsaved" marker while it differs from the library copy. */
function DraftTitle() {
  const draft = useCharacterStore((s) => s.draft);
  const savedCopy = useCharacterStore((s) => s.saved.find((c) => c.id === s.draft.id));
  const unsaved = !savedCopy || savedCopy.updatedAt !== draft.updatedAt;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate text-base font-semibold tracking-tight">{draft.name}</span>
      {unsaved && (
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-2xs text-ink-muted">
          <span className="pulse-dot h-1.5 w-1.5 text-accent" aria-hidden="true" />
          Unsaved
        </span>
      )}
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
    <div className="mb-8 flex items-end gap-4 border-b border-line pb-6">
      <div
        className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-line bg-surface-sunk font-mono text-lg font-medium text-ink-muted sm:h-16 sm:w-16 sm:text-xl"
        aria-hidden
      >
        {initials || <Icon name="plus" className="h-5 w-5" />}
      </div>
      <label className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink-muted">Character Name</span>
        <input
          value={draft.name}
          onChange={(e) => setName(e.target.value)}
          className="field mt-1.5 w-full max-w-sm text-base font-medium"
        />
      </label>
    </div>
  );
}

/** Level/HP/AC readouts + Save + Sheet, right-aligned in the builder bar. */
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
    <div className="ml-auto flex shrink-0 items-center gap-2">
      <span className="mr-1 hidden items-center gap-1.5 md:flex">
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
        className="btn btn-primary btn-sm"
      >
        {savedNote ? (
          <>
            <Icon name="check" />
            Saved
          </>
        ) : (
          "Save"
        )}
      </button>
      <span role="status" className="sr-only">
        {savedNote ? `${draft.name} saved to your characters.` : ""}
      </span>
      <Link to="/sheet/draft" className="btn btn-secondary btn-sm">
        Sheet
        <Icon name="arrow-up-right" className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="flex items-baseline gap-1.5 rounded-md border border-line bg-surface-sunk px-2 py-1 font-mono text-xs">
      <span className="text-2xs text-ink-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </span>
  );
}
