import { useMemo, useState, type ReactNode } from "react";
import { useActiveEntities, useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import {
  attunedCount,
  availableSpells,
  backgroundFor,
  chosenOptionalFeaturesFor,
  classFeaturesFor,
  classResourcesFor,
  containerContentsWeight,
  deriveFromCharacter,
  effectAcFormulaCandidates,
  inventoryWeight,
  itemForEntry,
  listByType,
  resolveCharacterFeats,
  resolveClass,
  resolveRace,
  resolveSubrace,
  allSpellcastersFor,
  featGrantedSpellsFor,
  speciesGrantedSpellsFor,
} from "../../store/selectors";
import {
  characterLevel,
  emptyPlayState,
  newItemId,
  type Character,
  type EntityRef,
  type InventoryItem,
  type PlayState,
} from "../../model/character";
import { ABILITIES, ABILITY_NAMES, SKILLS, type Ability } from "../../engine/constants";
import { formatMod } from "../../engine/modifiers";
import { rollD20, rollDamage, rollDie, type RollMode } from "../../engine/dice";
import { shortRestRestores } from "../../engine/resources";
import { COINS, carryingCapacity, currencyInGp } from "../../engine/currency";
import { cantripDiceMultiplier, scaledCantripDice } from "../../engine/spellcasting";
import { itemModifiers } from "../../engine/modifierEngine";
import { masteryNames } from "../../engine/mastery";
import { isWeapon, unarmedStrikeLine, weaponAttackLine, type AttackLine } from "../../engine/attacks";
import type { Spell } from "../../data/types/spell-content";
import type { Item } from "../../data/types/item-content";
import { itemTypeCode } from "../../data/types/item-content";
import type { Entry } from "../../data/types/common";
import { Entries } from "../../data/entryRenderer/EntryRenderer";
import { FeatureList } from "../common/FeatureList";
import { schoolName } from "../common/spellDisplay";
import { formatWeight } from "../common/itemDisplay";
import { ItemDetail } from "../browser/ItemDetail";
import { SpellDetail } from "../browser/SpellDetail";
import { Icon } from "../common/Icon";

const TABS = ["Actions", "Spells", "Inventory", "Features & Traits", "Background", "Notes", "Extras"] as const;
type Tab = (typeof TABS)[number];

const ACTIONS_IN_COMBAT =
  "Attack, Dash, Disengage, Dodge, Grapple, Help, Hide, Improvise, Influence, Magic, Ready, Search, Shove, Study, Utilize";

/** One resolved dice roll shown in the result toast. */
export interface RollResult {
  label: string;
  detail: string;
  total: number;
}

/**
 * D&D-Beyond-style full character sheet: ability/skill columns on the left, a
 * tabbed panel (Actions / Spells / Inventory / Features / Background / …) on the
 * right. Everything is derived from the character's choices + imported content.
 */
export function FullSheet({ character }: { character: Character }) {
  const index = useContentStore((s) => s.index);
  const derived = deriveFromCharacter(character, index);
  const [tab, setTab] = useState<Tab>("Actions");
  const [hpOpen, setHpOpen] = useState(false);
  const [rollMode, setRollMode] = useState<RollMode>("normal");
  const [lastRoll, setLastRoll] = useState<RollResult>();

  const rollCheck = (label: string, mod: number, advantage?: boolean) => {
    // A modifier-granted advantage applies unless the toggle overrides it.
    const mode = rollMode !== "normal" ? rollMode : advantage ? "advantage" : "normal";
    const r = rollD20(mod, mode);
    setLastRoll({
      label,
      detail: `d20 [${r.rolls.join(", ")}] ${formatMod(mod)}${
        mode !== "normal" ? ` · ${mode}` : ""
      }`,
      total: r.total,
    });
  };
  const rollDamageExpr = (label: string, expr: string) => {
    const r = rollDamage(expr);
    if (!r) return;
    setLastRoll({
      label,
      detail: `${expr} → [${r.rolls.join(", ")}]${r.modifier ? ` ${formatMod(r.modifier)}` : ""}`,
      total: r.total,
    });
  };

  const subtitle = [
    `Level ${characterLevel(character)}`,
    character.race?.name,
    character.classes.map((c) => `${c.name} ${c.level}`).join(" / ") || undefined,
    character.background?.name,
  ]
    .filter(Boolean)
    .join(" · ");

  const maxHp = derived.maxHp;
  const currentHp = maxHp != null ? Math.max(0, maxHp - character.play.damageTaken) : undefined;

  return (
    <article className="space-y-4">
      <header className="panel relative z-10 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 p-5 sm:px-6">
        <div className="detail-head min-w-0 flex-1 pb-3">
          <h1 className="detail-title">{character.name}</h1>
          <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 pb-3">
          <AdvToggle mode={rollMode} onChange={setRollMode} />
          <LevelUp character={character} />
        </div>
      </header>

      <section className="stagger grid grid-cols-3 gap-2.5 sm:grid-cols-6">
        {ABILITIES.map((ab) => (
          <AbilityCard
            key={ab}
            label={ABILITY_NAMES[ab]}
            abbr={ab.toUpperCase()}
            mod={derived.mods[ab]}
            score={derived.abilities[ab]}
            onRoll={() => rollCheck(`${ABILITY_NAMES[ab]} Check`, derived.mods[ab])}
          />
        ))}
      </section>

      <section className="grid grid-cols-3 gap-2.5 text-sm sm:grid-cols-6">
        <Chip label="Prof" value={formatMod(derived.pb)} />
        <Chip
          label="Speed"
          value={`${derived.speed} ft`}
          title={
            derived.encumbrance !== "ok"
              ? `${derived.encumbrance.replace("-", " ")} — variant encumbrance penalty applied`
              : undefined
          }
        />
        <Chip label="Initiative" value={formatMod(derived.initiative)} />
        <Chip label="AC" value={derived.ac} />
        <Chip label="Pass. Per" value={derived.passivePerception} />
        {maxHp != null && currentHp != null ? (
          <button
            type="button"
            onClick={() => setHpOpen(!hpOpen)}
            aria-label="Hit Points"
            title={derived.hitDie ?? undefined}
            aria-expanded={hpOpen}
            className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
              hpOpen ? "row-selected border-accent/40" : "border-line bg-surface hover:border-line-strong"
            }`}
          >
            <div className="eyebrow">HP</div>
            <div className={`mt-0.5 font-mono text-base font-medium ${currentHp === 0 ? "text-accent" : ""}`}>
              {currentHp}/{maxHp}
              {character.play.tempHp > 0 && (
                <span className="ml-1 text-xs text-ink-muted">
                  +{character.play.tempHp}
                </span>
              )}
            </div>
          </button>
        ) : (
          <Chip label="HP" value="—" />
        )}
      </section>

      <EffectsStrip character={character} />

      {hpOpen && maxHp != null && (
        <HpStrip
          character={character}
          maxHp={maxHp}
          conMod={derived.mods.con}
          report={setLastRoll}
        />
      )}

      <div className="grid gap-4 xl:grid-cols-[15rem_15rem_minmax(0,1fr)]">
        <div className="space-y-4">
          <SavingThrows derived={derived} onRoll={rollCheck} />
          <Senses derived={derived} />
          <Defenses derived={derived} />
          <Proficiencies derived={derived} />
        </div>

        <Skills derived={derived} onRoll={rollCheck} />

        <div className="panel min-w-0 p-4 pt-1">
          <nav className="-mx-1 mb-4 flex gap-0.5 overflow-x-auto border-b border-line">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                aria-current={t === tab ? "true" : undefined}
                className="tab"
              >
                {t}
              </button>
            ))}
          </nav>
          <TabPanel
            tab={tab}
            character={character}
            derived={derived}
            onCheck={rollCheck}
            onDamage={rollDamageExpr}
          />
        </div>
      </div>

      {lastRoll && (
        <aside
          role="status"
          key={`${lastRoll.label}:${lastRoll.total}:${lastRoll.detail}`}
          className="glass fixed bottom-4 right-4 z-20 w-64 animate-settle-in rounded-xl border border-line p-4 shadow-xl print:hidden"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="eyebrow">
              {lastRoll.label}
            </span>
            <button
              type="button"
              onClick={() => setLastRoll(undefined)}
              aria-label="Dismiss roll"
              className="btn btn-ghost btn-icon -mr-2 -mt-2 min-h-8 min-w-8"
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="mt-1 font-mono text-4xl font-medium tracking-tight text-ink">{lastRoll.total}</div>
          <div className="mt-1 font-mono text-xs text-ink-muted">{lastRoll.detail}</div>
        </aside>
      )}
    </article>
  );
}

/**
 * Toggleable effects: Mage-Armor-style AC formulas detected in the
 * character's known spells. Active ones join the AC derivation.
 */
function EffectsStrip({ character }: { character: Character }) {
  const index = useContentStore((s) => s.index);
  const updateSheet = useCharacterStore((s) => s.updateSheet);
  const candidates = effectAcFormulaCandidates(character, index);
  if (candidates.length === 0) return null;

  const toggle = (name: string) =>
    updateSheet(character.id, (c) => ({
      play: {
        ...c.play,
        activeEffects: c.play.activeEffects.includes(name)
          ? c.play.activeEffects.filter((n) => n !== name)
          : [...c.play.activeEffects, name],
      },
    }));

  return (
    <section className="panel flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm print:hidden">
      <span className="eyebrow">Effects</span>
      {candidates.map((f) => {
        const active = character.play.activeEffects.includes(f.name);
        return (
          <button
            key={f.name}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(f.name)}
            title={`AC ${f.base} + ${f.abilities.join("/")} while unarmored — toggle when cast`}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              active
                ? "border-accent bg-accent text-on-accent"
                : "border-line-strong text-ink-muted hover:text-ink"
            }`}
          >
            {f.name}
          </button>
        );
      })}
    </section>
  );
}

