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
import { Icon } from "../common/Icon";

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
      <p className="rounded-lg border border-warning-border/50 bg-warning-surface px-3 py-2.5 text-sm">
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
      <p className="eyebrow">
        Chosen {picks.length} / {def.count}
      </p>
      {options.map((o) => {
        const prereq = levelPrerequisite(o);
        const locked = prereq !== undefined && prereq > classLevel;
        const picked = isPicked(o.name, o.source);
        const open = expanded === o.name;
        return (
          <div key={`${o.name}|${o.source}`} className={`rounded-lg border bg-surface px-3 py-2 transition-colors ${picked ? "row-selected border-accent/40" : "border-line"}`}>
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
                aria-expanded={open}
                className={`flex flex-1 items-center gap-1.5 text-left text-sm font-medium ${locked ? "text-ink-muted" : "text-ink"}`}
              >
                {o.name}
                <Icon
                  name="chevron-down"
                  className={`h-3.5 w-3.5 text-ink-muted transition-transform duration-300 ease-snap ${open ? "rotate-180" : ""}`}
                />
              </button>
              {locked && (
                <span className="eyebrow">
                  Requires level {prereq}
                </span>
              )}
            </div>
            {open && o.entries && (
              <div className="prose-rules mt-2 animate-settle-in border-t border-line pt-2">
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
      <p className="text-sm text-ink-muted">
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
      <p className="eyebrow">
        Chosen {picks.length} / {count}
      </p>
      {options.map((o) => {
        const picked = picks.includes(o.name);
        return (
          <label
            key={o.name}
            className={`flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${picked ? "row-selected border-accent/40" : "border-line bg-surface hover:border-line-strong"}`}
          >
            <input
              type="checkbox"
              checked={picked}
              disabled={!picked && picks.length >= count}
              onChange={() => toggle(o.name)}
              aria-label={`Master ${o.name}`}
            />
            <span className="flex-1 font-medium">{o.name}</span>
            <span className="eyebrow">{o.mastery}</span>
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
      <p className="text-sm text-ink-muted">
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
          className="field field-sm"
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
