import { Link, useParams } from "react-router-dom";
import { useCharacterStore } from "../../store/characterStore";
import { downloadCharacterJson } from "../../data/exportCharacter";
import { FullSheet } from "./FullSheet";

/**
 * Full-page view of a single character sheet (as opposed to the narrow sidebar
 * in the builder). `:id` is a saved-character id, or `draft` for the working
 * draft.
 */
export function SheetView() {
  const { id } = useParams();
  const draft = useCharacterStore((s) => s.draft);
  const saved = useCharacterStore((s) => s.saved);

  const character =
    id === "draft" || id === draft.id ? draft : saved.find((c) => c.id === id);

  if (!character) {
    return (
      <div className="grid h-full place-items-center text-center text-ink/60">
        <div>
          <p className="text-lg font-semibold">Character not found</p>
          <Link to="/characters" className="text-sm text-blood underline">
            ← Back to characters
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto h-full max-w-6xl space-y-3 overflow-y-auto">
      <div className="flex items-center gap-2 print:hidden">
        <Link to="/characters" className="text-sm text-blood underline">
          ← Characters
        </Link>
        <Link to="/build" className="text-sm text-blood underline">
          Edit in builder
        </Link>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => downloadCharacterJson(character)}
            className="rounded border border-blood px-3 py-1 text-sm text-blood hover:bg-blood/10"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded border border-blood px-3 py-1 text-sm text-blood hover:bg-blood/10"
          >
            Print
          </button>
        </div>
      </div>

      <div id="printable-sheet">
        <FullSheet character={character} />
      </div>
    </div>
  );
}
