import { useActiveEntities, useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import { resolveFeat, spellsForFeatPick } from "../../store/selectors";
import { featSpellGrants } from "../../engine/featSpells";
import type { AdditionalSpellSet } from "../../data/types/character-content";
import type { EntityRef } from "../../model/character";

/**
 * Spell picks granted by a feat (Magic Initiate, Fey Touched, …): an option-set
 * dropdown when the feat offers alternative lists, the fixed spells it grants,
 * and one dropdown per pickable spell. Renders nothing for feats without
 * `additionalSpells`.
 */
export function FeatSpellPicker({ featRef, keyPrefix }: { featRef?: EntityRef; keyPrefix: string }) {
  const index = useContentStore((s) => s.index);
  const feat = resolveFeat(index, featRef);
  if (!feat?.additionalSpells?.length) return null;
  return <AdditionalSpellPicker entity={feat} keyPrefix={keyPrefix} />;
}

/**
 * The same picker for ANY entity carrying `additionalSpells` — species innate
 * spells (High-Elf-cantrip style) use it with a `racespell:` key prefix.
 */
export function AdditionalSpellPicker({
  entity,
  keyPrefix,
}: {
  entity: { name: string; additionalSpells?: AdditionalSpellSet[] };
  keyPrefix: string;
}) {
  const entities = useActiveEntities();
  const index = useContentStore((s) => s.index);
  const draft = useCharacterStore((s) => s.draft);
  const setFeatSpellSet = useCharacterStore((s) => s.setFeatSpellSet);
  const setFeatSpells = useCharacterStore((s) => s.setFeatSpells);

  const chosenSet = draft.featSpellSets[keyPrefix];
  const grants = featSpellGrants(entity, keyPrefix, chosenSet);

  return (
    <div className="space-y-2">
      {grants.sets.length > 1 && (
        <label className="flex items-center gap-2 text-sm">
          <span className="font-semibold">Spell list:</span>
          <select
            value={chosenSet ?? ""}
            onChange={(e) => setFeatSpellSet(keyPrefix, e.target.value)}
            className="rounded border border-ink/20 bg-white px-2 py-1"
          >
            <option value="">— Choose —</option>
            {grants.sets.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}

      {grants.fixed.length > 0 && (
        <p className="text-sm">
          <span className="font-bold">Grants:</span>{" "}
          {grants.fixed.map((f) => f.name).join(", ")}
        </p>
      )}

      {grants.picks.map((def) => {
        const options = spellsForFeatPick(entities, index, def);
        const picks = draft.featSpells[def.key] ?? [];
        const setSlot = (slot: number, value: string) => {
          const next = [...picks];
          if (value) {
            const [name, source] = value.split("|");
            next[slot] = { name, source };
          } else {
            next.splice(slot, 1);
          }
          setFeatSpells(def.key, next.filter(Boolean).slice(0, def.count));
        };
        const label =
          def.level === 0 ? `cantrip${def.count === 1 ? "" : "s"}` : `level-${def.level ?? 1} spell${def.count === 1 ? "" : "s"}`;
        return (
          <div key={def.key} className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
              {def.origin}: choose {def.count} {label} ({picks.length}/{def.count})
            </p>
            {options.length === 0 ? (
              <p className="text-xs text-ink/50">
                No matching spells imported{def.className ? ` for the ${def.className} list` : ""}.
              </p>
            ) : (
              Array.from({ length: def.count }).map((_, slot) => {
                const current = picks[slot] ? `${picks[slot].name}|${picks[slot].source}` : "";
                const takenElsewhere = new Set(
                  picks.filter((_, i) => i !== slot).map((p) => `${p.name}|${p.source}`),
                );
                return (
                  <select
                    key={slot}
                    value={current}
                    onChange={(e) => setSlot(slot, e.target.value)}
                    className="block w-full max-w-xs rounded border border-ink/20 bg-white px-2 py-1.5 text-sm"
                  >
                    <option value="">— Choose a Spell —</option>
                    {options.map((s) => {
                      const key = `${s.name}|${s.source}`;
                      return (
                        <option key={key} value={key} disabled={takenElsewhere.has(key)}>
                          {s.name}
                        </option>
                      );
                    })}
                  </select>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}
