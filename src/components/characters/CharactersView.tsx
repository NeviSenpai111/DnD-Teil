import { Link, useNavigate } from "react-router-dom";
import { useCharacterStore } from "../../store/characterStore";
import { downloadCharacterJson } from "../../data/exportCharacter";
import { characterLevel } from "../../model/character";
import { Icon, type IconName } from "../common/Icon";
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
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-5xl gap-6 pb-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-8">
        <div className="min-w-0 space-y-5">
          <header className="flex flex-wrap items-end gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Characters</h1>
              <p className="mt-0.5 text-sm text-ink-muted">Your saved library, stored in this browser.</p>
            </div>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={startNew} className="btn btn-secondary">
                <Icon name="plus" />
                New
              </button>
              <button type="button" onClick={saveDraftToLibrary} className="btn btn-primary">
                Save current draft
              </button>
            </div>
          </header>

          <section aria-labelledby="saved-characters-heading" className="space-y-3">
            <h2 id="saved-characters-heading" className="eyebrow">
              Saved characters {saved.length > 0 && <span className="text-ink-faint">({saved.length})</span>}
            </h2>
            {saved.length === 0 ? (
              <div className="grid justify-items-start gap-3 rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-surface/60 px-5 py-8">
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface text-ink-muted">
                  <Icon name="users" className="h-5 w-5" />
                </span>
                <p className="max-w-[46ch] text-sm text-ink-muted">
                  No saved characters yet. Build one, then press “Save current draft” — or import a
                  D&amp;D Beyond PDF.
                </p>
                <Link to="/build" className="btn btn-secondary btn-sm">
                  Open the builder
                  <Icon name="arrow-right" className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : (
              <ul className="panel stagger divide-y divide-line overflow-hidden">
                {saved.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5">
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-surface-sunk font-mono text-sm font-medium text-ink-muted"
                      aria-hidden="true"
                    >
                      {initials(c.name)}
                    </span>
                    <div className="min-w-0 flex-1 basis-40">
                      <div className="truncate font-medium">{c.name}</div>
                      <div className="text-xs text-ink-muted">
                        <span className="font-mono">Level {characterLevel(c)}</span> · {summarize(c)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1" role="group" aria-label={`Actions for ${c.name}`}>
                      <Action onClick={() => navigate(`/sheet/${c.id}`)} label="View" icon="eye" />
                      <Action onClick={() => loadAndEdit(c.id)} label="Load" icon="edit" />
                      <Action onClick={() => duplicateCharacter(c.id)} label="Duplicate" icon="copy" />
                      <Action onClick={() => downloadCharacterJson(c)} label="Export" icon="download" />
                      <Action onClick={() => confirmDelete(c.id, c.name)} label="Delete" icon="trash" danger />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:pt-1" aria-label="Draft and import">
          <section className="panel p-4">
            <h2 className="eyebrow">Working draft</h2>
            <div className="mt-3 flex items-center gap-3">
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent font-mono text-sm font-medium text-on-accent"
                aria-hidden="true"
              >
                {initials(draft.name)}
              </span>
              <div className="min-w-0 text-sm">
                <div className="truncate font-medium">{draft.name}</div>
                <div className="text-xs text-ink-muted">
                  <span className="font-mono">Level {characterLevel(draft)}</span> · {summarize(draft)}
                </div>
              </div>
            </div>
            <Link to="/build" className="btn btn-secondary btn-sm mt-4 w-full">
              Edit in builder
              <Icon name="arrow-right" className="h-3.5 w-3.5" />
            </Link>
          </section>

          <section className="panel p-4">
            <h2 className="eyebrow mb-3">Import</h2>
            <ImportCharacterButton />
          </section>
        </aside>
      </div>
    </div>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

function Action({
  onClick,
  label,
  icon,
  danger,
}: {
  onClick: () => void;
  label: string;
  icon: IconName;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`btn btn-ghost btn-sm max-sm:min-w-9 max-sm:px-0 ${danger ? "hover:bg-accent/8 hover:text-accent" : ""}`}
    >
      <Icon name={icon} className="h-3.5 w-3.5" />
      <span className="max-sm:sr-only">{label}</span>
    </button>
  );
}
