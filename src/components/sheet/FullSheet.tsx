import { useMemo, useState, type ReactNode } from "react";
import { useActiveEntities, useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import {
  availableSpells,
  backgroundFor,
  chosenOptionalFeaturesFor,
  classFeaturesFor,
  deriveFromCharacter,
  effectAcFormulaCandidates,
  listByType,
  resolveCharacterFeats,
  resolveClass,
  resolveRace,
  resolveSubrace,
  allSpellcastersFor,
} from "../../store/selectors";
import {
  characterLevel,
  emptyPlayState,
  type Character,
  type EntityRef,
  type PlayState,
} from "../../model/character";
import { ABILITIES, ABILITY_NAMES, SKILLS, type Ability } from "../../engine/constants";
import { formatMod, proficiencyBonus } from "../../engine/modifiers";
import { traitNotes } from "../../engine/traitText";
import { rollD20, rollDamage, rollDie, type RollMode } from "../../engine/dice";
import { shortRestRestores } from "../../engine/resources";
import { cantripDiceMultiplier } from "../../engine/spellcasting";
import type { Spell } from "../../data/types/spell-content";
import type { Entry } from "../../data/types/common";
import { Entries } from "../../data/entryRenderer/EntryRenderer";
import { FeatureList } from "../common/FeatureList";
import { schoolName } from "../common/spellDisplay";
import { SpellDetail } from "../browser/SpellDetail";
import { Icon } from "../common/Icon";
import { ActionsTab } from "./ActionsTab";
import { InventoryTab } from "./InventoryTab";
import { AddButton, Empty, EntryBlocks, FilterPills, Group, ProfDot, SlotPips, levelLabel } from "./sheetParts";
import { DefensesAndConditions, HpBox, Inspiration, Stat } from "./SheetVitals";
import { sheetSpellRows, type SheetSpellRow } from "./sheetSpells";

const TABS = ["Actions", "Spells", "Inventory", "Features & Traits", "Background", "Notes", "Extras"] as const;
type Tab = (typeof TABS)[number];

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

  const race = resolveRace(index, character.race);
  const subrace = resolveSubrace(index, character.subrace);
  const traits = traitNotes([...(race?.entries ?? []), ...(subrace?.entries ?? [])]);

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

      {/* D&D Beyond's top strip: abilities, then proficiency, speed, inspiration and hit points. */}
      <section className="grid gap-2.5 xl:grid-cols-2">
        <div className="stagger grid grid-cols-3 gap-2.5 sm:grid-cols-6">
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
        </div>
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.9fr)]">
          <Stat label="Proficiency" value={formatMod(derived.pb)} caption="Bonus" />
          <Stat
            label="Walking"
            value={derived.speed}
            unit="ft."
            caption="Speed"
            title={
              derived.encumbrance !== "ok" && derived.speed !== derived.baseSpeed
                ? `${derived.encumbrance.replace("-", " ")} — encumbrance penalty applied`
                : undefined
            }
          />
          <Inspiration character={character} />
          {maxHp != null && currentHp != null ? (
            <HpBox
              character={character}
              maxHp={maxHp}
              current={currentHp}
              open={hpOpen}
              onToggle={() => setHpOpen(!hpOpen)}
              hitDie={derived.hitDie}
            />
          ) : (
            <Stat label="Hit Points" value="—" className="col-span-3 sm:col-span-1" />
          )}
        </div>
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

      <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_15rem_minmax(0,1fr)]">
        <div className="space-y-4">
          <SavingThrows derived={derived} notes={traits.saveNotes} onRoll={rollCheck} />
          <Senses derived={derived} />
          <Proficiencies derived={derived} />
        </div>

        <Skills derived={derived} onRoll={rollCheck} />

        <div className="min-w-0 space-y-4 lg:col-span-2 xl:col-span-1">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[6.5rem_6.5rem_minmax(0,1fr)]">
            <button
              type="button"
              onClick={() => rollCheck("Initiative", derived.initiative)}
              aria-label="Roll initiative"
              title="Roll initiative"
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-center shadow-sm transition-colors hover:border-accent"
            >
              <div className="eyebrow">Initiative</div>
              <div className="mt-1 font-mono text-2xl font-medium tracking-tight">{formatMod(derived.initiative)}</div>
            </button>
            <Stat label="Armor Class" value={derived.ac} center />
            <DefensesAndConditions character={character} derived={derived} extraImmunities={traits.immunities} />
          </div>

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
      return <SpellsTab character={character} onCheck={onCheck} onDamage={onDamage} />;
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
        {/* Full names only where the six cards span the whole row (md–lg). */}
        <span className="md:hidden xl:inline">{abbr}</span>
        <span className="max-md:hidden xl:hidden">{label}</span>
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

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel p-4">
      <h2 className="eyebrow mb-3">{title}</h2>
      {children}
    </section>
  );
}

