import { useActiveEntities, useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import { deriveFromCharacter, featAbilityChoiceDefsFor, listByType } from "../../store/selectors";
import { characterLevel, type AsiChoice, type EntityRef } from "../../model/character";
import type { Feat } from "../../data/types/character-content";
import { ABILITIES, ABILITY_NAMES, type Ability } from "../../engine/constants";
import { featPrerequisiteCheck } from "../../engine/prerequisites";
import { AbilityChoices } from "./AbilityChoices";
import { SkillChoiceSelects } from "./SkillChoices";
import { FeatSpellPicker } from "./FeatSpellPicker";

/**
 * One level-up improvement slot: +2 ability increase or a feat (with the feat's
 * own ability choices inline). A feat can't be taken twice, so feats chosen in
 * other slots are disabled. Rendered inside the Class page's "Ability Score
 * Improvement" accordions.
 */
export function AsiSlot({ index }: { index: number }) {
  const entities = useActiveEntities();
  const contentIndex = useContentStore((s) => s.index);
  const draft = useCharacterStore((s) => s.draft);
  const setAsi = useCharacterStore((s) => s.setAsi);

  const feats = listByType(entities, "feat");
  // Prerequisite validation: ineligible feats are disabled with the reason.
  const abilities = deriveFromCharacter(draft, contentIndex).abilities;
  const prereqFor = (f: unknown) =>
    featPrerequisiteCheck(f as Feat, abilities, characterLevel(draft));
  const choice = draft.asis[index];
  const isFeat = choice?.type === "feat";
  const increases = choice?.type === "asi" ? choice.increases : {};
  const picks = Object.entries(increases).flatMap(([ab, n]) => Array(n ?? 0).fill(ab) as Ability[]);

  const featKey = (ref: EntityRef) => `${ref.name}|${ref.source}`;
  const takenByOthers = new Set(
    draft.asis.flatMap((a, i) =>
      i !== index && a?.type === "feat" && a.ref ? [featKey(a.ref)] : [],
    ),
  );

  const onChange = (c: AsiChoice) => setAsi(index, c);
  const setIncrease = (slot: 0 | 1, ability: Ability | "") => {
    const next = [...picks];
    next[slot] = ability as Ability;
    const merged: Partial<Record<Ability, number>> = {};
    for (const ab of next.filter(Boolean) as Ability[]) merged[ab] = (merged[ab] ?? 0) + 1;
    onChange({ type: "asi", increases: merged });
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange({ type: "asi", increases })}
          className={`rounded border px-2 py-1 text-sm ${!isFeat ? "border-blood bg-blood/10 font-semibold" : "border-ink/20"}`}
        >
          Ability Increase
        </button>
        <button
          type="button"
          onClick={() => onChange({ type: "feat", ref: undefined })}
          className={`rounded border px-2 py-1 text-sm ${isFeat ? "border-blood bg-blood/10 font-semibold" : "border-ink/20"}`}
        >
          Feat
        </button>
      </div>

      {!isFeat ? (
        <div className="flex flex-wrap gap-2">
          {[0, 1].map((slot) => (
            <select
              key={slot}
              value={picks[slot] ?? ""}
              onChange={(e) => setIncrease(slot as 0 | 1, e.target.value as Ability | "")}
              className="rounded border border-ink/20 bg-white px-2 py-1 text-sm"
            >
              <option value="">+1 to…</option>
              {ABILITIES.map((ab) => (
                <option key={ab} value={ab}>
                  {ABILITY_NAMES[ab]}
                </option>
              ))}
            </select>
          ))}
          <span className="self-center text-xs text-ink/50">(pick the same twice for +2)</span>
        </div>
      ) : (
        <div className="space-y-2">
          <select
            value={choice?.type === "feat" && choice.ref ? featKey(choice.ref) : ""}
            onChange={(e) => {
              const [name, source] = e.target.value.split("|");
              onChange({ type: "feat", ref: name ? { name, source } : undefined });
            }}
            className="rounded border border-ink/20 bg-white px-2 py-1 text-sm"
          >
            <option value="">Choose a feat…</option>
            {feats.map((f) => {
              const key = `${f.name}|${f.source}`;
              const taken = takenByOthers.has(key);
              const prereq = prereqFor(f);
              return (
                <option key={key} value={key} disabled={taken || !prereq.met}>
                  {f.name}
                  {taken ? " (taken)" : !prereq.met ? ` (requires ${prereq.text})` : ""}
                </option>
              );
            })}
          </select>
          <FeatAbilityChoices index={index} refValue={choice?.type === "feat" ? choice.ref : undefined} />
          {/* Free-choice skill grants (e.g. Skilled's "any 3") for this slot's feat. */}
          <SkillChoiceSelects prefixes={[`feat:asifeat:${index}:`]} />
          {/* Spell grants (Magic Initiate, Fey Touched, …). */}
          <FeatSpellPicker
            featRef={choice?.type === "feat" ? choice.ref : undefined}
            keyPrefix={`asifeat:${index}`}
          />
        </div>
      )}
    </div>
  );
}

function FeatAbilityChoices({ index, refValue }: { index: number; refValue?: EntityRef }) {
  const contentIndex = useContentStore((s) => s.index);
  const defs = featAbilityChoiceDefsFor(contentIndex, refValue, `asifeat:${index}`);
  if (defs.length === 0) return null;
  return <AbilityChoices defs={defs} />;
}
