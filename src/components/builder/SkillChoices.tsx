import { useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import { skillGrantsFor } from "../../store/selectors";
import type { ProficiencyGrant } from "../../data/types/character-content";
import { SKILL_BY_ID, skillNameToId } from "../../engine/constants";

export const skillName = (id: string) => SKILL_BY_ID[id]?.name ?? id;

/** The fixed (`{ skill: true }`) skill ids on one entity's grant array. */
export function fixedSkillIdsOf(grants?: ProficiencyGrant[]): string[] {
  const out: string[] = [];
  for (const grant of grants ?? []) {
    for (const [key, value] of Object.entries(grant)) {
      if (key !== "choose" && !key.startsWith("any") && value === true) out.push(skillNameToId(key));
    }
  }
  return out;
}

/**
 * D&D-Beyond-style skill pickers: one dropdown per pick for every "choose N"
 * group whose key starts with one of `prefixes` (`race:` / `subrace:` /
 * `background:` / `class:`). Skills granted elsewhere or picked in another
 * group are disabled so a pick is never wasted.
 */
export function SkillChoiceSelects({ prefixes }: { prefixes: string[] }) {
  const draft = useCharacterStore((s) => s.draft);
  const index = useContentStore((s) => s.index);
  const setSkillChoice = useCharacterStore((s) => s.setSkillChoice);
  const grants = skillGrantsFor(draft, index);

  const choices = grants.choices.filter((c) => prefixes.some((p) => c.key.startsWith(p)));
  if (choices.length === 0) return null;

  // Skills picked across ALL groups (not just the shown ones) — a skill chosen
  // once must be off-limits everywhere else.
  const allPicks = grants.choices.flatMap((c) => draft.skillChoices[c.key] ?? []);

  return (
    <div className="space-y-3">
      {choices.map((choice) => {
        const picks = draft.skillChoices[choice.key] ?? [];
        const setSlot = (slot: number, id: string) => {
          const next = [...picks];
          if (id) next[slot] = id;
          else next.splice(slot, 1);
          setSkillChoice(choice.key, next.filter(Boolean).slice(0, choice.count));
        };
        return (
          <div key={choice.key} className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
              {choice.origin}: choose {choice.count} ({picks.length}/{choice.count})
            </p>
            {Array.from({ length: choice.count }).map((_, slot) => {
              const current = picks[slot] ?? "";
              return (
                <select
                  key={slot}
                  value={current}
                  onChange={(e) => setSlot(slot, e.target.value)}
                  className="block w-full max-w-xs rounded border border-ink/20 bg-white px-2 py-1.5 text-sm"
                >
                  <option value="">— Choose a Skill —</option>
                  {choice.from.map((id) => {
                    const takenElsewhere =
                      id !== current && (grants.fixed.includes(id) || allPicks.includes(id));
                    return (
                      <option key={id} value={id} disabled={takenElsewhere}>
                        {skillName(id)}
                        {takenElsewhere ? " (already proficient)" : ""}
                      </option>
                    );
                  })}
                </select>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
