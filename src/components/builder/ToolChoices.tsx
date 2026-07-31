import { useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import { toolChoiceDefsFor } from "../../store/selectors";

/** Dropdowns for the background's "choose/any N tools" grants (SRD tool tables). */
export function ToolChoiceSelects() {
  const index = useContentStore((s) => s.index);
  const draft = useCharacterStore((s) => s.draft);
  const setToolChoice = useCharacterStore((s) => s.setToolChoice);

  const defs = toolChoiceDefsFor(draft, index);
  if (defs.length === 0) return null;

  return (
    <div className="space-y-2">
      {defs.map((def) => {
        const picks = draft.toolChoices[def.key] ?? [];
        return (
          <div key={def.key}>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
              {def.origin}: choose {def.count} tool{def.count === 1 ? "" : "s"} ({picks.length}/
              {def.count})
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              {Array.from({ length: def.count }).map((_, slot) => (
                <select
                  key={slot}
                  value={picks[slot] ?? ""}
                  aria-label={`${def.origin} tool ${slot + 1}`}
                  onChange={(e) => {
                    const next = [...picks];
                    if (e.target.value) next[slot] = e.target.value;
                    else next.splice(slot, 1);
                    setToolChoice(def.key, next.filter(Boolean).slice(0, def.count));
                  }}
                  className="rounded border border-ink/20 bg-white px-2 py-1 text-sm"
                >
                  <option value="">— choose a tool —</option>
                  {def.from
                    .filter((tool) => tool === picks[slot] || !picks.includes(tool))
                    .map((tool) => (
                      <option key={tool} value={tool}>
                        {tool}
                      </option>
                    ))}
                </select>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