/** Advantage / disadvantage toggle for every d20 roll on the sheet. */
function AdvToggle({ mode, onChange }: { mode: RollMode; onChange: (mode: RollMode) => void }) {
  return (
    <span className="segmented print:hidden">
      {(["advantage", "disadvantage"] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          title={`Roll d20s with ${m}`}
          onClick={() => onChange(mode === m ? "normal" : m)}
          className="px-2.5 py-1 text-xs"
        >
          {m === "advantage" ? "Adv" : "Dis"}
        </button>
      ))}
    </span>
  );
}

function TabPanel({
  tab,
  character,
  derived,
  onCheck,
  onDamage,
}: {
  tab: Tab;
  character: Character;
  derived: ReturnType<typeof deriveFromCharacter>;
  onCheck: (label: string, mod: number) => void;
  onDamage: (label: string, expr: string) => void;
}) {
  switch (tab) {
    case "Actions":
      return (
        <ActionsTab character={character} derived={derived} onCheck={onCheck} onDamage={onDamage} />
      );
    case "Spells":
      return <SpellsTab character={character} />;
    case "Inventory":
      return <InventoryTab character={character} />;
    case "Features & Traits":
      return <FeaturesTab character={character} />;
    case "Background":
      return <BackgroundTab character={character} />;
    case "Notes":
      return <NotesTab character={character} />;
    case "Extras":
      return <ExtrasTab character={character} />;
  }
}

