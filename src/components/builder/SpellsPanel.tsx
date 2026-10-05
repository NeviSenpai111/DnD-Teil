import { useActiveEntities, useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import { allSpellcastersFor, availableSpells, classSpellListKnown } from "../../store/selectors";
import type { Spell } from "../../data/types/spell-content";
import type { EntityRef, SpellPick } from "../../model/character";
import { formatMod } from "../../engine/modifiers";
import { ABILITY_NAMES, type Ability } from "../../engine/constants";
import { Icon } from "../common/Icon";

/**
 * The SPELLS sub-tab of one class's section on the Class page: stats, slots
 * and pick lists. Picks are tagged with the class so each caster in a
 * multiclass build has its own limits.
 */
export function SpellsPanel({ classIndex = 0 }: { classIndex?: number }) {
  const entities = useActiveEntities();
  const index = useContentStore((s) => s.index);
  const draft = useCharacterStore((s) => s.draft);
  const toggleCantrip = useCharacterStore((s) => s.toggleCantrip);
  const toggleSpell = useCharacterStore((s) => s.toggleSpell);

  const sc = allSpellcastersFor(draft, index).find((c) => c.classIndex === classIndex);

  if (!sc) {
    return (
      <p className="text-sm text-ink-muted">
        {draft.classes[classIndex]
          ? `${draft.classes[classIndex].name} has no spellcasting at this level.`
          : "Choose a spellcasting class to select spells."}
      </p>
    );
  }

  const { summary, limits, className, classSource } = sc;
  const spells = availableSpells(entities, className, summary.maxSpellLevel, index, classSource);
  const cantrips = spells.filter((s) => s.level === 0);
  const leveled = spells.filter((s) => s.level > 0);
  const listKnown = classSpellListKnown(entities, className, index);

  // This class's own picks: tagged with its name, or untagged legacy picks
  // when it's the first class.
  const mine = (list: SpellPick[]) =>
    list.filter((p) => p.forClass === className || (!p.forClass && classIndex === 0));
  const myCantrips = mine(draft.cantrips);
  const mySpells = mine(draft.spells);

  const has = (list: EntityRef[], s: Spell) =>
    list.some((r) => r.name === s.name && r.source === s.source);
  const pickedElsewhere = (list: SpellPick[], s: Spell) =>
    list.some(
      (r) => r.name === s.name && r.source === s.source && !mine([r]).length,
    );

  return (
    <div className="space-y-4">
      {!listKnown && spells.length > 0 && (
        <p className="flex gap-2.5 rounded-lg border border-warning-border/50 bg-warning-surface px-3 py-2.5 text-sm text-ink">
          <Icon name="alert" className="mt-0.5 h-4 w-4 text-warning-border" />
          <span>
          No spell-list data found for <strong>{className}</strong>, so every imported spell
          is shown. Import <code>spells/sources.json</code> (it sits next to the spell files in
          a 5eTools dump) and each class will only see its own spells.
          </span>
        </p>
      )}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
        <Box label="Ability" value={ABILITY_NAMES[summary.ability as Ability] ?? summary.ability} />
        <Box label="Save DC" value={summary.saveDc} />
        <Box label="Attack" value={formatMod(summary.attackBonus)} />
        <Box label="Max Spell Lvl" value={summary.maxSpellLevel} />
      </div>

      <SlotBar slots={summary.slots} pact={summary.pact} />

      <SpellGroup
        title={`Cantrips (${myCantrips.length}/${limits.cantrips})`}
        spells={cantrips.filter((s) => !pickedElsewhere(draft.cantrips, s))}
        selected={(s) => has(myCantrips, s)}
        disabledWhenUnselected={myCantrips.length >= limits.cantrips}
        onToggle={(ref) => toggleCantrip(ref, className)}
      />

      <SpellGroup
        title={`Spells ${limits.spellsLabel} (${mySpells.length}/${limits.spells})`}
        spells={leveled.filter((s) => !pickedElsewhere(draft.spells, s))}
        selected={(s) => has(mySpells, s)}
        disabledWhenUnselected={mySpells.length >= limits.spells}
        onToggle={(ref) => toggleSpell(ref, className)}
      />
    </div>
  );
}

function SlotBar({ slots, pact }: { slots: number[]; pact?: { count: number; slotLevel: number } }) {
  if (slots.length === 0 && !pact) return null;
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      {slots.map((count, i) => (
        <span key={i} className="flex items-baseline gap-1.5 rounded-md border border-line bg-surface-sunk px-2 py-1 font-mono text-xs">
          <span className="text-ink-muted">L{i + 1}</span> <strong className="font-medium">{count}</strong>
        </span>
      ))}
      {pact && (
        <span className="chip chip-accent px-2 py-0.5 text-xs">
          Pact: <strong className="font-medium">{pact.count}</strong> × L{pact.slotLevel}
        </span>
      )}
    </div>
  );
}

function SpellGroup({
  title,
  spells,
  selected,
  disabledWhenUnselected,
  onToggle,
}: {
  title: string;
  spells: Spell[];
  selected: (s: Spell) => boolean;
  disabledWhenUnselected: boolean;
  onToggle: (ref: EntityRef) => void;
}) {
  return (
    <fieldset className="rounded-xl border border-line px-3 pb-3 pt-1">
      <legend className="eyebrow px-1.5 text-ink">{title}</legend>
      {spells.length === 0 ? (
        <p className="text-sm text-ink-muted">No spells available for this class/level.</p>
      ) : (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {spells.map((s) => {
            const on = selected(s);
            const disabled = !on && disabledWhenUnselected;
            return (
              <li key={`${s.name}|${s.source}`}>
                <label
                  className={`flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-sm transition-colors ${
                    on ? "row-selected border-accent/40 font-medium" : "border-line-strong hover:bg-ink/5"
                  } ${disabled ? "opacity-40" : ""}`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={on}
                    disabled={disabled}
                    onChange={() => onToggle({ name: s.name, source: s.source })}
                  />
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="font-mono text-2xs uppercase text-ink-muted">
                    {s.level === 0 ? "cantrip" : `lvl ${s.level}`}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}

function Box({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <div className="eyebrow">{label}</div>
      <div className="mt-0.5 font-mono text-base font-medium">{value}</div>
    </div>
  );
}
