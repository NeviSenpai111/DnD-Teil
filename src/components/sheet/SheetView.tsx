import { Link, useParams } from "react-router-dom";
import { useCharacterStore } from "../../store/characterStore";
import { downloadCharacterJson } from "../../data/exportCharacter";
import { EmptyState } from "../common/EmptyState";
import { Icon } from "../common/Icon";
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
      <EmptyState
        title="Character not found"
        icon="users"
        actions={
          <Link to="/characters" className="btn btn-secondary">
            <Icon name="arrow-left" />
            Back to characters
          </Link>
        }
      >
        It may have been deleted, or the link points at another browser's library.
      </EmptyState>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-4 pb-8">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2 print:hidden">
        <Link to="/characters" className="btn btn-ghost btn-sm -ml-2.5">
          <Icon name="arrow-left" className="h-3.5 w-3.5" />
          Characters
        </Link>
        <Link to="/build" className="btn btn-ghost btn-sm">
          <Icon name="edit" className="h-3.5 w-3.5" />
          Edit in builder
        </Link>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => downloadCharacterJson(character)}
            className="btn btn-secondary btn-sm"
          >
            <Icon name="download" className="h-3.5 w-3.5 text-ink-muted" />
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="btn btn-secondary btn-sm"
          >
            <Icon name="print" className="h-3.5 w-3.5 text-ink-muted" />
            Print
          </button>
        </div>
      </div>

      <div id="printable-sheet">
        <FullSheet character={character} />
      </div>
      </div>
    </div>
  );
}
