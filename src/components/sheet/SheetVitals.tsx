import { useState } from "react";
import { useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import type { deriveFromCharacter } from "../../store/selectors";
import type { Character, PlayState } from "../../model/character";
import { Icon } from "../common/Icon";

/** The 5e conditions, for when the imported content has no condition entries. */
const STANDARD_CONDITIONS = [
  "Blinded",
  "Charmed",
  "Deafened",
  "Exhaustion",
  "Frightened",
  "Grappled",
  "Incapacitated",
  "Invisible",
  "Paralyzed",
  "Petrified",
  "Poisoned",
  "Prone",
  "Restrained",
  "Stunned",
  "Unconscious",
];

/** Damage: temp HP absorbs first; at 0 HP it becomes a death-save failure (the 5e rules). */
export function damagePlay(p: PlayState, amount: number, maxHp: number): Partial<PlayState> {
  if (maxHp - p.damageTaken <= 0) {
    return { deathSaves: { ...p.deathSaves, failures: Math.min(3, p.deathSaves.failures + 1) } };
  }
  const absorbed = Math.min(p.tempHp, amount);
  return {
    tempHp: p.tempHp - absorbed,
    damageTaken: Math.min(maxHp, p.damageTaken + (amount - absorbed)),
  };
}

/** Regaining HP ends dying, so healing also clears the death saves. */
export function healPlay(p: PlayState, amount: number): Partial<PlayState> {
  return { damageTaken: Math.max(0, p.damageTaken - amount), deathSaves: { successes: 0, failures: 0 } };
}

/** A labelled number box (proficiency, speed, armor class). */
export function Stat({
  label,
  value,
  unit,
  caption,
  title,
  center,
  className = "",
}: {
  label: string;
  value: string | number;
  /** Small suffix after the value ("ft."). */
  unit?: string;
  caption?: string;
  title?: string;
  center?: boolean;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={caption ? `${label} ${caption}` : label}
      title={title}
      className={`rounded-xl border border-line bg-surface px-3 py-2.5 shadow-sm ${center || caption ? "text-center" : ""} ${className}`}
    >
      <div className="eyebrow">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-medium tracking-tight ${title ? "text-accent" : ""}`}>
        {value}
        {unit && <span className="ml-0.5 text-xs text-ink-muted">{unit}</span>}
      </div>
      {caption && <div className="eyebrow mt-0.5">{caption}</div>}
    </div>
  );
}

/** Heroic Inspiration: a toggle that survives rests. */
export function Inspiration({ character }: { character: Character }) {
  const updateSheet = useCharacterStore((s) => s.updateSheet);
  const on = character.play.inspiration;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => updateSheet(character.id, (c) => ({ play: { ...c.play, inspiration: !c.play.inspiration } }))}
      title={on ? "Spend Heroic Inspiration" : "Gain Heroic Inspiration"}
      className={`grid place-items-center rounded-xl border px-2 py-2.5 text-center shadow-sm transition-colors ${
        on ? "border-accent bg-accent/7" : "border-line bg-surface hover:border-line-strong"
      }`}
    >
      <span
        className={`grid h-8 w-8 place-items-center rounded-full border-2 transition-colors ${
          on ? "border-accent bg-accent text-on-accent" : "border-line-strong text-ink-faint"
        }`}
        aria-hidden="true"
      >
        {on && <Icon name="check" className="h-4 w-4" />}
      </span>
      <span className="eyebrow mt-1 leading-tight">Heroic Inspiration</span>
    </button>
  );
}

/**
 * D&D Beyond's hit-point box: heal/damage by an amount on the left, current /
 * max and temp on the right. The current/max button opens the full HP strip
 * (temp HP, rests, hit dice, death saves).
 */
export function HpBox({
  character,
  maxHp,
  current,
  open,
  onToggle,
  hitDie,
}: {
  character: Character;
  maxHp: number;
  current: number;
  open: boolean;
  onToggle: () => void;
  hitDie?: string;
}) {
  const updateSheet = useCharacterStore((s) => s.updateSheet);
  const [amount, setAmount] = useState(1);
  const apply = (fn: (p: PlayState) => Partial<PlayState>) =>
    updateSheet(character.id, (c) => ({ play: { ...c.play, ...fn(c.play) } }));
  const temp = character.play.tempHp;

  return (
    <div className="col-span-3 flex flex-col justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2 shadow-sm sm:col-span-1">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 text-center">
        <div>
          <div className="eyebrow">Current / Max</div>
          <button
            type="button"
            onClick={onToggle}
            aria-label="Hit Points"
            aria-expanded={open}
            title={`Manage HP — temp HP, rests, hit dice${hitDie ? ` (${hitDie})` : ""}`}
            className={`mt-0.5 rounded-md px-1 font-mono text-2xl font-medium tracking-tight transition-colors hover:text-accent ${
              current === 0 ? "text-accent" : ""
            } ${open ? "row-selected" : ""}`}
          >
            {current} / {maxHp}
          </button>
        </div>
        <div className="min-w-10">
          <div className="eyebrow">Temp</div>
          <div className={`mt-0.5 font-mono text-2xl font-medium ${temp ? "" : "text-ink-faint"}`}>{temp || "--"}</div>
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_3.25rem_minmax(0,1fr)] gap-1 print:hidden">
        <button type="button" onClick={() => apply((p) => healPlay(p, amount))} className="btn btn-secondary btn-sm min-h-7 px-1">
          Heal
        </button>
        <input
          type="number"
          min={1}
          value={amount}
          aria-label="Amount"
          onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
          className="field field-sm min-h-7 text-center"
        />
        <button
          type="button"
          onClick={() => apply((p) => damagePlay(p, amount, maxHp))}
          className="btn btn-danger btn-sm min-h-7 px-1"
        >
          Damage
        </button>
      </div>
    </div>
  );
}

/** Damage resistances/immunities, plus the active conditions with an add menu. */
export function DefensesAndConditions({
  character,
  derived,
  extraImmunities = [],
}: {
  character: Character;
  derived: ReturnType<typeof deriveFromCharacter>;
  /** Immunities only stated in trait prose (magical sleep). */
  extraImmunities?: string[];
}) {
  const index = useContentStore((s) => s.index);
  const updateSheet = useCharacterStore((s) => s.updateSheet);
  const defenses: [string, string[]][] = (
    [
      ["Resistances", derived.resistances],
      ["Immunities", [...derived.immunities, ...extraImmunities.filter((i) => !derived.immunities.includes(i))]],
    ] as [string, string[]][]
  ).filter(([, values]) => values.length > 0);
  const active = character.play.conditions;
  const fromContent = [...new Set(index.list("condition").map((c) => c.name))].sort();
  const options = (fromContent.length ? fromContent : STANDARD_CONDITIONS).filter((name) => !active.includes(name));

  const setConditions = (conditions: string[]) =>
    updateSheet(character.id, (c) => ({ play: { ...c.play, conditions } }));

  return (
    <section className="col-span-2 grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-xs shadow-sm sm:col-span-1">
      <div className="min-w-0">
        <h2 className="eyebrow mb-1">Defenses</h2>
        {defenses.length === 0 ? (
          <p className="text-ink-faint">None</p>
        ) : (
          <ul className="space-y-1 text-ink-muted">
            {defenses.map(([label, values]) => (
              <li key={label}>
                <span className="eyebrow">{label}</span>
                <div className="capitalize">{values.join(", ")}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="min-w-0 border-l border-line pl-3">
        <h2 className="eyebrow mb-1">Conditions</h2>
        <div className="flex flex-wrap gap-1">
          {active.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setConditions(active.filter((n) => n !== name))}
              aria-label={`Remove condition ${name}`}
              title="Remove condition"
              className="chip chip-accent hover:border-accent"
            >
              {name}
              <Icon name="close" className="h-3 w-3" />
            </button>
          ))}
        </div>
        {options.length > 0 && (
          <select
            aria-label="Add condition"
            value=""
            onChange={(e) => e.target.value && setConditions([...active, e.target.value])}
            className="field field-sm mt-1 w-full text-xs print:hidden"
          >
            <option value="">{active.length ? "Add…" : "Add active conditions…"}</option>
            {options.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>
    </section>
  );
}
