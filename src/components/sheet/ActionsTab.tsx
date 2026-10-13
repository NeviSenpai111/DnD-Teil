import { useState, type ReactNode } from "react";
import { useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import { classResourcesFor, deriveFromCharacter, itemForEntry } from "../../store/selectors";
import type { Character } from "../../model/character";
import { formatMod } from "../../engine/modifiers";
import { masteryNames } from "../../engine/mastery";
import { isWeapon, unarmedStrikeLine, weaponAttackLine } from "../../engine/attacks";
import type { Item } from "../../data/types/item-content";
import { ItemDetail } from "../browser/ItemDetail";
import { SpellDetail } from "../browser/SpellDetail";
import { Icon } from "../common/Icon";
import { AddButton, FilterPills, SlotPips } from "./sheetParts";
import { sheetSpellRows, type SheetSpellRow, type SpellActivation } from "./sheetSpells";

const ACTIONS_IN_COMBAT =
  "Attack, Dash, Disengage, Dodge, Grapple, Help, Hide, Improvise, Influence, Magic, Ready, Search, Shove, Study, Utilize";

/** D&D Beyond's Actions-tab filters. */
const FILTERS = ["All", "Attack", "Action", "Bonus Action", "Reaction", "Other", "Limited Use"] as const;
type Filter = (typeof FILTERS)[number];

type Derived = ReturnType<typeof deriveFromCharacter>;

/** Parse a formatted to-hit like "+5" / "−1" back to a number. */
function parseHit(hit: string): number {
  return Number(hit.replace("−", "-").replace("+", "")) || 0;
}

/** "Cantrip", "1st Level", "2nd Level", … */
function spellLevelName(level: number): string {
  if (level === 0) return "Cantrip";
  const suffix = ["th", "st", "nd", "rd"];
  const v = level % 100;
  return `${level}${suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]} Level`;
}

interface AttackRow {
  key: string;
  name: string;
  /** "Simple · 20/60 ft." / "Cantrip · Artificer". */
  subtitle: string;
  range: string;
  /** Attack bonus (rollable) or a save DC ("DEX 15"). */
  hit?: number;
  dc?: string;
  damage: string;
  detail?: ReactNode;
}

/**
 * The Actions tab, laid out like D&D Beyond's: filter pills, then Actions
 * (equipped weapons, spell attacks, custom attacks, Unarmed Strike and the
 * basic actions), Bonus Actions, Reactions, Other and Limited Use.
 */
export function ActionsTab({
  character,
  derived,
  onCheck,
  onDamage,
}: {
  character: Character;
  derived: Derived;
  onCheck: (label: string, mod: number) => void;
  onDamage: (label: string, expr: string) => void;
}) {
  const index = useContentStore((s) => s.index);
  const updateSheet = useCharacterStore((s) => s.updateSheet);
  const [filter, setFilter] = useState<Filter>("All");
  const show = (f: Filter) => filter === "All" || filter === f;

  const spells = sheetSpellRows(character, index);
  const weapons = character.inventory
    .map((entry) => ({ entry, item: itemForEntry(entry, index) }))
    .filter((w): w is { entry: (typeof character.inventory)[number]; item: Item } => !!w.item && isWeapon(w.item));

  const rows: AttackRow[] = weapons
    .filter((w) => w.entry.equipped)
    .map(({ entry, item }, i) => {
      const line = weaponAttackLine(item, derived.mods, derived.pb, derived.proficiencies.weapons);
      // Mastered weapon kinds show their mastery property (2024).
      const mastery = character.weaponMasteries.includes(item.name) ? masteryNames(item).join(", ") : "";
      return {
        key: `w${i}-${entry.id ?? item.name}`,
        name: line.name,
        subtitle: [line.notes, mastery && `Mastery: ${mastery}`].filter(Boolean).join(" · "),
        range: line.range,
        hit: parseHit(line.hit),
        damage: line.damage,
        detail: <ItemDetail item={item} embedded />,
      };
    });
  // As on D&D Beyond: damaging cantrips (attack or save) and leveled spells
  // that make an attack roll.
  for (const row of spells) {
    if (!row.hit || !row.damage) continue;
    if (row.level > 0 && row.hit.kind !== "attack") continue;
    rows.push(spellAttackRow(row));
  }
  const unarmed = unarmedStrikeLine(derived.mods, derived.pb);
  rows.push({
    key: "unarmed",
    name: unarmed.name,
    subtitle: unarmed.notes || "Melee Attack",
    range: unarmed.range,
    hit: parseHit(unarmed.hit),
    damage: unarmed.damage,
  });

  const unequipped = weapons.filter((w) => !w.entry.equipped);
  const equip = (id?: string) =>
    updateSheet(character.id, (c) => ({
      inventory: c.inventory.map((it) => (it.id === id ? { ...it, equipped: true } : it)),
    }));

  const byActivation = (activation: SpellActivation) => spells.filter((s) => s.activation === activation);
  const rituals = spells.filter((s) => s.ritual);

  return (
    <div className="space-y-5">
      <FilterPills label="Filter actions" options={FILTERS} value={filter} onChange={setFilter} />

      {(show("Attack") || show("Action")) && (
        <section className="space-y-3">
          <SectionTitle>Actions</SectionTitle>
          <AttackTable rows={rows} onCheck={onCheck} onDamage={onDamage} />
          {unequipped.length > 0 && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
              Not equipped:
              {unequipped.map(({ entry }) => (
                <button
                  key={entry.id ?? entry.name}
                  type="button"
                  onClick={() => equip(entry.id)}
                  title="Equip to list its attack"
                  className="chip hover:border-accent hover:text-accent print:hidden"
                >
                  <Icon name="plus" className="h-3 w-3" />
                  {entry.name}
                </button>
              ))}
            </p>
          )}
          <CustomAttacks character={character} onCheck={onCheck} onDamage={onDamage} />
          {show("Action") && <Activation title="Actions in Combat" combat={ACTIONS_IN_COMBAT} spells={[]} />}
        </section>
      )}

      {show("Bonus Action") && (
        <section className="space-y-2">
          <SectionTitle>Bonus Actions</SectionTitle>
          <Activation combat="Two-Weapon Fighting" spells={byActivation("bonus")} />
        </section>
      )}

      {show("Reaction") && (
        <section className="space-y-2">
          <SectionTitle>Reactions</SectionTitle>
          <Activation combat="Opportunity Attack" spells={byActivation("reaction")} />
        </section>
      )}

      {show("Other") && (
        <section className="space-y-2">
          <SectionTitle>Other</SectionTitle>
          <Activation combat="Interact with an Object" spells={byActivation("other")} />
          {rituals.length > 0 && <SpellList label="Ritual Spells" spells={rituals} />}
        </section>
      )}

      {show("Limited Use") && <ResourceTracker character={character} />}
    </div>
  );
}