/** Column-major like D&D Beyond: STR/DEX/CON on the left, INT/WIS/CHA on the right. */
const SAVE_ORDER: Ability[] = ["str", "int", "dex", "wis", "con", "cha"];

function SavingThrows({
  derived,
  notes,
  onRoll,
}: {
  derived: ReturnType<typeof deriveFromCharacter>;
  /** Save advantages stated in species traits ("Advantage against being charmed"). */
  notes: string[];
  onRoll: (label: string, mod: number) => void;
}) {
  return (
    <Panel title="Saving Throws">
      <ul className="grid grid-cols-2 gap-1.5 text-sm">
        {SAVE_ORDER.map((ab) => (
          <li
            key={ab}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-sunk px-2 py-1"
            title={ABILITY_NAMES[ab]}
          >
            <ProfDot on={derived.saves[ab].proficient} />
            <span className="flex-1 font-mono text-xs uppercase text-ink-muted">{ab}</span>
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
      {notes.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-line pt-1.5 text-xs text-ink-muted">
          {notes.map((note) => (
            <li key={note} className="flex items-start gap-1.5">
              <span className="chip chip-accent mt-px">Adv</span>
              {note}
            </li>
          ))}
        </ul>
      )}
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
      <div className="eyebrow mb-1 flex gap-2 border-b border-line pb-1 text-ink-faint" aria-hidden="true">
        <span className="w-2.5">P</span>
        <span className="w-8">Mod</span>
        <span className="flex-1">Skill</span>
        <span>Bonus</span>
      </div>
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

function SpellsTab({
  character,
  onCheck,
  onDamage,
}: {
  character: Character;
  onCheck: (label: string, mod: number) => void;
  onDamage: (label: string, expr: string) => void;
}) {
  const index = useContentStore((s) => s.index);
  const entities = useActiveEntities();
  const updateSheet = useCharacterStore((s) => s.updateSheet);
  const casters = allSpellcastersFor(character, index);

  const [expanded, setExpanded] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [forClass, setForClass] = useState<string>();

  const rows = sheetSpellRows(character, index);
  const byLevel = new Map<number, SheetSpellRow[]>();
  for (const row of rows) byLevel.set(row.level, [...(byLevel.get(row.level) ?? []), row]);
  const knownNames = new Set(rows.map((r) => r.ref.name));

  // Slots are shared across casting classes, so the first slotted caster's
  // table is the character's; pact slots are their own track.
  const slots = casters.find((sc) => sc.summary.slots.some((n) => n > 0))?.summary.slots ?? [];
  const pact = casters.find((sc) => sc.summary.pact)?.summary.pact;
  const setUsedSlot = (levelIdx: number, used: number) =>
    updateSheet(character.id, (c) => {
      const usedSlots = [...c.play.usedSlots];
      while (usedSlots.length <= levelIdx) usedSlots.push(0);
      usedSlots[levelIdx] = used;
      return { play: { ...c.play, usedSlots } };
    });
  // Levels with slots appear even before a spell of that level is known.
  slots.forEach((count, i) => {
    if (count > 0 && !byLevel.has(i + 1)) byLevel.set(i + 1, []);
  });

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

  const columns =
    "grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-x-3 sm:grid-cols-[minmax(0,1fr)_2.5rem_5.25rem_3.75rem_5.5rem_3.75rem]";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {casters.length === 0 && byLevel.size === 0 && (
            <p className="text-sm text-ink-muted">Not a spellcaster.</p>
          )}
          {casters.map((sc) => (
            <div key={sc.classIndex} className="flex gap-2" title={casters.length > 1 ? sc.className : undefined}>
              {[
                [`${casters.length > 1 ? `${sc.className} ` : ""}Modifier`, formatMod(sc.summary.attackBonus - characterPb(character))],
                ["Spell Attack", formatMod(sc.summary.attackBonus)],
                ["Save DC", String(sc.summary.saveDc)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-line bg-surface-sunk px-3 py-1.5 text-center">
                  <div className="font-mono text-lg font-medium">{value}</div>
                  <div className="eyebrow">{label}</div>
                </div>
              ))}
            </div>
          ))}
          {pact && (
            <div className="flex items-center rounded-lg border border-line bg-surface-sunk px-3 py-1.5">
              <SlotPips
                label={`Pact L${pact.slotLevel}`}
                total={pact.count}
                used={character.play.usedPactSlots}
                onChange={(used) =>
                  updateSheet(character.id, (c) => ({ play: { ...c.play, usedPactSlots: used } }))
                }
              />
            </div>
          )}
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
            <section key={level}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-1">
                <h3 className="eyebrow">
                  {levelLabel(level)}
                  {level === 0 && cantripDiceMultiplier(characterLevel(character)) > 1 && (
                    <span className="ml-1 font-semibold normal-case text-ink-muted">
                      · damage dice ×{cantripDiceMultiplier(characterLevel(character))}
                    </span>
                  )}
                </h3>
                {level > 0 && (slots[level - 1] ?? 0) > 0 && (
                  <SlotPips
                    label={`L${level}`}
                    display="Slots"
                    total={slots[level - 1]}
                    used={character.play.usedSlots[level - 1] ?? 0}
                    onChange={(used) => setUsedSlot(level - 1, used)}
                  />
                )}
              </div>
              {spells.length > 0 && (
                <div className={`${columns} eyebrow pt-1.5 text-ink-faint`} aria-hidden="true">
                  <span>Name</span>
                  <span className="max-sm:hidden">Time</span>
                  <span>Range</span>
                  <span className="max-sm:hidden text-center">Hit/DC</span>
                  <span className="max-sm:hidden">Effect</span>
                  <span className="max-sm:hidden">Notes</span>
                </div>
              )}
              <ul>
                {spells.map((s) => {
                  const open = expanded === s.ref.name;
                  const hit = s.hit;
                  return (
                    <li key={s.ref.name} className="border-b border-line py-1.5 text-sm last:border-b-0">
                      <div className={columns}>
                        <span className="min-w-0">
                          <button
                            type="button"
                            onClick={() => setExpanded(open ? undefined : s.ref.name)}
                            className="text-left font-medium hover:text-accent hover:underline"
                            title="Show spell details"
                          >
                            {s.ref.name}
                          </button>
                          {s.granted && (
                            <span className="chip chip-accent ml-1">
                              {s.granted === "Subclass" ? "Always prepared" : s.granted}
                            </span>
                          )}
                          {s.ritual && <span className="chip ml-1">Ritual</span>}
                          <span className="block truncate font-mono text-2xs uppercase text-ink-muted">{s.origin}</span>
                        </span>
                        <span className="font-mono text-xs text-ink-muted max-sm:hidden">{s.time}</span>
                        <span className="font-mono text-xs text-ink-muted">{s.range}</span>
                        <span className="text-center max-sm:hidden">
                          {hit?.kind === "attack" ? (
                            <button
                              type="button"
                              onClick={() => onCheck(`${s.ref.name} Attack`, hit.bonus)}
                              aria-label={`Roll spell attack: ${s.ref.name}`}
                              title="Roll spell attack"
                              className="rounded-md border border-line-strong px-1.5 font-mono font-medium transition-colors hover:border-accent hover:text-accent"
                            >
                              {formatMod(hit.bonus)}
                            </button>
                          ) : hit?.kind === "save" ? (
                            <span className="font-mono text-xs font-medium">
                              {hit.ability.toUpperCase()} {hit.dc}
                            </span>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </span>
                        <span className="truncate font-mono text-xs max-sm:hidden">
                          {s.damage && /\d+d\d+/.test(s.damage) ? (
                            <button
                              type="button"
                              onClick={() => onDamage(`${s.ref.name} Damage`, s.damage!)}
                              aria-label={`Roll damage: ${s.ref.name}`}
                              title={s.damageType ? `${s.damageType} damage` : "Roll damage"}
                              className="text-left font-medium text-accent hover:underline"
                            >
                              {s.damage}
                            </button>
                          ) : (
                            <span className="text-ink-muted">{s.spell?.school ? schoolName(s.spell.school) : ""}</span>
                          )}
                        </span>
                        <span className="font-mono text-2xs text-ink-muted max-sm:hidden">{s.notes}</span>
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
                          {s.granted ? (
                            <p className="text-2xs text-ink-muted print:hidden">
                              {s.granted === "Subclass"
                                ? "Always prepared by your subclass."
                                : `Granted by a ${s.granted.toLowerCase()} — manage it in the builder.`}
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
            </section>
          ))
      )}
    </div>
  );
}

/** Proficiency bonus at the character's level (spell attack − this = the ability modifier). */
function characterPb(character: Character): number {
  return proficiencyBonus(characterLevel(character));
}

const FEATURE_FILTERS = ["All", "Class Features", "Species Traits", "Feats"] as const;
type FeatureFilter = (typeof FEATURE_FILTERS)[number];

function FeaturesTab({ character }: { character: Character }) {
  const index = useContentStore((s) => s.index);
  const [filter, setFilter] = useState<FeatureFilter>("All");
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
  const show = (f: FeatureFilter) => filter === "All" || filter === f;

  return (
    <div className="space-y-4">
      <FilterPills label="Filter features" options={FEATURE_FILTERS} value={filter} onChange={setFilter} />
      {show("Class Features") && (features.length > 0 || subclassFeatures.length > 0) && (
        <Group title="Class Features">
          <FeatureList features={[...features, ...subclassFeatures]} />
        </Group>
      )}
      {show("Class Features") && chosen.length > 0 && (
        <Group title="Feature Choices">
          <EntryBlocks blocks={chosen} />
        </Group>
      )}
      {show("Species Traits") && racialTraits.length > 0 && (
        <Group title="Species Traits">
          <EntryBlocks blocks={racialTraits} />
        </Group>
      )}
      {show("Feats") && feats.length > 0 && (
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

/** Expanded HP management: temp HP, rests, hit dice, and death saves while at
 * 0 HP (damage and healing live in the HP box). */
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
  const play = character.play;
  const current = Math.max(0, maxHp - play.damageTaken);

  const apply = (fn: (p: PlayState) => Partial<PlayState>) =>
    updateSheet(character.id, (c) => ({ play: { ...c.play, ...fn(c.play) } }));

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
        <label className="flex items-center gap-1 text-xs text-ink-muted">
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
            onClick={() =>
              updateSheet(character.id, (c) => ({
                // Inspiration and conditions aren't restored by resting.
                play: { ...emptyPlayState(), inspiration: c.play.inspiration, conditions: c.play.conditions },
              }))
            }
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

