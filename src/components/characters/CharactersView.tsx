import { Link, useNavigate } from "react-router-dom";
import { useCharacterStore } from "../../store/characterStore";
import { downloadCharacterJson } from "../../data/exportCharacter";
import { characterLevel } from "../../model/character";
import { ImportCharacterButton } from "./ImportCharacterButton";

/** Roster of saved characters with load / duplicate / delete / export actions. */
export function CharactersView() {
  const navigate = useNavigate();
  const saved = useCharacterStore((s) => s.saved);
  const draft = useCharacterStore((s) => s.draft);
  const saveDraftToLibrary = useCharacterStore((s) => s.saveDraftToLibrary);
  const newDraft = useCharacterStore((s) => s.newDraft);
  const loadCharacter = useCharacterStore((s) => s.loadCharacter);
  const duplicateCharacter = useCharacterStore((s) => s.duplicateCharacter);
  const deleteCharacter = useCharacterStore((s) => s.deleteCharacter);

  // Loading a character makes it the working draft, then jumps to the builder so
  // the change is visible (otherwise the click looks like it did nothing).
  const loadAndEdit = (id: string) => {
    loadCharacter(id);
    navigate("/build");
  };

  const summarize = (c: { race?: { name: string }; classes: { name: string }[] }) =>
    [c.classes[0]?.name, c.race?.name].filter(Boolean).join(" · ") || "Unfinished";

  const startNew = () => {
    if (window.confirm(`Start a new character? Unsaved changes to ${draft.name} will be lost.`)) newDraft();
  };
  const confirmDelete = (id: string, name: string) => {
    if (window.confirm(`Delete ${name}? This can't be undone.`)) deleteCharacter(id);
  };

  return (
    <div className="mx-auto h-full max-w-3xl space-y-4 overflow-y-auto">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-blood">Characters</h1>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={saveDraftToLibrary}
            className="rounded bg-blood px-3 py-1 text-sm font-semibold text-parchment hover:bg-blood-light"
          >
            Save current draft
          </button>
          <button
            type="button"
            onClick={startNew}
            className="rounded border border-blood px-3 py-1 text-sm text-blood hover:bg-blood/10"
          >
            New
          </button>
        </div>
      </div>

      <ImportCharacterButton />

      <div className="rounded border border-blood/20 bg-parchment/60 p-3 text-sm">
        <span className="font-semibold">Working draft:</span> {draft.name} — Level{" "}
        {characterLevel(draft)} {summarize(draft)}{" "}
        <Link to="/build" className="text-blood underline">
          edit →
        </Link>
      </div>

      <section aria-labelledby="saved-characters-heading" className="space-y-2">
        <h2 id="saved-characters-heading" className="text-xs font-bold uppercase tracking-wide text-blood">
          Saved characters {saved.length > 0 && <span className="text-ink-muted">({saved.length})</span>}
        </h2>
        {saved.length === 0 ? (
          <p className="rounded border border-dashed border-blood/30 p-4 text-center text-sm text-ink-muted">
            No saved characters yet. Build one, then press “Save current draft” — or import a
            D&amp;D Beyond PDF above.
          </p>
        ) : (
          <ul className="space-y-2">
            {saved.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded border border-blood/20 bg-parchment p-3"
              >
                <div className="min-w-0 flex-1 basis-48">
                  <div className="truncate font-semibold">{c.name}</div>
                  <div className="text-xs text-ink-muted">
                    Level {characterLevel(c)} · {summarize(c)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Actions for ${c.name}`}>
                  <Action onClick={() => navigate(`/sheet/${c.id}`)} label="View" />
                  <Action onClick={() => loadAndEdit(c.id)} label="Load" />
                  <Action onClick={() => duplicateCharacter(c.id)} label="Duplicate" />
                  <Action onClick={() => downloadCharacterJson(c)} label="Export" />
                  <Action onClick={() => confirmDelete(c.id, c.name)} label="Delete" danger />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Action({ onClick, label, danger }: { onClick: () => void; label: string; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-2.5 py-1.5 text-xs ${
        danger ? "border-blood text-blood hover:bg-blood/10" : "border-ink/20 hover:bg-black/5"
      }`}
    >
      {label}
    </button>
  );
}