/** Companions/familiars: attach imported monsters and show a mini statblock. */
function ExtrasTab({ character }: { character: Character }) {
  const index = useContentStore((s) => s.index);
  const entities = useActiveEntities();
  const updateSheet = useCharacterStore((s) => s.updateSheet);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");

  const pool = listByType(entities, "monster");
  const matches = query
    ? pool.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())).slice(0, 12)
    : [];

  const addExtra = (ref: EntityRef) =>
    updateSheet(character.id, (c) => ({ extras: [...c.extras, ref] }));
  const removeExtra = (i: number) =>
    updateSheet(character.id, (c) => ({ extras: c.extras.filter((_, j) => j !== i) }));

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <AddButton open={adding} onClick={() => setAdding(!adding)} label="Add Creature" />
      </div>
      {adding && (
        <div className="rounded-lg border border-line bg-surface-sunk p-3 print:hidden">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search creatures to add…"
            className="w-full field field-sm"
            autoFocus
          />
          {query && (
            <ul className="mt-1.5 max-h-48 animate-fade-in overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-[var(--shadow-lg)]">
              {matches.length === 0 && <li className="px-2 py-1 text-sm text-ink-muted">No matches.</li>}
              {matches.map((m) => (
                <li key={`${m.name}|${m.source}`}>
                  <button
                    type="button"
                    onClick={() => addExtra({ name: m.name, source: m.source })}
                    className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-ink/5"
                  >
                    {m.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {character.extras.length === 0 ? (
        <Empty>No pets, summons, or companions — add imported creatures above.</Empty>
      ) : (
        character.extras.map((ref, i) => (
          <MiniStatblock
            key={`${ref.name}-${i}`}
            entity={index.get("monster", ref.name, ref.source)}
            name={ref.name}
            onRemove={() => removeExtra(i)}
          />
        ))
      )}
    </div>
  );
}

/** Lenient statblock card for an attached creature. */
function MiniStatblock({
  entity,
  name,
  onRemove,
}: {
  entity?: Record<string, unknown>;
  name: string;
  onRemove: () => void;
}) {
  const m = (entity ?? {}) as {
    ac?: unknown[];
    hp?: { average?: number; formula?: string };
    speed?: number | Record<string, unknown>;
    trait?: { name?: string; entries?: Entry[] }[];
    action?: { name?: string; entries?: Entry[] }[];
  } & Partial<Record<Ability, number>>;

  const ac = (m.ac ?? [])
    .map((a) => (typeof a === "number" ? a : (a as { ac?: number }).ac))
    .filter((a) => a != null)
    .join(", ");
  const speed =
    typeof m.speed === "number"
      ? `${m.speed} ft.`
      : m.speed && typeof (m.speed as { walk?: number }).walk === "number"
        ? `${(m.speed as { walk: number }).walk} ft.`
        : undefined;
  const blocks = [...(m.trait ?? []), ...(m.action ?? [])].filter(
    (b): b is { name: string; entries?: Entry[] } => typeof b?.name === "string",
  );

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold tracking-tight text-ink">{name}</h3>
        <button
          type="button"
          onClick={onRemove}
          title="Remove creature"
          aria-label={`Remove ${name}`}
          className="btn btn-ghost btn-icon min-h-8 min-w-8 hover:text-accent print:hidden"
        >
          <Icon name="close" />
        </button>
      </div>
      {!entity ? (
        <p className="text-sm text-ink-muted">Not in the imported content.</p>
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            {ac && (
              <>
                <strong>AC</strong> {ac} ·{" "}
              </>
            )}
            {m.hp?.average != null && (
              <>
                <strong>HP</strong> {m.hp.average}
                {m.hp.formula ? ` (${m.hp.formula})` : ""} ·{" "}
              </>
            )}
            {speed && (
              <>
                <strong>Speed</strong> {speed}
              </>
            )}
          </p>
          <p className="eyebrow">
            {ABILITIES.map((ab) => `${ab} ${m[ab] ?? "—"}`).join(" · ")}
          </p>
          {blocks.length > 0 && (
            <div className="mt-2 space-y-1 border-t border-line pt-2 text-sm">
              {blocks.map((b, i) => (
                <div key={`${b.name}-${i}`}>
                  <span className="font-semibold text-ink">{b.name}. </span>
                  {b.entries && (
                    <span className="[&>*]:inline">
                      <Entries entries={b.entries} />
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ---------- left column ---------- */

function AbilityCard({
  label,
  abbr,
  mod,
  score,
  onRoll,
}: {
  label: string;
  /** "STR", "DEX", … — shown instead of the full name where cards are too narrow. */
  abbr: string;
  mod: number;
  score: number;
  onRoll: () => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-2 pb-3 pt-2.5 text-center shadow-sm">
      <div className="eyebrow" title={label}>
        <span className="md:hidden">{abbr}</span>
        <span className="max-md:hidden">{label}</span>
      </div>
      <button
        type="button"
        onClick={onRoll}
        aria-label={`Roll ${label} check`}
        title="Roll an ability check"
        className="mt-1 w-full rounded-md font-mono text-2xl font-medium leading-tight tracking-tight transition-colors hover:text-accent"
      >
        {formatMod(mod)}
      </button>
      <div className="mx-auto mt-2 w-10 rounded-full border border-line bg-surface-sunk py-0.5 font-mono text-xs text-ink-muted">
        {score}
      </div>
    </div>
  );
}

function Chip({ label, value, title }: { label: string; value: string | number; title?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2.5" title={title}>
      <div className="eyebrow">{label}</div>
      <div className="mt-0.5 font-mono text-base font-medium">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel p-4">
      <h2 className="eyebrow mb-3">{title}</h2>
      {children}
    </section>
  );
}

function SavingThrows({
  derived,
  onRoll,
}: {
  derived: ReturnType<typeof deriveFromCharacter>;
  onRoll: (label: string, mod: number) => void;
}) {
  return (
    <Panel title="Saving Throws">
      <ul className="space-y-0.5 text-sm">
        {ABILITIES.map((ab) => (
          <li key={ab} className="flex items-center gap-2">
            <ProfDot on={derived.saves[ab].proficient} />
            <span className="flex-1">{ABILITY_NAMES[ab]}</span>
            <button
              type="button"
              onClick={() => onRoll(`${ABILITY_NAMES[ab]} Save`, derived.saves[ab].mod)}
              aria-label={`Roll ${ABILITY_NAMES[ab]} save`}
              title="Roll this saving throw"
              className="font-mono font-medium hover:text-accent hover:underline"
            >
              {formatMod(derived.saves[ab].mod)}
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Senses({ derived }: { derived: ReturnType<typeof deriveFromCharacter> }) {
  const rows: [string, number][] = [
    ["Passive Perception", derived.passivePerception],
    ["Passive Investigation", 10 + derived.skills.investigation.mod],
    ["Passive Insight", 10 + derived.skills.insight.mod],
  ];
  return (
    <Panel title="Senses">
      <ul className="space-y-0.5 text-sm">
        {rows.map(([label, value]) => (
          <li key={label} className="flex items-center gap-2">
            <span className="w-7 text-center font-mono font-medium">{value}</span>
            <span className="flex-1 text-ink-muted">{label}</span>
          </li>
        ))}
      </ul>
      {derived.senses.length > 0 && (
        <p className="mt-1 border-t border-line pt-1 text-sm text-ink-muted">
          {derived.senses.join(", ")}
        </p>
      )}
    </Panel>
  );
}

/** Damage resistances / immunities from species traits. */
function Defenses({ derived }: { derived: ReturnType<typeof deriveFromCharacter> }) {
  const rows: [string, string[]][] = [
    ["Resistances", derived.resistances],
    ["Immunities", derived.immunities],
  ];
  const shown = rows.filter(([, v]) => v.length > 0);
  if (shown.length === 0) return null;
  return (
    <Panel title="Defenses">
      <ul className="space-y-1 text-xs text-ink-muted">
        {shown.map(([label, values]) => (
          <li key={label}>
            <span className="eyebrow">{label}</span>
            <div className="capitalize">{values.join(", ")}</div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Proficiencies({ derived }: { derived: ReturnType<typeof deriveFromCharacter> }) {
  const p = derived.proficiencies;
  const rows: [string, string[]][] = [
    ["Armor", p.armor],
    ["Weapons", p.weapons],
    ["Tools", [...p.tools.fixed, ...p.tools.notes]],
    ["Languages", [...p.languages.fixed, ...p.languages.notes]],
  ];
  const shown = rows.filter(([, v]) => v.length > 0);
  if (shown.length === 0) return null;
  return (
    <Panel title="Proficiencies & Languages">
      <ul className="space-y-1 text-xs text-ink-muted">
        {shown.map(([label, values]) => (
          <li key={label}>
            <span className="eyebrow">{label}</span>
            <div>{values.join(", ")}</div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Skills({
  derived,
  onRoll,
}: {
  derived: ReturnType<typeof deriveFromCharacter>;
  onRoll: (label: string, mod: number, advantage?: boolean) => void;
}) {
  return (
    <Panel title="Skills">
      <ul className="space-y-0.5 text-sm">
        {SKILLS.map((skill) => {
          const s = derived.skills[skill.id];
          const advSources = derived.advantages[skill.id];
          return (
            <li key={skill.id} className="flex items-center gap-2">
              <ProfDot on={s.proficient} expertise={s.expertise} />
              <span className="w-8 font-mono text-2xs uppercase text-ink-muted">{skill.ability}</span>
              <span className="flex-1">
                {skill.name}
                {advSources && (
                  <span
                    className="ml-1 align-middle eyebrow"
                    title={`Advantage: ${advSources.join(", ")}`}
                  >
                    adv
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => onRoll(skill.name, s.mod, !!advSources)}
                aria-label={`Roll ${skill.name}`}
                title={advSources ? "Roll with advantage" : "Roll this skill check"}
                className="font-mono font-medium hover:text-accent hover:underline"
              >
                {formatMod(s.mod)}
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ---------- tabs ---------- */

/** Parse a formatted to-hit like "+5" / "−1" back to a number. */
function parseHit(hit: string): number {
  return Number(hit.replace("−", "-").replace("+", "")) || 0;
}

function ActionsTab({
  character,
  derived,
  onCheck,
  onDamage,
}: {
  character: Character;
  derived: ReturnType<typeof deriveFromCharacter>;
  onCheck: (label: string, mod: number) => void;
  onDamage: (label: string, expr: string) => void;
}) {
  const index = useContentStore((s) => s.index);
  const [expanded, setExpanded] = useState<number>();
  const weaponProfs = derived.proficiencies.weapons;

  const rows: { item?: Item; line: AttackLine }[] = character.inventory
    .map((it) => itemForEntry(it, index))
    .filter((item): item is Item => !!item && isWeapon(item))
    .map((item) => {
      const line = weaponAttackLine(item, derived.mods, derived.pb, weaponProfs);
      // Mastered weapon kinds show their mastery property (2024).
      if (character.weaponMasteries.includes(item.name)) {
        const mastery = masteryNames(item).join(", ");
        if (mastery) {
          line.notes = [line.notes, `Mastery: ${mastery}`].filter(Boolean).join(" · ");
        }
      }
      return { item, line };
    });
  rows.push({ line: unarmedStrikeLine(derived.mods, derived.pb) });

  return (
    <div className="space-y-4">
      <ResourceTracker character={character} />
      <div>
        <div className="eyebrow grid grid-cols-[1fr_auto_auto] gap-x-3 border-b border-line pb-1.5">
          <span>Attack</span>
          <span className="text-center">Hit/DC</span>
          <span>Damage</span>
        </div>
        <ul>
          {rows.map(({ item, line: l }, i) => (
            <li key={`${l.name}-${i}`} className="border-b border-line py-1.5 text-sm">
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3">
                <span>
                  {item ? (
                    <button
                      type="button"
                      onClick={() => setExpanded(expanded === i ? undefined : i)}
                      className="font-semibold hover:text-accent hover:underline"
                      title="Show item details"
                    >
                      {l.name}
                    </button>
                  ) : (
                    <span className="font-semibold">{l.name}</span>
                  )}
                  <span className="block font-mono text-2xs uppercase text-ink-muted">
                    {l.range}
                    {l.notes ? ` · ${l.notes}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onCheck(`${l.name} Attack`, parseHit(l.hit))}
                  aria-label={`Roll attack: ${l.name}`}
                  title="Roll to hit"
                  className="rounded-md border border-line-strong px-2 text-center font-mono font-medium transition-colors hover:border-accent hover:text-accent"
                >
                  {l.hit}
                </button>
                {/\d+d\d+/.test(l.damage) ? (
                  <button
                    type="button"
                    onClick={() => onDamage(`${l.name} Damage`, l.damage)}
                    aria-label={`Roll damage: ${l.name}`}
                    title="Roll damage"
                    className="text-left font-mono hover:text-accent hover:underline"
                  >
                    {l.damage}
                  </button>
                ) : (
                  <span className="font-mono">{l.damage}</span>
                )}
              </div>
              {expanded === i && item && (
                <div className="mt-2">
                  <ItemDetail item={item} embedded />
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <CustomAttacks character={character} onCheck={onCheck} onDamage={onDamage} />

      <div>
        <h3 className="mb-1.5 text-sm font-semibold tracking-tight text-ink">Actions in Combat</h3>
        <p className="border-l-2 border-line pl-3 text-sm leading-relaxed text-ink-muted">{ACTIONS_IN_COMBAT}</p>
      </div>
    </div>
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
        <h3 className="text-sm font-semibold tracking-tight text-ink">Custom Attacks</h3>
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
          <button
            type="button"
            onClick={add}
            className="btn btn-primary btn-sm"
          >
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
  );
}

function SpellsTab({ character }: { character: Character }) {
  const index = useContentStore((s) => s.index);
  const entities = useActiveEntities();
  const updateSheet = useCharacterStore((s) => s.updateSheet);
  const casters = allSpellcastersFor(character, index);

  const [expanded, setExpanded] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [forClass, setForClass] = useState<string>();

  const resolveSpell = (ref: EntityRef) =>
    index.get("spell", ref.name, ref.source) as unknown as Spell | undefined;

  interface SheetSpell {
    ref: EntityRef;
    spell?: Spell;
    /** Granted (not chosen here): tagged with where it came from. */
    tag?: "Feat" | "Species";
  }
  const byLevel = new Map<number, SheetSpell[]>();
  const add = (fallbackLevel: number, ref: EntityRef, tag?: "Feat" | "Species") => {
    const spell = resolveSpell(ref);
    const level = spell?.level ?? fallbackLevel;
    const list = byLevel.get(level) ?? [];
    if (list.some((s) => s.ref.name === ref.name)) return;
    list.push({ ref, spell, tag });
    byLevel.set(level, list);
  };
  for (const ref of character.cantrips) add(0, ref);
  for (const ref of character.spells) add(1, ref);
  for (const ref of featGrantedSpellsFor(character, index)) add(1, ref, "Feat");
  for (const ref of speciesGrantedSpellsFor(character, index)) add(0, ref, "Species");

  const knownNames = new Set([...byLevel.values()].flat().map((s) => s.ref.name));

  // The add menu adheres to the active caster class's spell list (same
  // filtering as the builder: sources.json mapping, flood guard, level cap).
  const activeClassName =
    casters.length > 1 ? (forClass ?? casters[0]?.className) : casters[0]?.className;
  const activeCaster = casters.find((sc) => sc.className === activeClassName);
  const pool = useMemo(
    () =>
      activeCaster
        ? availableSpells(
            entities,
            activeCaster.className,
            activeCaster.summary.maxSpellLevel,
            index,
            activeCaster.classSource,
          )
        : [],
    [entities, index, activeCaster],
  );
  const matches = query
    ? pool.filter((s) => s.name.toLowerCase().includes(query.toLowerCase())).slice(0, 12)
    : [];

  const addSpell = (s: Spell) => {
    // Tag the pick with the caster class so per-class limits stay meaningful.
    const pick = { name: s.name, source: s.source, forClass: activeClassName };
    updateSheet(character.id, (c) =>
      s.level === 0 ? { cantrips: [...c.cantrips, pick] } : { spells: [...c.spells, pick] },
    );
  };
  const removeSpell = (ref: EntityRef) => {
    const gone = (r: EntityRef) => r.name === ref.name && r.source === ref.source;
    updateSheet(character.id, (c) => ({
      cantrips: c.cantrips.filter((r) => !gone(r)),
      spells: c.spells.filter((r) => !gone(r)),
    }));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          {casters.length === 0 && byLevel.size === 0 && (
            <p className="text-sm text-ink-muted">Not a spellcaster.</p>
          )}
          {casters.map((sc) => (
            <p key={sc.classIndex} className="text-sm">
              {casters.length > 1 && <strong>{sc.className}: </strong>}
              Save DC <strong>{sc.summary.saveDc}</strong> · Attack{" "}
              <strong>{formatMod(sc.summary.attackBonus)}</strong> ·{" "}
              {ABILITY_NAMES[sc.summary.ability as Ability] ?? sc.summary.ability}
            </p>
          ))}
          <SlotTracker character={character} casters={casters} />
        </div>
        {casters.length > 0 && (
          <AddButton open={adding} onClick={() => setAdding(!adding)} label="Add Spell" />
        )}
      </div>

      {adding && (
        <div className="rounded-lg border border-line bg-surface-sunk p-3 print:hidden">
          {casters.length > 1 && (
            <label className="mb-1 flex items-center gap-2 text-xs text-ink-muted">
              Add for
              <select
                value={forClass ?? casters[0]?.className}
                onChange={(e) => setForClass(e.target.value)}
                className="field field-sm"
              >
                {casters.map((sc) => (
                  <option key={sc.classIndex} value={sc.className}>
                    {sc.className}
                  </option>
                ))}
              </select>
            </label>
          )}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search spells to add…"
            className="w-full field field-sm"
            autoFocus
          />
          {query && (
            <ul className="mt-1.5 max-h-48 animate-fade-in overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-[var(--shadow-lg)]">
              {matches.length === 0 && <li className="px-2 py-1 text-sm text-ink-muted">No matches.</li>}
              {matches.map((s) => {
                const known = knownNames.has(s.name);
                return (
                  <li key={`${s.name}|${s.source}`}>
                    <button
                      type="button"
                      disabled={known}
                      onClick={() => addSpell(s)}
                      className="flex w-full justify-between rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-ink/5 disabled:opacity-40"
                    >
                      <span>{s.name}</span>
                      <span className="font-mono text-2xs uppercase text-ink-muted">
                        {known ? "added" : s.level === 0 ? "cantrip" : `lvl ${s.level}`}
                        {!known && s.school ? ` · ${schoolName(s.school)}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {byLevel.size === 0 ? (
        casters.length > 0 && <Empty>No spells chosen yet.</Empty>
      ) : (
        [...byLevel.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([level, spells]) => (
            <div key={level}>
              <h3 className="eyebrow">
                {levelLabel(level)}
                {level === 0 && cantripDiceMultiplier(characterLevel(character)) > 1 && (
                  <span className="ml-1 font-semibold normal-case text-ink-muted">
                    · damage dice ×{cantripDiceMultiplier(characterLevel(character))}
                  </span>
                )}
              </h3>
              <ul className="grid gap-0.5 sm:grid-cols-2">
                {spells.map((s) => {
                  const open = expanded === s.ref.name;
                  return (
                    <li key={s.ref.name} className={open ? "sm:col-span-2" : ""}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span>
                          <button
                            type="button"
                            onClick={() => setExpanded(open ? undefined : s.ref.name)}
                            className="text-left hover:text-accent hover:underline"
                            title="Show spell details"
                          >
                            {s.ref.name}
                          </button>
                          {s.tag && (
                            <span className="chip chip-accent ml-1">
                              {s.tag}
                            </span>
                          )}
                          {s.spell?.meta?.ritual && (
                            <span className="chip ml-1">
                              Ritual
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-2xs uppercase text-ink-muted">
                          {s.spell &&
                            scaledCantripDice(s.spell, characterLevel(character)) && (
                              <span
                                className="mr-1 font-medium text-accent"
                                title="Damage dice at your character level"
                              >
                                {scaledCantripDice(s.spell, characterLevel(character))}
                              </span>
                            )}
                          {s.spell?.school && schoolName(s.spell.school)}
                        </span>
                      </div>
                      {open && (
                        <div className="my-1 space-y-1">
                          {s.spell ? (
                            <SpellDetail spell={s.spell} embedded />
                          ) : (
                            <p className="text-xs text-ink-muted">
                              No imported spell data for this entry.
                            </p>
                          )}
                          {s.tag ? (
                            <p className="text-2xs text-ink-muted print:hidden">
                              Granted by a {s.tag.toLowerCase()} — manage it in the builder.
                            </p>
                          ) : (
                            <button
                              type="button"
                              onClick={() => removeSpell(s.ref)}
                              className="text-xs text-accent underline print:hidden"
                            >
                              Remove spell
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
      )}
    </div>
  );
}

const WEARABLE_CODES = ["LA", "MA", "HA", "S"];

function InventoryTab({ character }: { character: Character }) {
  const index = useContentStore((s) => s.index);
  const entities = useActiveEntities();
  const updateSheet = useCharacterStore((s) => s.updateSheet);

  const [expanded, setExpanded] = useState<number>();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");

  const pool = useMemo(
    () => [...listByType(entities, "item"), ...listByType(entities, "baseitem")],
    [entities],
  );
  const matches = query
    ? pool.filter((i) => i.name.toLowerCase().includes(query.toLowerCase())).slice(0, 12)
    : [];

  const editInventory = (fn: (inv: InventoryItem[]) => InventoryItem[]) =>
    updateSheet(character.id, (c) => ({ inventory: fn(c.inventory) }));
  const addItem = (ref: EntityRef) =>
    editInventory((inv) => [...inv, { ref, name: ref.name, quantity: 1, equipped: false }]);
  const removeItem = (i: number) => {
    setExpanded(undefined);
    editInventory((inv) => inv.filter((_, j) => j !== i));
  };
  const setQuantity = (i: number, quantity: number) =>
    editInventory((inv) =>
      inv.map((it, j) => (j === i ? { ...it, quantity: Math.max(1, quantity) } : it)),
    );
  const toggleEquip = (i: number) =>
    editInventory((inv) => inv.map((it, j) => (j === i ? { ...it, equipped: !it.equipped } : it)));

  const toggleAttune = (i: number) =>
    editInventory((inv) => inv.map((it, j) => (j === i ? { ...it, attuned: !it.attuned } : it)));
  const setContainedIn = (i: number, containerId: string | undefined) =>
    editInventory((inv) =>
      inv.map((it, j) => (j === i ? { ...it, containedIn: containerId } : it)),
    );
  const attuned = attunedCount(character);

  const rows = character.inventory.map((entry, i) => ({
    entry,
    i,
    item: itemForEntry(entry, index),
  }));
  const containers = rows.filter((r) => r.item?.containerCapacity && r.entry.id);
  const byId = new Map(character.inventory.map((e) => [e.id, e]));
  // A container can't be packed into itself or its own contents (no cycles).
  const wouldCycle = (row: InventoryItem, target: InventoryItem): boolean => {
    let holderId: string | undefined = target.id;
    const visited = new Set<string>();
    while (holderId && !visited.has(holderId)) {
      if (holderId === row.id) return true;
      visited.add(holderId);
      holderId = byId.get(holderId)?.containedIn;
    }
    return false;
  };
  const totalWeight = inventoryWeight(character, index);
  const capacity = carryingCapacity(deriveFromCharacter(character, index).abilities.str);

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <AddButton open={adding} onClick={() => setAdding(!adding)} label="Add Item" />
      </div>

      {adding && (
        <div className="rounded-lg border border-line bg-surface-sunk p-3 print:hidden">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items to add…"
            className="w-full field field-sm"
            autoFocus
          />
          {query && (
            <ul className="mt-1.5 max-h-48 animate-fade-in overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-[var(--shadow-lg)]">
              {matches.length === 0 && <li className="px-2 py-1 text-sm text-ink-muted">No matches.</li>}
              {matches.map((i) => (
                <li key={`${i.name}|${i.source}`}>
                  <button
                    type="button"
                    onClick={() => addItem({ name: i.name, source: i.source })}
                    className="flex w-full justify-between rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-ink/5"
                  >
                    <span>{i.name}</span>
                    <span className="font-mono text-2xs uppercase text-ink-muted">
                      {itemTypeCode(i.type as string) ?? "item"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <CustomItemForm character={character} />
        </div>
      )}

      {rows.length === 0 ? (
        <Empty>No items yet — use “+ Add Item” to search the imported gear.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map(({ entry, i, item }) => {
            const code = itemTypeCode(item?.type);
            // Modifier-carrying wondrous items (AC bonuses, set-scores,
            // advantage text) are equippable too, so their effects can apply.
            const equippable =
              WEARABLE_CODES.includes(code ?? "") ||
              (!!item && isWeapon(item)) ||
              (!!item && itemModifiers(item).length > 0);
            const open = expanded === i;
            return (
              <li key={`${entry.name}-${i}`} className="py-1.5 text-sm">
                <div className="flex items-center gap-2">
                  {item ? (
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? undefined : i)}
                      className="flex-1 text-left hover:text-accent hover:underline"
                      title="Show item details"
                    >
                      {entry.name}
                    </button>
                  ) : (
                    <span className="flex-1">{entry.name}</span>
                  )}

                  <label className="flex items-center gap-1 text-xs text-ink-muted print:hidden">
                    ×
                    <input
                      type="number"
                      min={1}
                      value={entry.quantity}
                      onChange={(e) => setQuantity(i, Number(e.target.value) || 1)}
                      className="w-12 field field-sm text-center"
                    />
                  </label>
                  {entry.quantity > 1 && (
                    <span className="hidden text-xs text-ink-muted print:inline">×{entry.quantity}</span>
                  )}

                  {equippable && (
                    <button
                      type="button"
                      onClick={() => toggleEquip(i)}
                      aria-pressed={entry.equipped}
                      className={`rounded-full border px-2 py-px font-mono text-2xs uppercase transition-colors print:hidden ${
                        entry.equipped
                          ? "border-accent/40 bg-accent/8 text-accent"
                          : "border-line-strong text-ink-muted hover:text-ink"
                      }`}
                    >
                      {entry.equipped ? "Equipped" : "Equip"}
                    </button>
                  )}
                  {entry.equipped && (
                    <span className="chip chip-accent hidden print:inline-flex">
                      Equipped
                    </span>
                  )}
                  {item?.reqAttune && (
                    <button
                      type="button"
                      onClick={() => toggleAttune(i)}
                      disabled={!entry.attuned && attuned >= 3}
                      title={
                        entry.attuned
                          ? "End attunement"
                          : attuned >= 3
                            ? "Attunement limit reached (3 items)"
                            : "Attune to this item"
                      }
                      aria-pressed={entry.attuned}
                      className={`rounded-full border px-2 py-px font-mono text-2xs uppercase transition-colors print:hidden ${
                        entry.attuned
                          ? "border-accent bg-accent text-on-accent"
                          : "border-line-strong text-ink-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-ink-muted"
                      }`}
                    >
                      {entry.attuned ? "Attuned" : "Attune"}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="btn btn-ghost btn-icon min-h-8 min-w-8 hover:text-accent print:hidden"
                    title="Remove item"
                    aria-label={`Remove ${entry.name}`}
                  >
                    <Icon name="close" />
                  </button>
                </div>
                {(item?.charges != null ||
                  item?.containerCapacity != null ||
                  containers.length > 0) && (
                  <div className="mt-1 flex flex-wrap items-center gap-3 pl-1">
                    {item?.charges != null && (
                      <SlotPips
                        label={`${entry.name} charges`}
                        total={item.charges}
                        used={character.play.usedItemCharges[entry.name] ?? 0}
                        onChange={(used) =>
                          updateSheet(character.id, (c) => ({
                            play: {
                              ...c.play,
                              usedItemCharges: {
                                ...c.play.usedItemCharges,
                                [entry.name]: used,
                              },
                            },
                          }))
                        }
                      />
                    )}
                    {item?.containerCapacity != null && entry.id && (
                      <ContainerLoad character={character} containerId={entry.id} capacity={item.containerCapacity} />
                    )}
                    {(() => {
                      // Any container except itself/descendants can hold this row.
                      const targets = containers.filter((c) => !wouldCycle(entry, c.entry));
                      if (targets.length === 0) return null;
                      return (
                        <label className="flex items-center gap-1 text-2xs uppercase text-ink-muted print:hidden">
                          In
                          <select
                            value={entry.containedIn ?? ""}
                            aria-label={`Container for ${entry.name}`}
                            onChange={(e) => setContainedIn(i, e.target.value || undefined)}
                            className="field field-sm normal-case"
                          >
                            <option value="">— carried —</option>
                            {targets.map((c) => (
                              <option key={c.entry.id} value={c.entry.id}>
                                {c.entry.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      );
                    })()}
                  </div>
                )}
                {open && item && (
                  <div className="mt-2">
                    <ItemDetail item={item} embedded />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2">
        <span className="eyebrow">Currency</span>
        {COINS.map((coin) => (
          <label key={coin} className="flex items-center gap-1 font-mono text-2xs uppercase text-ink-muted">
            {coin}
            <input
              type="number"
              min={0}
              value={character.currency[coin]}
              aria-label={coin.toUpperCase()}
              onChange={(e) => {
                const value = Math.max(0, Number(e.target.value) || 0);
                updateSheet(character.id, (c) => ({ currency: { ...c.currency, [coin]: value } }));
              }}
              className="w-14 field field-sm text-center print:border-0"
            />
          </label>
        ))}
        <span className="text-xs text-ink-muted">≈ {currencyInGp(character.currency)} gp</span>
      </div>

      <p
        className={`text-xs ${totalWeight > capacity ? "font-semibold text-accent" : "text-ink-muted"}`}
        title="Carrying capacity: Strength × 15 lb."
      >
        Total Weight: {formatWeight(totalWeight)} / {capacity} lb.
        {totalWeight > capacity && " — over capacity"}
        {attuned > 0 && ` · Attuned: ${attuned}/3`}
      </p>
    </div>
  );
}

/** A container row's load line: direct+nested contents weight vs capacity. */
function ContainerLoad({
  character,
  containerId,
  capacity,
}: {
  character: Character;
  containerId: string;
  capacity: { weight?: number[]; weightless?: boolean };
}) {
  const index = useContentStore((s) => s.index);
  const load = containerContentsWeight(character, index, containerId);
  const cap = capacity.weight?.[0];
  const over = cap !== undefined && load > cap;
  if (load === 0 && cap === undefined) return null;
  return (
    <span
      className={`font-mono text-2xs uppercase ${over ? "font-medium text-accent" : "text-ink-muted"}`}
      title={capacity.weightless ? "Contents weigh nothing while inside" : undefined}
    >
      holds {formatWeight(load)}
      {cap !== undefined && ` / ${cap} lb`}
      {over && " — over capacity"}
    </span>
  );
}

/** Mini-form to add an ad-hoc item (name, weight, optional damage). */
function CustomItemForm({ character }: { character: Character }) {
  const updateSheet = useCharacterStore((s) => s.updateSheet);
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  const [damage, setDamage] = useState("");

  const add = () => {
    if (!name.trim()) return;
    updateSheet(character.id, (c) => ({
      inventory: [
        ...c.inventory,
        {
          id: newItemId(),
          name: name.trim(),
          quantity: 1,
          equipped: false,
          custom: {
            weight: Number(weight) || undefined,
            dmg1: damage.trim().split(" ")[0] || undefined,
            dmgType: damage.trim().split(" ").slice(1).join(" ") || undefined,
          },
        },
      ],
    }));
    setName("");
    setWeight("");
    setDamage("");
  };

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-line pt-2 text-sm">
      <span className="eyebrow">
        Custom item
      </span>
      <input
        value={name}
        aria-label="Custom item name"
        placeholder="Name"
        onChange={(e) => setName(e.target.value)}
        className="w-36 field field-sm"
      />
      <input
        value={weight}
        aria-label="Custom item weight"
        placeholder="lb."
        onChange={(e) => setWeight(e.target.value)}
        className="w-16 field field-sm"
      />
      <input
        value={damage}
        aria-label="Custom item damage"
        placeholder="1d6 fire (optional)"
        onChange={(e) => setDamage(e.target.value)}
        className="w-36 field field-sm"
      />
      <button
        type="button"
        onClick={add}
        className="btn btn-primary btn-sm"
      >
        Add custom
      </button>
    </div>
  );
}

function FeaturesTab({ character }: { character: Character }) {
  const index = useContentStore((s) => s.index);
  const entities = useActiveEntities();
  const { features, subclassFeatures } = classFeaturesFor(character, entities, index);
  const chosen = chosenOptionalFeaturesFor(character, index);

  const race = resolveRace(index, character.race);
  const subrace = resolveSubrace(index, character.subrace);
  const racialTraits: { name: string; entries?: Entry[] }[] = [
    ...(race?.entries ? [{ name: race.name, entries: race.entries }] : []),
    ...(subrace?.entries ? [{ name: subrace.name, entries: subrace.entries }] : []),
  ];
  const feats = resolveCharacterFeats(character, index).map((rf) => rf.feat);

  const empty =
    features.length === 0 &&
    subclassFeatures.length === 0 &&
    chosen.length === 0 &&
    racialTraits.length === 0 &&
    feats.length === 0;
  if (empty) return <Empty>No features or traits yet.</Empty>;

  return (
    <div className="space-y-4">
      {(features.length > 0 || subclassFeatures.length > 0) && (
        <Group title="Class Features">
          <FeatureList features={[...features, ...subclassFeatures]} />
        </Group>
      )}
      {chosen.length > 0 && (
        <Group title="Feature Choices">
          <EntryBlocks blocks={chosen} />
        </Group>
      )}
      {racialTraits.length > 0 && (
        <Group title="Species Traits">
          <EntryBlocks blocks={racialTraits} />
        </Group>
      )}
      {feats.length > 0 && (
        <Group title="Feats">
          <EntryBlocks blocks={feats} />
        </Group>
      )}
    </div>
  );
}

function BackgroundTab({ character }: { character: Character }) {
  const index = useContentStore((s) => s.index);
  const background = backgroundFor(character, index);
  const d = character.details;

  const chips: [string, string][] = [
    ["Alignment", d.alignment],
    ["Faith", d.faith],
    ["Lifestyle", d.lifestyle],
  ];
  const physical: [string, string][] = [
    ["Hair", d.hair],
    ["Skin", d.skin],
    ["Eyes", d.eyes],
    ["Height", d.height],
    ["Weight", d.weight],
    ["Age", d.age],
    ["Gender", d.gender],
  ];
  const personal: [string, string][] = [
    ["Personality Traits", d.personalityTraits],
    ["Ideals", d.ideals],
    ["Bonds", d.bonds],
    ["Flaws", d.flaws],
    ["Appearance", d.appearance],
    ["Backstory", d.backstory],
  ];
  const shownChips = chips.filter(([, v]) => v);
  const shownPhysical = physical.filter(([, v]) => v);
  const shownPersonal = personal.filter(([, v]) => v);
  const hasDetails = shownChips.length > 0 || shownPhysical.length > 0 || shownPersonal.length > 0;

  if (!background && !hasDetails) return <Empty>No background chosen.</Empty>;

  return (
    <div className="space-y-4">
      {shownChips.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {shownChips.map(([label, value]) => (
            <span key={label} className="flex items-baseline gap-1.5 rounded-md border border-line bg-surface-sunk px-2 py-1">
              <span className="eyebrow">{label}</span>{" "}
              <span className="font-medium">{value}</span>
            </span>
          ))}
        </div>
      )}

      {shownPhysical.length > 0 && (
        <Group title="Physical Characteristics">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            {shownPhysical.map(([label, value]) => (
              <div key={label}>
                <dt className="eyebrow">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </Group>
      )}

      {shownPersonal.length > 0 && (
        <Group title="Personal Characteristics">
          <dl className="space-y-2 text-sm">
            {shownPersonal.map(([label, value]) => (
              <div key={label}>
                <dt className="eyebrow">{label}</dt>
                <dd className="whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>
        </Group>
      )}

      {background && (
        <div className="space-y-2">
          <h3 className="font-semibold tracking-tight text-ink">{background.name}</h3>
          {background.entries ? <Entries entries={background.entries} /> : <Empty>No description.</Empty>}
        </div>
      )}
    </div>
  );
}

function NotesTab({ character }: { character: Character }) {
  const notes = character.details.notes;
  if (!notes) return <Empty>No notes yet — add some on the builder's Background page.</Empty>;
  return <p className="whitespace-pre-wrap text-sm">{notes}</p>;
}

/* ---------- play-state controls ---------- */

function LevelUp({ character }: { character: Character }) {
  const updateSheet = useCharacterStore((s) => s.updateSheet);
  const [open, setOpen] = useState(false);
  const classes = character.classes;
  if (classes.length === 0 || characterLevel(character) >= 20) return null;

  const bump = (i: number) =>
    updateSheet(character.id, (c) => ({
      classes: c.classes.map((cls, j) => (j === i ? { ...cls, level: cls.level + 1 } : cls)),
    }));
  const hint = "Raises the class level — make any new choices (spells, ASIs, subclass) in the builder.";

  if (classes.length === 1) {
    return (
      <button
        type="button"
        onClick={() => bump(0)}
        title={hint}
        className="btn btn-secondary btn-sm shrink-0 print:hidden"
      >
        <Icon name="arrow-up" className="h-3.5 w-3.5 text-ink-muted" />
        Level Up
      </button>
    );
  }
  return (
    <div className="relative shrink-0 print:hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title={hint}
        className="btn btn-secondary btn-sm"
      >
        <Icon name="arrow-up" className="h-3.5 w-3.5 text-ink-muted" />
        Level Up
      </button>
      {open && (
        <div className="glass absolute right-0 z-10 mt-1.5 w-max animate-fade-in rounded-lg border border-line p-1 shadow-lg">
          {classes.map((c, i) => (
            <button
              key={`${c.name}-${i}`}
              type="button"
              onClick={() => {
                bump(i);
                setOpen(false);
              }}
              className="block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-ink/5"
            >
              {c.name} {c.level} → {c.level + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Expanded HP management: damage/heal by amount, temp HP, rests, hit dice,
 * and death saves while at 0 HP. */
function HpStrip({
  character,
  maxHp,
  conMod,
  report,
}: {
  character: Character;
  maxHp: number;
  conMod: number;
  report: (roll: RollResult) => void;
}) {
  const index = useContentStore((s) => s.index);
  const updateSheet = useCharacterStore((s) => s.updateSheet);
  const [amount, setAmount] = useState(1);

  const play = character.play;
  const current = Math.max(0, maxHp - play.damageTaken);

  const apply = (fn: (p: PlayState) => Partial<PlayState>) =>
    updateSheet(character.id, (c) => ({ play: { ...c.play, ...fn(c.play) } }));

  const damage = () =>
    apply((p) => {
      // At 0 HP, damage becomes a death-save failure (the 5e rule).
      if (maxHp - p.damageTaken <= 0) {
        return {
          deathSaves: { ...p.deathSaves, failures: Math.min(3, p.deathSaves.failures + 1) },
        };
      }
      // Temp HP absorbs first (the 5e rule); the rest becomes damage taken.
      const absorbed = Math.min(p.tempHp, amount);
      return {
        tempHp: p.tempHp - absorbed,
        damageTaken: Math.min(maxHp, p.damageTaken + (amount - absorbed)),
      };
    });
  // Regaining HP ends dying, so healing also clears the death saves.
  const heal = () =>
    apply((p) => ({
      damageTaken: Math.max(0, p.damageTaken - amount),
      deathSaves: { successes: 0, failures: 0 },
    }));

  const spendHitDie = (classIdx: number, faces: number) => {
    const die = rollDie(faces);
    const healed = Math.max(0, die + conMod);
    apply((p) => {
      const usedHitDice = [...p.usedHitDice];
      while (usedHitDice.length <= classIdx) usedHitDice.push(0);
      usedHitDice[classIdx] += 1;
      return { usedHitDice, damageTaken: Math.max(0, p.damageTaken - healed) };
    });
    report({
      label: `Hit Die d${faces}`,
      detail: `d${faces} [${die}] ${formatMod(conMod)} Con`,
      total: healed,
    });
  };

  const rollDeathSave = () => {
    const die = rollD20(0).kept;
    apply((p) => {
      // Nat 20: regain 1 HP (and dying ends). Nat 1: two failures.
      if (die === 20) {
        return { damageTaken: maxHp - 1, deathSaves: { successes: 0, failures: 0 } };
      }
      const ds = { ...p.deathSaves };
      if (die >= 10) ds.successes = Math.min(3, ds.successes + 1);
      else ds.failures = Math.min(3, ds.failures + (die === 1 ? 2 : 1));
      return { deathSaves: ds };
    });
    report({ label: "Death Save", detail: `d20 [${die}]`, total: die });
  };

  return (
    <section className="panel animate-settle-in space-y-3 p-4 text-sm print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={1}
          value={amount}
          aria-label="Amount"
          onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
          className="w-16 field field-sm text-center"
        />
        <button
          type="button"
          onClick={damage}
          className="btn btn-danger btn-sm"
        >
          Damage
        </button>
        <button
          type="button"
          onClick={heal}
          className="btn btn-secondary btn-sm"
        >
          Heal
        </button>

        <label className="ml-2 flex items-center gap-1 text-xs text-ink-muted">
          Temp HP
          <input
            type="number"
            min={0}
            value={play.tempHp}
            aria-label="Temp HP"
            onChange={(e) => apply(() => ({ tempHp: Math.max(0, Number(e.target.value) || 0) }))}
            className="w-14 field field-sm text-center"
          />
        </label>

        <span className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() =>
              apply((p) => ({
                usedPactSlots: 0,
                usedResources: Object.fromEntries(
                  Object.entries(p.usedResources).filter(([name]) => !shortRestRestores(name)),
                ),
              }))
            }
            title="Restore pact-magic slots and short-rest resources; spend hit dice below to heal"
            className="btn btn-secondary btn-sm"
          >
            Short Rest
          </button>
          <button
            type="button"
            onClick={() => updateSheet(character.id, () => ({ play: emptyPlayState() }))}
            title="Restore all HP, hit dice, resources and spell slots"
            className="btn btn-secondary btn-sm"
          >
            Long Rest
          </button>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-2 text-xs">
        <span className="eyebrow">Hit Dice</span>
        {character.classes.map((choice, i) => {
          const faces = resolveClass(index, choice)?.hd?.faces;
          if (!faces) return null;
          const used = play.usedHitDice[i] ?? 0;
          return (
            <span key={`${choice.name}-${i}`} className="flex items-center gap-1">
              <span className="text-ink-muted">
                d{faces} {choice.level - used}/{choice.level}
              </span>
              <button
                type="button"
                onClick={() => spendHitDie(i, faces)}
                disabled={used >= choice.level}
                aria-label={`Spend d${faces} hit die`}
                title="Spend a hit die: heal the roll + Con modifier"
                className="rounded-md border border-line-strong px-1.5 py-0.5 font-mono font-medium text-ink transition-colors hover:border-accent hover:text-accent disabled:cursor-default disabled:border-line disabled:text-ink-faint"
              >
                Spend
              </button>
            </span>
          );
        })}
      </div>

      {current === 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-2">
          <span className="eyebrow">Death Saves</span>
          <SlotPips
            label="Successes"
            total={3}
            used={play.deathSaves.successes}
            onChange={(n) => apply((p) => ({ deathSaves: { ...p.deathSaves, successes: n } }))}
          />
          <SlotPips
            label="Failures"
            total={3}
            used={play.deathSaves.failures}
            onChange={(n) => apply((p) => ({ deathSaves: { ...p.deathSaves, failures: n } }))}
          />
          {play.deathSaves.failures >= 3 ? (
            <span className="eyebrow text-accent">Dead</span>
          ) : play.deathSaves.successes >= 3 ? (
            <span className="eyebrow">Stable</span>
          ) : (
            <button
              type="button"
              onClick={rollDeathSave}
              className="btn btn-secondary btn-sm"
            >
              Roll Death Save
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** Spendable spell-slot pips for the Spells tab: standard slots (shared table
 * in a multiclass build, so shown once) plus pact-magic slots. */
function SlotTracker({
  character,
  casters,
}: {
  character: Character;
  casters: ReturnType<typeof allSpellcastersFor>;
}) {
  const updateSheet = useCharacterStore((s) => s.updateSheet);
  const slotted = casters.find((sc) => sc.summary.slots.some((n) => n > 0));
  const pact = casters.find((sc) => sc.summary.pact)?.summary.pact;
  if (!slotted && !pact) return null;

  const play = character.play;
  const setUsedSlot = (levelIdx: number, used: number) =>
    updateSheet(character.id, (c) => {
      const usedSlots = [...c.play.usedSlots];
      while (usedSlots.length <= levelIdx) usedSlots.push(0);
      usedSlots[levelIdx] = used;
      return { play: { ...c.play, usedSlots } };
    });

  return (
    <div className="flex flex-wrap items-center gap-3 pt-1">
      {slotted?.summary.slots.map((count, i) =>
        count > 0 ? (
          <SlotPips
            key={i}
            label={`L${i + 1}`}
            total={count}
            used={play.usedSlots[i] ?? 0}
            onChange={(used) => setUsedSlot(i, used)}
          />
        ) : null,
      )}
      {pact && (
        <SlotPips
          label={`Pact L${pact.slotLevel}`}
          total={pact.count}
          used={play.usedPactSlots}
          onChange={(used) =>
            updateSheet(character.id, (c) => ({ play: { ...c.play, usedPactSlots: used } }))
          }
        />
      )}
    </div>
  );
}

/** A row of spendable slot pips: filled = spent, click to spend/restore. */
function SlotPips({
  label,
  total,
  used,
  onChange,
}: {
  label: string;
  total: number;
  used: number;
  onChange: (used: number) => void;
}) {
  const spent = Math.min(used, total);
  return (
    <span className="flex items-center gap-1">
      <span className="eyebrow">{label}</span>
      {Array.from({ length: total }, (_, k) => (
        <button
          key={k}
          type="button"
          aria-label={`${label} slot ${k + 1}`}
          title={k < spent ? "Restore slot" : "Spend slot"}
          onClick={() => onChange(k < spent ? k : k + 1)}
          className={`h-3.5 w-3.5 rounded-full border border-line-strong ${
            k < spent ? "bg-accent" : "bg-transparent hover:bg-ink/5"
          }`}
        />
      ))}
    </span>
  );
}

/* ---------- shared bits ---------- */

function AddButton({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn btn-secondary btn-sm shrink-0 print:hidden"
    >
      {open ? "Done" : `+ ${label}`}
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="eyebrow mb-1.5">{title}</h3>
      {children}
    </div>
  );
}

function EntryBlocks({ blocks }: { blocks: { name: string; entries?: Entry[] }[] }) {
  return (
    <div className="space-y-2">
      {blocks.map((b) => (
        <div key={b.name}>
          <h4 className="font-semibold tracking-tight text-ink">{b.name}</h4>
          {b.entries && <Entries entries={b.entries} />}
        </div>
      ))}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-ink-muted">{children}</p>;
}

function ProfDot({ on, expertise }: { on: boolean; expertise?: boolean }) {
  const cls = expertise
    ? "bg-accent ring-2 ring-accent/40"
    : on
      ? "bg-accent"
      : "border border-line-strong bg-transparent";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} aria-hidden />;
}

/** "Cantrips", "1st Level", "2nd Level", … */
function levelLabel(n: number): string {
  if (n === 0) return "Cantrips";
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]} Level`;
}
