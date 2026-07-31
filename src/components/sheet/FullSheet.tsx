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
  deriveFromCharacter,
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
import { cantripDiceMultiplier } from "../../engine/spellcasting";
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

  const rollCheck = (label: string, mod: number) => {
    const r = rollD20(mod, rollMode);
    setLastRoll({
      label,
      detail: `d20 [${r.rolls.join(", ")}] ${formatMod(mod)}${
        rollMode !== "normal" ? ` · ${rollMode}` : ""
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
      <header className="flex items-start justify-between gap-2 rounded border border-blood/30 bg-parchment p-4 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-blood">{character.name}</h2>
          <p className="text-sm text-ink/70">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <AdvToggle mode={rollMode} onChange={setRollMode} />
          <LevelUp character={character} />
        </div>
      </header>

      <section className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {ABILITIES.map((ab) => (
          <AbilityCard
            key={ab}
            label={ABILITY_NAMES[ab]}
            mod={derived.mods[ab]}
            score={derived.abilities[ab]}
            onRoll={() => rollCheck(`${ABILITY_NAMES[ab]} Check`, derived.mods[ab])}
          />
        ))}
      </section>

      <section className="grid grid-cols-3 gap-2 text-center text-sm sm:grid-cols-6">
        <Chip label="Prof" value={formatMod(derived.pb)} />
        <Chip label="Speed" value={`${derived.speed} ft`} />
        <Chip label="Initiative" value={formatMod(derived.initiative)} />
        <Chip label="AC" value={derived.ac} />
        <Chip label="Pass. Per" value={derived.passivePerception} />
        {maxHp != null && currentHp != null ? (
          <button
            type="button"
            onClick={() => setHpOpen(!hpOpen)}
            aria-label="Hit Points"
            title={derived.hitDie ?? undefined}
            className={`rounded border p-2 text-center hover:bg-blood/5 ${
              hpOpen ? "border-blood bg-blood/10" : "border-blood/20 bg-white/50"
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-wide text-ink/60">HP</div>
            <div className={`text-base font-bold ${currentHp === 0 ? "text-blood" : ""}`}>
              {currentHp}/{maxHp}
              {character.play.tempHp > 0 && (
                <span className="ml-1 text-xs font-semibold text-ink/50">
                  +{character.play.tempHp}
                </span>
              )}
            </div>
          </button>
        ) : (
          <Chip label="HP" value="—" />
        )}
      </section>

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

        <div className="rounded border border-blood/30 bg-parchment p-3 shadow-sm">
          <nav className="mb-3 flex flex-wrap gap-1 border-b border-blood/20 pb-2">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded px-2 py-1 text-xs font-semibold uppercase tracking-wide ${
                  t === tab ? "bg-blood text-parchment" : "text-ink/60 hover:bg-blood/10"
                }`}
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
          className="fixed bottom-4 right-4 z-20 w-60 rounded border-2 border-blood/50 bg-parchment p-3 shadow-lg print:hidden"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-ink/60">
              {lastRoll.label}
            </span>
            <button
              type="button"
              onClick={() => setLastRoll(undefined)}
              aria-label="Dismiss roll"
              className="text-ink/50 hover:text-blood"
            >
              ✕
            </button>
          </div>
          <div className="text-3xl font-bold text-blood">{lastRoll.total}</div>
          <div className="text-xs text-ink/60">{lastRoll.detail}</div>
        </aside>
      )}
    </article>
  );
}

/** Advantage / disadvantage toggle for every d20 roll on the sheet. */
function AdvToggle({ mode, onChange }: { mode: RollMode; onChange: (mode: RollMode) => void }) {
  return (
    <span className="flex overflow-hidden rounded border border-ink/30 text-[10px] font-bold uppercase tracking-wide print:hidden">
      {(["advantage", "disadvantage"] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          title={`Roll d20s with ${m}`}
          onClick={() => onChange(mode === m ? "normal" : m)}
          className={`px-2 py-1 ${
            mode === m ? "bg-blood text-parchment" : "text-ink/60 hover:bg-blood/10"
          }`}
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
        <div className="rounded border border-blood/20 bg-white/50 p-2 print:hidden">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search creatures to add…"
            className="w-full rounded border border-ink/20 bg-white px-2 py-1 text-sm"
            autoFocus
          />
          {query && (
            <ul className="mt-1 max-h-40 overflow-y-auto rounded border border-blood/15 bg-white/70">
              {matches.length === 0 && <li className="px-2 py-1 text-sm text-ink/50">No matches.</li>}
              {matches.map((m) => (
                <li key={`${m.name}|${m.source}`}>
                  <button
                    type="button"
                    onClick={() => addExtra({ name: m.name, source: m.source })}
                    className="block w-full px-2 py-1 text-left text-sm hover:bg-blood/10"
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
    <section className="rounded border border-blood/30 bg-white/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-bold text-blood">{name}</h4>
        <button
          type="button"
          onClick={onRemove}
          title="Remove creature"
          className="text-blood hover:text-blood-light print:hidden"
        >
          ✕
        </button>
      </div>
      {!entity ? (
        <p className="text-sm text-ink/50">Not in the imported content.</p>
      ) : (
        <>
          <p className="text-sm text-ink/70">
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
          <p className="text-xs uppercase tracking-wide text-ink/50">
            {ABILITIES.map((ab) => `${ab} ${m[ab] ?? "—"}`).join(" · ")}
          </p>
          {blocks.length > 0 && (
            <div className="mt-2 space-y-1 border-t border-ink/10 pt-2 text-sm">
              {blocks.map((b, i) => (
                <div key={`${b.name}-${i}`}>
                  <span className="font-semibold text-blood">{b.name}. </span>
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
  mod,
  score,
  onRoll,
}: {
  label: string;
  mod: number;
  score: number;
  onRoll: () => void;
}) {
  return (
    <div className="rounded-lg border-2 border-blood/40 bg-white/60 px-2 pb-3 pt-1 text-center">
      <div className="text-[10px] font-bold uppercase tracking-wide text-ink/60">{label}</div>
      <button
        type="button"
        onClick={onRoll}
        aria-label={`Roll ${label} check`}
        title="Roll an ability check"
        className="w-full text-2xl font-bold leading-tight hover:text-blood"
      >
        {formatMod(mod)}
      </button>
      <div className="mx-auto -mb-4 mt-1 w-9 rounded-full border border-blood/40 bg-parchment py-0.5 text-sm font-semibold">
        {score}
      </div>
    </div>
  );
}

function Chip({ label, value, title }: { label: string; value: string | number; title?: string }) {
  return (
    <div className="rounded border border-blood/20 bg-white/50 p-2" title={title}>
      <div className="text-[10px] font-bold uppercase tracking-wide text-ink/60">{label}</div>
      <div className="text-base font-bold">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded border border-blood/30 bg-parchment p-3 shadow-sm">
      <h3 className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-blood">{title}</h3>
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
              className="font-semibold tabular-nums hover:text-blood hover:underline"
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
            <span className="w-7 text-center font-semibold tabular-nums">{value}</span>
            <span className="flex-1 text-ink/70">{label}</span>
          </li>
        ))}
      </ul>
      {derived.senses.length > 0 && (
        <p className="mt-1 border-t border-ink/10 pt-1 text-sm text-ink/70">
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
      <ul className="space-y-1 text-xs text-ink/70">
        {shown.map(([label, values]) => (
          <li key={label}>
            <span className="font-semibold uppercase text-ink/50">{label}</span>
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
      <ul className="space-y-1 text-xs text-ink/70">
        {shown.map(([label, values]) => (
          <li key={label}>
            <span className="font-semibold uppercase text-ink/50">{label}</span>
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
  onRoll: (label: string, mod: number) => void;
}) {
  return (
    <Panel title="Skills">
      <ul className="space-y-0.5 text-sm">
        {SKILLS.map((skill) => {
          const s = derived.skills[skill.id];
          return (
            <li key={skill.id} className="flex items-center gap-2">
              <ProfDot on={s.proficient} expertise={s.expertise} />
              <span className="w-8 text-[10px] uppercase text-ink/40">{skill.ability}</span>
              <span className="flex-1">{skill.name}</span>
              <button
                type="button"
                onClick={() => onRoll(skill.name, s.mod)}
                aria-label={`Roll ${skill.name}`}
                title="Roll this skill check"
                className="font-semibold tabular-nums hover:text-blood hover:underline"
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
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b border-blood/20 pb-1 text-[10px] font-bold uppercase text-ink/50">
          <span>Attack</span>
          <span className="text-center">Hit/DC</span>
          <span>Damage</span>
        </div>
        <ul>
          {rows.map(({ item, line: l }, i) => (
            <li key={`${l.name}-${i}`} className="border-b border-ink/10 py-1.5 text-sm">
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3">
                <span>
                  {item ? (
                    <button
                      type="button"
                      onClick={() => setExpanded(expanded === i ? undefined : i)}
                      className="font-semibold hover:text-blood hover:underline"
                      title="Show item details"
                    >
                      {l.name}
                    </button>
                  ) : (
                    <span className="font-semibold">{l.name}</span>
                  )}
                  <span className="block text-[10px] uppercase text-ink/40">
                    {l.range}
                    {l.notes ? ` · ${l.notes}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onCheck(`${l.name} Attack`, parseHit(l.hit))}
                  aria-label={`Roll attack: ${l.name}`}
                  title="Roll to hit"
                  className="rounded border border-ink/20 px-2 text-center font-semibold tabular-nums hover:border-blood hover:text-blood"
                >
                  {l.hit}
                </button>
                {/\d+d\d+/.test(l.damage) ? (
                  <button
                    type="button"
                    onClick={() => onDamage(`${l.name} Damage`, l.damage)}
                    aria-label={`Roll damage: ${l.name}`}
                    title="Roll damage"
                    className="text-left tabular-nums hover:text-blood hover:underline"
                  >
                    {l.damage}
                  </button>
                ) : (
                  <span className="tabular-nums">{l.damage}</span>
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
        <h4 className="mb-1 text-sm font-bold text-ink">Actions in Combat</h4>
        <p className="border-l-2 border-blood/30 pl-2 text-sm text-ink/70">{ACTIONS_IN_COMBAT}</p>
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
        <h4 className="text-sm font-bold text-ink">Custom Attacks</h4>
        <AddButton open={adding} onClick={() => setAdding(!adding)} label="Add Attack" />
      </div>
      {adding && (
        <div className="mt-1 flex flex-wrap items-end gap-2 rounded border border-blood/20 bg-white/50 p-2 text-sm print:hidden">
          <label className="text-xs text-ink/60">
            Name
            <input
              value={name}
              aria-label="Attack name"
              onChange={(e) => setName(e.target.value)}
              className="block w-36 rounded border border-ink/20 bg-white px-2 py-1"
            />
          </label>
          <label className="text-xs text-ink/60">
            To hit
            <input
              type="number"
              value={hit}
              aria-label="Attack bonus"
              onChange={(e) => setHit(Number(e.target.value) || 0)}
              className="block w-16 rounded border border-ink/20 bg-white px-2 py-1"
            />
          </label>
          <label className="text-xs text-ink/60">
            Damage
            <input
              value={damage}
              aria-label="Attack damage"
              placeholder="1d6+2 fire"
              onChange={(e) => setDamage(e.target.value)}
              className="block w-32 rounded border border-ink/20 bg-white px-2 py-1"
            />
          </label>
          <button
            type="button"
            onClick={add}
            className="rounded bg-blood px-3 py-1 text-xs font-bold uppercase text-parchment hover:bg-blood-light"
          >
            Add
          </button>
        </div>
      )}
      {character.customAttacks.length === 0 ? (
        !adding && <p className="text-xs text-ink/50">None defined.</p>
      ) : (
        <ul>
          {character.customAttacks.map((a, i) => (
            <li
              key={`${a.name}-${i}`}
              className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 border-b border-ink/10 py-1.5 text-sm"
            >
              <span className="font-semibold">{a.name}</span>
              <button
                type="button"
                onClick={() => onCheck(`${a.name} Attack`, a.hit)}
                aria-label={`Roll attack: ${a.name}`}
                title="Roll to hit"
                className="rounded border border-ink/20 px-2 text-center font-semibold tabular-nums hover:border-blood hover:text-blood"
              >
                {formatMod(a.hit)}
              </button>
              {/\d+d\d+/.test(a.damage) ? (
                <button
                  type="button"
                  onClick={() => onDamage(`${a.name} Damage`, a.damage)}
                  aria-label={`Roll damage: ${a.name}`}
                  title="Roll damage"
                  className="text-left tabular-nums hover:text-blood hover:underline"
                >
                  {a.damage}
                </button>
              ) : (
                <span className="tabular-nums">{a.damage || "—"}</span>
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                title="Remove attack"
                className="text-blood hover:text-blood-light print:hidden"
              >
                ✕
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
    <div className="flex flex-wrap items-center gap-3 rounded border border-blood/20 bg-white/40 p-2 print:hidden">
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
            <p className="text-sm text-ink/50">Not a spellcaster.</p>
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
        <div className="rounded border border-blood/20 bg-white/50 p-2 print:hidden">
          {casters.length > 1 && (
            <label className="mb-1 flex items-center gap-2 text-xs text-ink/60">
              Add for
              <select
                value={forClass ?? casters[0]?.className}
                onChange={(e) => setForClass(e.target.value)}
                className="rounded border border-ink/20 bg-white px-1 py-0.5 text-sm"
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
            className="w-full rounded border border-ink/20 bg-white px-2 py-1 text-sm"
            autoFocus
          />
          {query && (
            <ul className="mt-1 max-h-40 overflow-y-auto rounded border border-blood/15 bg-white/70">
              {matches.length === 0 && <li className="px-2 py-1 text-sm text-ink/50">No matches.</li>}
              {matches.map((s) => {
                const known = knownNames.has(s.name);
                return (
                  <li key={`${s.name}|${s.source}`}>
                    <button
                      type="button"
                      disabled={known}
                      onClick={() => addSpell(s)}
                      className="flex w-full justify-between px-2 py-1 text-left text-sm hover:bg-blood/10 disabled:opacity-40"
                    >
                      <span>{s.name}</span>
                      <span className="text-[10px] uppercase text-ink/40">
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
              <h4 className="text-xs font-bold uppercase tracking-wide text-blood">
                {levelLabel(level)}
                {level === 0 && cantripDiceMultiplier(characterLevel(character)) > 1 && (
                  <span className="ml-1 font-semibold normal-case text-ink/50">
                    · damage dice ×{cantripDiceMultiplier(characterLevel(character))}
                  </span>
                )}
              </h4>
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
                            className="text-left hover:text-blood hover:underline"
                            title="Show spell details"
                          >
                            {s.ref.name}
                          </button>
                          {s.tag && (
                            <span className="ml-1 rounded border border-blood/40 bg-blood/10 px-1 text-[9px] font-semibold uppercase text-blood">
                              {s.tag}
                            </span>
                          )}
                          {s.spell?.meta?.ritual && (
                            <span className="ml-1 rounded border border-ink/30 px-1 text-[9px] font-semibold uppercase text-ink/50">
                              Ritual
                            </span>
                          )}
                        </span>
                        {s.spell?.school && (
                          <span className="text-[10px] uppercase text-ink/40">
                            {schoolName(s.spell.school)}
                          </span>
                        )}
                      </div>
                      {open && (
                        <div className="my-1 space-y-1">
                          {s.spell ? (
                            <SpellDetail spell={s.spell} embedded />
                          ) : (
                            <p className="text-xs text-ink/50">
                              No imported spell data for this entry.
                            </p>
                          )}
                          {s.tag ? (
                            <p className="text-[10px] text-ink/40 print:hidden">
                              Granted by a {s.tag.toLowerCase()} — manage it in the builder.
                            </p>
                          ) : (
                            <button
                              type="button"
                              onClick={() => removeSpell(s.ref)}
                              className="text-xs text-blood underline print:hidden"
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
  const totalWeight = inventoryWeight(character, index);
  const capacity = carryingCapacity(deriveFromCharacter(character, index).abilities.str);

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <AddButton open={adding} onClick={() => setAdding(!adding)} label="Add Item" />
      </div>

      {adding && (
        <div className="rounded border border-blood/20 bg-white/50 p-2 print:hidden">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items to add…"
            className="w-full rounded border border-ink/20 bg-white px-2 py-1 text-sm"
            autoFocus
          />
          {query && (
            <ul className="mt-1 max-h-40 overflow-y-auto rounded border border-blood/15 bg-white/70">
              {matches.length === 0 && <li className="px-2 py-1 text-sm text-ink/50">No matches.</li>}
              {matches.map((i) => (
                <li key={`${i.name}|${i.source}`}>
                  <button
                    type="button"
                    onClick={() => addItem({ name: i.name, source: i.source })}
                    className="flex w-full justify-between px-2 py-1 text-left text-sm hover:bg-blood/10"
                  >
                    <span>{i.name}</span>
                    <span className="text-[10px] uppercase text-ink/40">
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
        <ul className="divide-y divide-ink/10">
          {rows.map(({ entry, i, item }) => {
            const code = itemTypeCode(item?.type);
            const equippable = WEARABLE_CODES.includes(code ?? "") || (!!item && isWeapon(item));
            const open = expanded === i;
            return (
              <li key={`${entry.name}-${i}`} className="py-1.5 text-sm">
                <div className="flex items-center gap-2">
                  {item ? (
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? undefined : i)}
                      className="flex-1 text-left hover:text-blood hover:underline"
                      title="Show item details"
                    >
                      {entry.name}
                    </button>
                  ) : (
                    <span className="flex-1">{entry.name}</span>
                  )}

                  <label className="flex items-center gap-1 text-xs text-ink/50 print:hidden">
                    ×
                    <input
                      type="number"
                      min={1}
                      value={entry.quantity}
                      onChange={(e) => setQuantity(i, Number(e.target.value) || 1)}
                      className="w-12 rounded border border-ink/20 bg-white px-1 py-0.5 text-center"
                    />
                  </label>
                  {entry.quantity > 1 && (
                    <span className="hidden text-xs text-ink/50 print:inline">×{entry.quantity}</span>
                  )}

                  {equippable && (
                    <button
                      type="button"
                      onClick={() => toggleEquip(i)}
                      className={`rounded border px-1.5 text-[10px] font-semibold uppercase print:hidden ${
                        entry.equipped
                          ? "border-blood bg-blood/10 text-blood"
                          : "border-ink/30 text-ink/50 hover:border-blood/40 hover:text-blood"
                      }`}
                    >
                      {entry.equipped ? "Equipped" : "Equip"}
                    </button>
                  )}
                  {entry.equipped && (
                    <span className="hidden rounded border border-blood/40 bg-blood/10 px-1.5 text-[10px] font-semibold uppercase text-blood print:inline-block">
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
                      className={`rounded border px-1.5 text-[10px] font-semibold uppercase print:hidden ${
                        entry.attuned
                          ? "border-blood bg-blood text-parchment"
                          : "border-ink/30 text-ink/50 hover:border-blood/40 hover:text-blood disabled:cursor-default disabled:hover:border-ink/30 disabled:hover:text-ink/50"
                      }`}
                    >
                      {entry.attuned ? "Attuned" : "Attune"}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="text-blood hover:text-blood-light print:hidden"
                    title="Remove item"
                  >
                    ✕
                  </button>
                </div>
                {(item?.charges != null ||
                  (containers.length > 0 && !item?.containerCapacity)) && (
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
                    {containers.length > 0 && !item?.containerCapacity && (
                      <label className="flex items-center gap-1 text-[10px] uppercase text-ink/50 print:hidden">
                        In
                        <select
                          value={entry.containedIn ?? ""}
                          aria-label={`Container for ${entry.name}`}
                          onChange={(e) => setContainedIn(i, e.target.value || undefined)}
                          className="rounded border border-ink/20 bg-white px-1 py-0.5 normal-case"
                        >
                          <option value="">— carried —</option>
                          {containers.map((c) => (
                            <option key={c.entry.id} value={c.entry.id}>
                              {c.entry.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
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

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ink/10 pt-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-ink/50">Currency</span>
        {COINS.map((coin) => (
          <label key={coin} className="flex items-center gap-1 text-xs uppercase text-ink/60">
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
              className="w-14 rounded border border-ink/20 bg-white px-1 py-0.5 text-center print:border-0"
            />
          </label>
        ))}
        <span className="text-xs text-ink/50">≈ {currencyInGp(character.currency)} gp</span>
      </div>

      <p
        className={`text-xs ${totalWeight > capacity ? "font-semibold text-blood" : "text-ink/60"}`}
        title="Carrying capacity: Strength × 15 lb."
      >
        Total Weight: {formatWeight(totalWeight)} / {capacity} lb.
        {totalWeight > capacity && " — over capacity"}
        {attuned > 0 && ` · Attuned: ${attuned}/3`}
      </p>
    </div>
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
    <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-ink/10 pt-2 text-sm">
      <span className="text-[10px] font-bold uppercase tracking-wide text-ink/50">
        Custom item
      </span>
      <input
        value={name}
        aria-label="Custom item name"
        placeholder="Name"
        onChange={(e) => setName(e.target.value)}
        className="w-36 rounded border border-ink/20 bg-white px-2 py-1"
      />
      <input
        value={weight}
        aria-label="Custom item weight"
        placeholder="lb."
        onChange={(e) => setWeight(e.target.value)}
        className="w-16 rounded border border-ink/20 bg-white px-2 py-1"
      />
      <input
        value={damage}
        aria-label="Custom item damage"
        placeholder="1d6 fire (optional)"
        onChange={(e) => setDamage(e.target.value)}
        className="w-36 rounded border border-ink/20 bg-white px-2 py-1"
      />
      <button
        type="button"
        onClick={add}
        className="rounded bg-blood px-3 py-1 text-xs font-bold uppercase text-parchment hover:bg-blood-light"
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
            <span key={label} className="rounded border border-blood/20 bg-white/50 px-2 py-1">
              <span className="text-[10px] font-bold uppercase text-ink/50">{label}</span>{" "}
              <span className="font-semibold">{value}</span>
            </span>
          ))}
        </div>
      )}

      {shownPhysical.length > 0 && (
        <Group title="Physical Characteristics">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            {shownPhysical.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[10px] font-bold uppercase text-ink/50">{label}</dt>
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
                <dt className="text-[10px] font-bold uppercase text-ink/50">{label}</dt>
                <dd className="whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>
        </Group>
      )}

      {background && (
        <div className="space-y-2">
          <h4 className="font-semibold text-blood">{background.name}</h4>
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
        className="shrink-0 rounded border border-blood px-2 py-1 text-xs font-semibold text-blood hover:bg-blood/10 print:hidden"
      >
        ▲ Level Up
      </button>
    );
  }
  return (
    <div className="relative shrink-0 print:hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title={hint}
        className="rounded border border-blood px-2 py-1 text-xs font-semibold text-blood hover:bg-blood/10"
      >
        ▲ Level Up
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-max rounded border border-blood/30 bg-parchment shadow">
          {classes.map((c, i) => (
            <button
              key={`${c.name}-${i}`}
              type="button"
              onClick={() => {
                bump(i);
                setOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-blood/10"
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
    <section className="space-y-2 rounded border border-blood/30 bg-parchment p-2 text-sm shadow-sm print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={1}
          value={amount}
          aria-label="Amount"
          onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
          className="w-16 rounded border border-ink/20 bg-white px-2 py-1 text-center"
        />
        <button
          type="button"
          onClick={damage}
          className="rounded border border-blood bg-blood/10 px-3 py-1 font-semibold text-blood hover:bg-blood/20"
        >
          Damage
        </button>
        <button
          type="button"
          onClick={heal}
          className="rounded border border-blood px-3 py-1 font-semibold text-blood hover:bg-blood/10"
        >
          Heal
        </button>

        <label className="ml-2 flex items-center gap-1 text-xs text-ink/60">
          Temp HP
          <input
            type="number"
            min={0}
            value={play.tempHp}
            aria-label="Temp HP"
            onChange={(e) => apply(() => ({ tempHp: Math.max(0, Number(e.target.value) || 0) }))}
            className="w-14 rounded border border-ink/20 bg-white px-1 py-0.5 text-center"
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
            className="rounded border border-ink/30 px-2 py-1 text-xs text-ink/70 hover:bg-blood/10"
          >
            Short Rest
          </button>
          <button
            type="button"
            onClick={() => updateSheet(character.id, () => ({ play: emptyPlayState() }))}
            title="Restore all HP, hit dice, resources and spell slots"
            className="rounded border border-ink/30 px-2 py-1 text-xs text-ink/70 hover:bg-blood/10"
          >
            Long Rest
          </button>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-ink/10 pt-2 text-xs">
        <span className="font-bold uppercase tracking-wide text-ink/50">Hit Dice</span>
        {character.classes.map((choice, i) => {
          const faces = resolveClass(index, choice)?.hd?.faces;
          if (!faces) return null;
          const used = play.usedHitDice[i] ?? 0;
          return (
            <span key={`${choice.name}-${i}`} className="flex items-center gap-1">
              <span className="text-ink/70">
                d{faces} {choice.level - used}/{choice.level}
              </span>
              <button
                type="button"
                onClick={() => spendHitDie(i, faces)}
                disabled={used >= choice.level}
                aria-label={`Spend d${faces} hit die`}
                title="Spend a hit die: heal the roll + Con modifier"
                className="rounded border border-blood/40 px-1.5 py-0.5 font-semibold text-blood hover:bg-blood/10 disabled:cursor-default disabled:border-ink/20 disabled:text-ink/30"
              >
                Spend
              </button>
            </span>
          );
        })}
      </div>

      {current === 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-ink/10 pt-2">
          <span className="text-xs font-bold uppercase tracking-wide text-blood">Death Saves</span>
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
            <span className="font-bold uppercase text-blood">Dead</span>
          ) : play.deathSaves.successes >= 3 ? (
            <span className="font-bold uppercase text-ink/70">Stable</span>
          ) : (
            <button
              type="button"
              onClick={rollDeathSave}
              className="rounded border border-blood px-2 py-0.5 text-xs font-semibold text-blood hover:bg-blood/10"
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
      <span className="text-[10px] font-bold uppercase text-ink/50">{label}</span>
      {Array.from({ length: total }, (_, k) => (
        <button
          key={k}
          type="button"
          aria-label={`${label} slot ${k + 1}`}
          title={k < spent ? "Restore slot" : "Spend slot"}
          onClick={() => onChange(k < spent ? k : k + 1)}
          className={`h-3.5 w-3.5 rounded-full border border-blood/60 ${
            k < spent ? "bg-blood/70" : "bg-transparent hover:bg-blood/20"
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
      className="shrink-0 rounded border border-blood px-2 py-0.5 text-xs font-semibold text-blood hover:bg-blood/10 print:hidden"
    >
      {open ? "Done" : `+ ${label}`}
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink/50">{title}</h4>
      {children}
    </div>
  );
}

function EntryBlocks({ blocks }: { blocks: { name: string; entries?: Entry[] }[] }) {
  return (
    <div className="space-y-2">
      {blocks.map((b) => (
        <div key={b.name}>
          <h5 className="font-semibold text-blood">{b.name}</h5>
          {b.entries && <Entries entries={b.entries} />}
        </div>
      ))}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-ink/50">{children}</p>;
}

function ProfDot({ on, expertise }: { on: boolean; expertise?: boolean }) {
  const cls = expertise
    ? "bg-blood ring-2 ring-blood/40"
    : on
      ? "bg-blood"
      : "border border-ink/30 bg-transparent";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} aria-hidden />;
}

/** "Cantrips", "1st Level", "2nd Level", … */
function levelLabel(n: number): string {
  if (n === 0) return "Cantrips";
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]} Level`;
}
