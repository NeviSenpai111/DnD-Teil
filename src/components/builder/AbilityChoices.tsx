import { useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import { abilityChoiceDefsFor } from "../../store/selectors";
import type { AbilityChoiceDef } from "../../engine/character";
import { ABILITY_NAMES, type Ability } from "../../engine/constants";

/**
 * Renders "choose N ability increases" grants. By default it shows the grants
 * offered by the race/background (edition-aware) plus any background-granted
 * feats; pass `defs` to render a specific set (e.g. a feat's own choices).
 */
export function AbilityChoices({ defs: defsProp }: { defs?: AbilityChoiceDef[] } = {}) {
  const draft = useCharacterStore((s) => s.draft);
  const index = useContentStore((s) => s.index);
  const setAbilityChoice = useCharacterStore((s) => s.setAbilityChoice);
  const defs = defsProp ?? abilityChoiceDefsFor(draft, index);

  if (defs.length === 0) return null;

  return (
    <div className="space-y-3">
      {defs.map((def) => (
        <AbilityChoiceField
          key={def.key}
          def={def}
          picks={draft.abilityChoices[def.key] ?? []}
          onChange={(picks) => setAbilityChoice(def.key, picks)}
        />
      ))}
    </div>
  );
}

function AbilityChoiceField({
  def,
  picks,
  onChange,
}: {
  def: AbilityChoiceDef;
  picks: Ability[];
  onChange: (picks: Ability[]) => void;
}) {
  // Mixed weights (e.g. +2/+1) need ordered, per-slot assignment; uniform grants
  // (every pick gains the same amount) use a simpler multi-select.
  const mixedWeights = !!def.weights && new Set(def.weights).size > 1;

  if (mixedWeights && def.weights) {
    const setSlot = (slot: number, ability: Ability | "") => {
      const next = [...picks];
      next[slot] = (ability || undefined) as Ability;
      onChange(next);
    };
    return (
      <fieldset className="rounded-xl border border-line px-3 pb-3 pt-1">
        <legend className="eyebrow px-1.5 text-ink">{def.origin}: assign increases</legend>
        <div className="flex flex-wrap gap-2">
          {def.weights.map((w, slot) => (
            <label key={slot} className="flex items-center gap-1 text-sm">
              <span className="font-mono font-medium">+{w}</span>
              <select
                value={picks[slot] ?? ""}
                onChange={(e) => setSlot(slot, e.target.value as Ability | "")}
                className="field field-sm"
              >
                <option value="">to…</option>
                {def.from.map((ab) => (
                  <option
                    key={ab}
                    value={ab}
                    disabled={picks.some((p, i) => p === ab && i !== slot)}
                  >
                    {ABILITY_NAMES[ab]}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  const amount = def.weights ? def.weights[0] : def.amount;
  const toggle = (ab: Ability) => {
    if (picks.includes(ab)) onChange(picks.filter((a) => a !== ab));
    else if (picks.length < def.count) onChange([...picks, ab]);
  };
  return (
    <fieldset className="rounded-xl border border-line px-3 pb-3 pt-1">
      <legend className="eyebrow px-1.5 text-ink">
        {def.origin}: choose {def.count} (+{amount})
      </legend>
      <div className="flex flex-wrap gap-2">
        {def.from.map((ab) => {
          const on = picks.includes(ab);
          const disabled = !on && picks.length >= def.count;
          return (
            <label
              key={ab}
              className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                on ? "row-selected border-accent/40 font-medium" : "border-line-strong hover:bg-ink/5"
              } ${disabled ? "opacity-40" : ""}`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={on}
                disabled={disabled}
                onChange={() => toggle(ab)}
              />
              {ABILITY_NAMES[ab]}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
