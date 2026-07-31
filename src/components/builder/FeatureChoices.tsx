import { useState } from "react";
import { useActiveEntities, useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import { deriveFromCharacter, masteryWeaponOptions } from "../../store/selectors";
import {
  featureTypeLabel,
  levelPrerequisite,
  optionalFeatureOptions,
  type OptionalFeatureDef,
} from "../../engine/optionalFeatures";
import { SKILL_BY_ID } from "../../engine/constants";
import { Entries } from "../../data/entryRenderer/EntryRenderer";

/**
 * Picker for one optional-feature progression (fighting styles, invocations,
 * metamagic, …): checkbox rows limited to `def.count`, with level-prerequisite
 * gating and expandable descriptions.
 */
export function OptionalFeaturePicker({
  def,
  classLevel,
}: {
  def: OptionalFeatureDef;
  classLevel: number;
}) {
  const entities = useActiveEntities();
  const draft = useCharacterStore((s) => s.draft);
  const setOptionalFeatures = useCharacterStore((s) => s.setOptionalFeatures);
  const [expanded, setExpanded] = useState<string>();

  const options = optionalFeatureOptions(entities, def);
  const picks = draft.optionalFeatures[def.key] ?? [];
  const isPicked = (name: string, source: string) =>
    picks.some((p) => p.name === name && p.source === source);

  if (options.length === 0) {
    const types = def.featureTypes
      .map((t) => `${featureTypeLabel(t)} ("${t}")`)
      .join(", ");
    return (
      <p className="rounded border border-amber-600/40 bg-amber-100/60 p-2 text-sm">
        No imported options of type {types || "unknown"}. These aren't in the class file —
        in 5eTools data they're book content in the separate{" "}
        <code className="font-semibold">optionalfeature.json</code> file. Import it alongside the
        class files and the choices will appear here (and in the browser).
      </p>
    );
  }

  function toggle(name: string, source: string) {
    if (isPicked(name, source)) {
      setOptionalFeatures(def.key, picks.filter((p) => !(p.name === name && p.source === source)));
    } else if (picks.length < def.count) {
      setOptionalFeatures(def.key, [...picks, { name, source }]);
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
        Chosen {picks.length} / {def.count}
      </p>
      {options.map((o) => {
        const prereq = levelPrerequisite(o);
        const locked = prereq !== undefined && prereq > classLevel;
        const picked = isPicked(o.name, o.source);
        const open = expanded === o.name;
        return (
          <div key={`${o.name}|${o.source}`} className="rounded border border-ink/10 bg-white/50 px-2 py-1">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={picked}
                disabled={locked || (!picked && picks.length >= def.count)}
                onChange={() => toggle(o.name, o.source)}
                aria-label={o.name}
              />
              <button
                type="button"
                onClick={() => setExpanded(open ? undefined : o.name)}
                className={`flex-1 text-left text-sm font-semibold ${locked ? "text-ink/40" : "text-ink"}`}
              >
                {o.name} {open ? "▴" : "▾"}
              </button>
              {locked && (
                <span className="text-xs uppercase tracking-wide text-ink/40">
                  Requires level {prereq}
                </span>
              )}
            </div>
            {open && o.entries && (
              <div className="mt-1 border-t border-ink/10 pt-1 text-sm">
                <Entries entries={o.entries} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Weapon Mastery (2024): choose `count` weapon kinds from the imported weapons
 * that carry a mastery property; the property shows on the sheet's attacks.
 */
export function WeaponMasteryPicker({ count }: { count: number }) {
  const entities = useActiveEntities();
  const draft = useCharacterStore((s) => s.draft);
  const setWeaponMasteries = useCharacterStore((s) => s.setWeaponMasteries);

  const options = masteryWeaponOptions(entities);
  const picks = draft.weaponMasteries;

  if (options.length === 0) {
    return (
      <p className="text-sm text-ink/60">
        No imported weapons carry a mastery property — import 2024-format items.
      </p>
    );
  }

  const toggle = (name: string) => {
    if (picks.includes(name)) setWeaponMasteries(picks.filter((n) => n !== name));
    else if (picks.length < count) setWeaponMasteries([...picks, name]);
  };

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
        Chosen {picks.length} / {count}
      </p>
      {options.map((o) => {
        const picked = picks.includes(o.name);
        return (
          <label
            key={o.name}
            className="flex items-center gap-2 rounded border border-ink/10 bg-white/50 px-2 py-1 text-sm"
          >
            <input
              type="checkbox"
              checked={picked}
              disabled={!picked && picks.length >= count}
              onChange={() => toggle(o.name)}
              aria-label={`Master ${o.name}`}
            />
            <span className="flex-1 font-semibold">{o.name}</span>
            <span className="text-xs uppercase tracking-wide text-ink/50">{o.mastery}</span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * Expertise skill selects for one granting feature: choose `count` skills from
 * the character's current proficiencies (double proficiency on those checks).
 */
export function ExpertiseSelects({ choiceKey, count }: { choiceKey: string; count: number }) {
  const index = useContentStore((s) => s.index);
  const draft = useCharacterStore((s) => s.draft);
  const setExpertiseChoice = useCharacterStore((s) => s.setExpertiseChoice);

  const proficient = deriveFromCharacter(draft, index).proficientSkillIds;
  const picks = draft.expertiseChoices[choiceKey] ?? [];

  if (proficient.length === 0) {
    return (
      <p className="text-sm text-ink/60">
        Pick your skill proficiencies first — expertise doubles proficiency on skills you already
        have.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <select
          key={i}
          value={picks[i] ?? ""}
          aria-label={`Expertise skill ${i + 1}`}
          onChange={(e) => {
            const next = [...picks];
            next[i] = e.target.value;
            setExpertiseChoice(choiceKey, next.filter(Boolean));
          }}
          className="rounded border border-ink/20 bg-white px-2 py-1 text-sm"
        >
          <option value="">— choose a skill —</option>
          {proficient
            .filter((id) => id === picks[i] || !picks.includes(id))
            .map((id) => (
              <option key={id} value={id}>
                {SKILL_BY_ID[id]?.name ?? id}
              </option>
            ))}
        </select>
      ))}
    </div>
  );
}
