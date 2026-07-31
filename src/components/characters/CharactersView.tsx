import { Link, useNavigate } from "react-router-dom";
import { useCharacterStore } from "../../store/characterStore";
import { downloadCharacterJson } from "../../data/exportCharacter";
import { characterLevel } from "../../model/character";

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

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
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
            onClick={newDraft}
            className="rounded border border-blood px-3 py-1 text-sm text-blood hover:bg-blood/10"
          >
            New
          </button>
        </div>
      </div>

      <div className="rounded border border-blood/20 bg-parchment/60 p-3 text-sm">
        <span className="font-semibold">Working draft:</span> {draft.name} — Level{" "}
        {characterLevel(draft)} {summarize(draft)}{" "}
        <Link to="/build" className="text-blood underline">
          edit →
        </Link>
      </div>

      {saved.length === 0 ? (
        <p className="text-sm text-ink/60">
          No saved characters yet. Build one and press “Save current draft”.
        </p>
      ) : (
        <ul className="space-y-2">
          {saved.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded border border-blood/20 bg-parchment p-3"
            >
              <div className="flex-1">
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs text-ink/60">
                  Level {characterLevel(c)} · {summarize(c)}
                </div>
              </div>
              <Action onClick={() => navigate(`/sheet/${c.id}`)} label="View" />
              <Action onClick={() => loadAndEdit(c.id)} label="Load" />
              <Action onClick={() => duplicateCharacter(c.id)} label="Duplicate" />
              <Action onClick={() => downloadCharacterJson(c)} label="Export" />
              <Action onClick={() => deleteCharacter(c.id)} label="Delete" danger />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Action({ onClick, label, danger }: { onClick: () => void; label: string; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-2 py-1 text-xs ${
        danger ? "border-blood text-blood hover:bg-blood/10" : "border-ink/20 hover:bg-black/5"
      }`}
    >
      {label}
    </button>
  );
}
