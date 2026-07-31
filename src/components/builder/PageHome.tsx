import { useCharacterStore } from "../../store/characterStore";
import { speciesLabel } from "../../engine/edition";

/** The builder's landing page: name, rules edition, and where to go next. */
export function PageHome({ goTo }: { goTo: (id: string) => void }) {
  const draft = useCharacterStore((s) => s.draft);
  const setEdition = useCharacterStore((s) => s.setEdition);
  const newDraft = useCharacterStore((s) => s.newDraft);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-ink">Character Builder</h2>
        <p className="mt-1 text-sm text-ink/70">
          Work through the numbered tabs above — Class, Background, {speciesLabel(draft.edition)},
          Abilities and Equipment — in any order. Every choice updates the live sheet.
        </p>
      </div>

      <label className="block max-w-md">
        <span className="text-sm font-semibold">Rules edition</span>
        <select
          value={draft.edition}
          onChange={(e) => setEdition(e.target.value as typeof draft.edition)}
          className="mt-1 block w-full rounded border border-ink/20 bg-white px-2 py-2 text-sm"
        >
          <option value="classic">Classic (2014) — ability scores from your race</option>
          <option value="one">One (2024) — ability scores from your background</option>
        </select>
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => goTo("class")}
          className="rounded bg-blood px-4 py-2 text-sm font-bold uppercase tracking-wide text-parchment hover:bg-blood-light"
        >
          Start: Choose a Class →
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Start over with a blank character?")) newDraft();
          }}
          className="rounded border border-blood px-4 py-2 text-sm font-semibold text-blood hover:bg-blood/10"
        >
          New Character
        </button>
      </div>
    </div>
  );
}