function spellAttackRow(row: SheetSpellRow): AttackRow {
  const hit = row.hit!;
  return {
    key: `s-${row.ref.name}`,
    name: row.ref.name,
    subtitle: [spellLevelName(row.level), row.origin, row.notes].filter(Boolean).join(" · "),
    range: row.range ?? "—",
    hit: hit.kind === "attack" ? hit.bonus : undefined,
    dc: hit.kind === "save" ? `${hit.ability.toUpperCase()} ${hit.dc}` : undefined,
    damage: [row.damage, row.damageType].filter(Boolean).join(" "),
    detail: row.spell ? <SpellDetail spell={row.spell} embedded /> : undefined,
  };
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="border-b border-line pb-1 text-sm font-semibold tracking-tight text-ink">{children}</h3>
  );
}

/** Attack | Range | Hit/DC | Damage, each row expandable into its detail card. */
function AttackTable({
  rows,
  onCheck,
  onDamage,
}: {
  rows: AttackRow[];
  onCheck: (label: string, mod: number) => void;
  onDamage: (label: string, expr: string) => void;
}) {
  const [expanded, setExpanded] = useState<string>();
  const columns = "grid grid-cols-[minmax(0,1fr)_4.75rem_3.75rem_minmax(4.5rem,auto)] items-center gap-x-3";
  return (
    <div>
      <div className={`${columns} eyebrow border-b border-line pb-1.5`}>
        <span>Attack</span>
        <span>Range</span>
        <span className="text-center">Hit/DC</span>
        <span>Damage</span>
      </div>
      <ul>
        {rows.map((row) => (
          <li key={row.key} className="border-b border-line py-1.5 text-sm">
            <div className={columns}>
              <span className="min-w-0">
                {row.detail ? (
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === row.key ? undefined : row.key)}
                    className="text-left font-semibold hover:text-accent hover:underline"
                    title="Show details"
                  >
                    {row.name}
                  </button>
                ) : (
                  <span className="font-semibold">{row.name}</span>
                )}
                {row.subtitle && (
                  <span className="block truncate font-mono text-2xs uppercase text-ink-muted" title={row.subtitle}>
                    {row.subtitle}
                  </span>
                )}
              </span>
              <span className="font-mono text-xs text-ink-muted">{row.range}</span>
              {row.hit !== undefined ? (
                <button
                  type="button"
                  onClick={() => onCheck(`${row.name} Attack`, row.hit!)}
                  aria-label={`Roll attack: ${row.name}`}
                  title="Roll to hit"
                  className="rounded-md border border-line-strong px-2 text-center font-mono font-medium transition-colors hover:border-accent hover:text-accent"
                >
                  {formatMod(row.hit)}
                </button>
              ) : (
                <span className="text-center font-mono text-xs font-medium">{row.dc ?? "—"}</span>
              )}
              {/\d+d\d+/.test(row.damage) ? (
                <button
                  type="button"
                  onClick={() => onDamage(`${row.name} Damage`, row.damage)}
                  aria-label={`Roll damage: ${row.name}`}
                  title="Roll damage"
                  className="text-left font-mono hover:text-accent hover:underline"
                >
                  {row.damage}
                </button>
              ) : (
                <span className="font-mono">{row.damage || "—"}</span>
              )}
            </div>
            {expanded === row.key && row.detail && <div className="mt-2">{row.detail}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A basic action from "Actions in Combat" plus the spells cast with that action type. */
function Activation({ title, combat, spells }: { title?: string; combat: string; spells: SheetSpellRow[] }) {
  return (
    <div className="space-y-1.5 text-sm">
      {title && <h4 className="text-sm font-semibold tracking-tight text-ink">{title}</h4>}
      <p className="border-l-2 border-line pl-3 leading-relaxed text-ink-muted">{combat}</p>
      {spells.length > 0 && <SpellList label="Spells" spells={spells} />}
    </div>
  );
}

function SpellList({ label, spells }: { label: string; spells: SheetSpellRow[] }) {
  return (
    <p className="text-sm">
      <span className="eyebrow mr-2">{label}</span>
      {spells.map((s, i) => (
        <span key={s.ref.name}>
          {i > 0 && ", "}
          {s.ref.name}
          <span className="text-ink-muted"> ({s.level === 0 ? "cantrip" : spellLevelName(s.level).replace(" Level", "")})</span>
        </span>
      ))}
    </p>
  );
}

/** Manually-defined attack lines: rollable like weapons, with an add form. */
function CustomAttacks({
  character,
  onCheck,
  onDamage,
}: {
  character: Character;
  onCheck: (label: string, mod: number) => void;
  onDamage: (label: string, expr: string) => void;
}) {
  const updateSheet = useCharacterStore((s) => s.updateSheet);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [hit, setHit] = useState(0);
  const [damage, setDamage] = useState("");

  const add = () => {
    if (!name.trim()) return;
    updateSheet(character.id, (c) => ({
      customAttacks: [...c.customAttacks, { name: name.trim(), hit, damage: damage.trim() }],
    }));
    setName("");
    setHit(0);
    setDamage("");
    setAdding(false);
  };
  const remove = (i: number) =>
    updateSheet(character.id, (c) => ({
      customAttacks: c.customAttacks.filter((_, j) => j !== i),
    }));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold tracking-tight text-ink">Custom Attacks</h4>
        <AddButton open={adding} onClick={() => setAdding(!adding)} label="Add Attack" />
      </div>
      {adding && (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface-sunk p-3 text-sm print:hidden">
          <label className="text-xs text-ink-muted">
            Name
            <input
              value={name}
              aria-label="Attack name"
              onChange={(e) => setName(e.target.value)}
              className="block w-36 field field-sm"
            />
          </label>
          <label className="text-xs text-ink-muted">
            To hit
            <input
              type="number"
              value={hit}
              aria-label="Attack bonus"
              onChange={(e) => setHit(Number(e.target.value) || 0)}
              className="block w-16 field field-sm"
            />
          </label>
          <label className="text-xs text-ink-muted">
            Damage
            <input
              value={damage}
              aria-label="Attack damage"
              placeholder="1d6+2 fire"
              onChange={(e) => setDamage(e.target.value)}
              className="block w-32 field field-sm"
            />
          </label>
          <button type="button" onClick={add} className="btn btn-primary btn-sm">
            Add
          </button>
        </div>
      )}
      {character.customAttacks.length === 0 ? (
        !adding && <p className="text-xs text-ink-muted">None defined.</p>
      ) : (
        <ul>
          {character.customAttacks.map((a, i) => (
            <li
              key={`${a.name}-${i}`}
              className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 border-b border-line py-1.5 text-sm"
            >
              <span className="font-semibold">{a.name}</span>
              <button
                type="button"
                onClick={() => onCheck(`${a.name} Attack`, a.hit)}
                aria-label={`Roll attack: ${a.name}`}
                title="Roll to hit"
                className="rounded-md border border-line-strong px-2 text-center font-mono font-medium transition-colors hover:border-accent hover:text-accent"
              >
                {formatMod(a.hit)}
              </button>
              {/\d+d\d+/.test(a.damage) ? (
                <button
                  type="button"
                  onClick={() => onDamage(`${a.name} Damage`, a.damage)}
                  aria-label={`Roll damage: ${a.name}`}
                  title="Roll damage"
                  className="text-left font-mono hover:text-accent hover:underline"
                >
                  {a.damage}
                </button>
              ) : (
                <span className="font-mono">{a.damage || "—"}</span>
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                title="Remove attack"
                aria-label={`Remove ${a.name || "attack"}`}
                className="btn btn-ghost btn-icon min-h-8 min-w-8 hover:text-accent print:hidden"
              >
                <Icon name="close" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Spendable class-resource pips (rage, ki, vigor, …) parsed from the class
 * tables; a long rest restores all, a short rest the short-rest ones. */
function ResourceTracker({ character }: { character: Character }) {
  const index = useContentStore((s) => s.index);
  const updateSheet = useCharacterStore((s) => s.updateSheet);
  const resources = classResourcesFor(character, index);
  if (resources.length === 0) return null;

  return (
    <section className="space-y-2">
      <SectionTitle>Limited Use</SectionTitle>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-sunk p-3 print:hidden">
        {resources.map((r) => (
          <SlotPips
            key={r.name}
            label={r.name}
            total={r.max}
            used={character.play.usedResources[r.name] ?? 0}
            onChange={(used) =>
              updateSheet(character.id, (c) => ({
                play: {
                  ...c.play,
                  usedResources: { ...c.play.usedResources, [r.name]: used },
                },
              }))
            }
          />
        ))}
      </div>
    </section>
  );
}
