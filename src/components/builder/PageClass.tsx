import { useEffect, useState, type ReactNode } from "react";
import { useActiveEntities, useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import { deriveFromCharacter, listByType, resolveClass, skillGrantsFor } from "../../store/selectors";
import { characterLevel } from "../../model/character";
import {
  listSubclasses,
  resolveClassFeatures,
  resolveSubclassFeatures,
} from "../../data/featureResolver";
import type { ClassData } from "../../data/types/class-content";
import type { ProficiencyGrant } from "../../data/types/character-content";
import type { Entry } from "../../data/types/common";
import { Entries } from "../../data/entryRenderer/EntryRenderer";
import { STANDARD_ASI_LEVELS, asiSlotCount } from "../../engine/character";
import { weaponMasteryCount } from "../../engine/mastery";
import { multiclassCheck } from "../../engine/prerequisites";
import { optionalFeatureDefs } from "../../engine/optionalFeatures";
import { readNamedGrants, readTokenList } from "../../engine/proficiencies";
import { ABILITY_NAMES, type Ability } from "../../engine/constants";
import { Accordion, ordinal, subtitleParts } from "./Accordion";
import { EntityPicker } from "./EntityPicker";
import { SkillChoiceSelects } from "./SkillChoices";
import { AsiSlot } from "./AsiSlot";
import { SpellsPanel } from "./SpellsPanel";
import { ExpertiseSelects, OptionalFeaturePicker, WeaponMasteryPicker } from "./FeatureChoices";

const isAsiFeature = (name: string) => /ability score improvement/i.test(name);
const isExpertiseFeature = (name: string) => /^expertise$/i.test(name);

export function PageClass() {
  const entities = useActiveEntities();
  const draft = useCharacterStore((s) => s.draft);
  const setClass = useCharacterStore((s) => s.setClass);
  const index = useContentStore((s) => s.index);

  const [hpOpen, setHpOpen] = useState(false);

  if (draft.classes.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-ink">Choose a Class</h2>
        <EntityPicker
          items={listByType(entities, "class")}
          selected={undefined}
          onSelect={setClass}
          emptyHint='No classes. Import content with a "class" array.'
        />
      </div>
    );
  }

  const derived = deriveFromCharacter(draft, index);

  return (
    <div className="space-y-6">
      {/* Character Level + HP summary row */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-blood/15 pb-3">
        <div>
          <h2 className="text-xl font-bold text-ink">Character Level: {characterLevel(draft)}</h2>
          <p className="text-sm text-ink/60">Milestone Advancement</p>
        </div>
        <div className="flex items-center gap-4 rounded border border-blood/20 bg-white/60 px-3 py-2 text-sm shadow-sm">
          <span>
            <span className="font-bold">Max Hit Points:</span> {derived.maxHp ?? "—"}
          </span>
          <span>
            <span className="font-bold">Hit Dice:</span> {derived.hitDie ?? "—"}
          </span>
          <button
            type="button"
            onClick={() => setHpOpen(true)}
            className="rounded bg-blood px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-parchment hover:bg-blood-light"
          >
            Manage HP
          </button>
        </div>
      </div>

      {draft.classes.map((choice, i) => (
        <ClassSection
          key={`${choice.name}|${choice.source}|${i}`}
          classIndex={i}
          hpOpen={i === 0 ? hpOpen : undefined}
          setHpOpen={i === 0 ? setHpOpen : undefined}
        />
      ))}

      <AddAnotherClass />
    </div>
  );
}

/** One class's header (level select, remove) + Features/Spells sub-tabs. */
function ClassSection({
  classIndex,
  hpOpen,
  setHpOpen,
}: {
  classIndex: number;
  hpOpen?: boolean;
  setHpOpen?: (open: boolean) => void;
}) {
  const index = useContentStore((s) => s.index);
  const draft = useCharacterStore((s) => s.draft);
  const setClassLevel = useCharacterStore((s) => s.setClassLevel);
  const removeClass = useCharacterStore((s) => s.removeClass);

  const [tab, setTab] = useState<"features" | "spells">("features");
  // "Manage HP" (in the shared header) must reveal the Hit Points accordion,
  // which lives on the first class's Features tab.
  useEffect(() => {
    if (hpOpen) setTab("features");
  }, [hpOpen]);

  const choice = draft.classes[classIndex];
  const classData = choice ? resolveClass(index, choice) : undefined;
  if (!choice) return null;

  if (!classData) {
    return (
      <p className="rounded border border-amber-600/40 bg-amber-100/60 p-2 text-sm">
        <strong>{choice.name}</strong> ({choice.source}) isn't in the imported content — import its
        class file or{" "}
        <button type="button" onClick={() => removeClass(classIndex)} className="font-semibold text-blood underline">
          remove it
        </button>
        .
      </p>
    );
  }

  return (
    <section className="space-y-4">
      {/* class header: icon, name, level select, remove */}
      <div className="flex items-center gap-3">
        <div
          className="grid h-11 w-11 place-items-center rounded border border-blood/30 bg-blood/10 text-xl"
          aria-hidden
        >
          ⚔️
        </div>
        <h3 className="text-2xl font-bold text-ink">{classData.name}</h3>
        <label className="ml-auto flex items-center gap-2 text-sm font-semibold">
          Level
          <select
            value={choice.level}
            onChange={(e) => setClassLevel(classIndex, Number(e.target.value))}
            className="rounded border border-ink/20 bg-white px-2 py-1"
          >
            {Array.from({ length: 20 }, (_, i) => i + 1).map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => removeClass(classIndex)}
          title="Remove class"
          className="text-xl font-bold text-blood hover:text-blood-light"
        >
          ✕
        </button>
      </div>

      {/* CLASS FEATURES / SPELLS sub-tabs */}
      <nav className="flex gap-5 border-b border-blood/15 text-sm font-bold uppercase tracking-wide">
        {(["features", "spells"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 pb-1.5 ${
              tab === t ? "border-blood text-blood" : "border-transparent text-ink/50 hover:text-ink"
            }`}
          >
            {t === "features" ? "Class Features" : "Spells"} {tab === t ? "▴" : "▾"}
          </button>
        ))}
      </nav>

      {tab === "features" ? (
        <FeaturesTab
          classData={classData}
          classIndex={classIndex}
          level={choice.level}
          hpOpen={hpOpen}
          setHpOpen={setHpOpen}
        />
      ) : (
        <SpellsPanel classIndex={classIndex} />
      )}
    </section>
  );
}

function AddAnotherClass() {
  const entities = useActiveEntities();
  const index = useContentStore((s) => s.index);
  const draft = useCharacterStore((s) => s.draft);
  const addClass = useCharacterStore((s) => s.addClass);
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState<string>();

  const options = listByType(entities, "class").filter(
    (c) => !draft.classes.some((dc) => dc.name === c.name),
  );
  if (options.length === 0) return null;

  return (
    <div className="space-y-3 border-t border-blood/15 pt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded border border-blood/40 px-4 py-2 text-sm font-bold uppercase tracking-wide text-blood hover:bg-blood/10"
      >
        + Add Another Class
      </button>
      {open && (
        <>
          <p className="text-xs text-ink/60">
            Multiclassing: saving throws and starting proficiencies still come from your first
            class; spell slots are shared across casting classes.
          </p>
          {blocked && (
            <p className="rounded border border-amber-600/40 bg-amber-100/60 p-2 text-sm">
              {blocked}
            </p>
          )}
          <EntityPicker
            items={options}
            selected={undefined}
            onSelect={(ref) => {
              if (!ref) return;
              // Enforce the new class's multiclass ability prerequisites.
              const cls = resolveClass(index, ref);
              const check = multiclassCheck(
                cls?.multiclassing?.requirements,
                deriveFromCharacter(draft, index).abilities,
              );
              if (!check.met) {
                setBlocked(`${ref.name} requires ${check.text} to multiclass into.`);
                return;
              }
              setBlocked(undefined);
              addClass(ref);
              setOpen(false);
            }}
            emptyHint="No further classes to add."
          />
        </>
      )}
    </div>
  );
}

function FeaturesTab({
  classData,
  classIndex,
  level,
  hpOpen,
  setHpOpen,
}: {
  classData: ClassData;
  classIndex: number;
  level: number;
  hpOpen?: boolean;
  setHpOpen?: (open: boolean) => void;
}) {
  const entities = useActiveEntities();
  const draft = useCharacterStore((s) => s.draft);
  const index = useContentStore((s) => s.index);
  const setSubclass = useCharacterStore((s) => s.setSubclass);

  const subclasses = listSubclasses(entities, classData);
  const subclassChoice = draft.classes[classIndex]?.subclass;
  const subclassData = subclasses.find(
    (s) => s.name === subclassChoice?.name && s.source === subclassChoice?.source,
  );

  // Choice-driven features get interactive accordions instead of plain text:
  // optional-feature progressions (fighting styles, invocations, …) declared by
  // the class/subclass, and Expertise features (skill picks).
  const optDefs = optionalFeatureDefs({ cls: classData, subclass: subclassData, classIndex, level });
  const optLabels = new Set(optDefs.map((d) => d.label.toLowerCase()));

  const masteryCount = weaponMasteryCount(classData, level);

  const gainedAll = [
    ...resolveClassFeatures(entities, classData, level),
    ...(subclassData ? resolveSubclassFeatures(entities, classData, subclassData, level) : []),
  ].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  const expertiseFeatures = gainedAll.filter((f) => isExpertiseFeature(f.name));
  const gained = gainedAll.filter(
    // ASI/optional/expertise/mastery features are replaced by interactive cards.
    (f) =>
      !isAsiFeature(f.name) &&
      !optLabels.has(f.name.toLowerCase()) &&
      !isExpertiseFeature(f.name) &&
      !(masteryCount > 0 && /^weapon mastery$/i.test(f.name)),
  );

  const higher = [
    ...resolveClassFeatures(entities, classData, 20),
    ...(subclassData ? resolveSubclassFeatures(entities, classData, subclassData, 20) : []),
  ]
    .filter((f) => f.level > level)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  // ASI slots are per CLASS level; global slot indices run class-by-class, so
  // this class's slots start after all earlier classes' slots.
  const asiLevels = STANDARD_ASI_LEVELS.filter((l) => l <= level);
  const slotOffset = draft.classes
    .slice(0, classIndex)
    .reduce((sum, c) => sum + asiSlotCount(c.level), 0);

  // How many skill picks the class offers (for the Proficiencies subtitle).
  const classSkillPicks = skillGrantsFor(draft, index)
    .choices.filter((c) => c.key.startsWith("class:"))
    .reduce((sum, c) => sum + c.count, 0);

  const isFirst = classIndex === 0;
  const cards: { key: string; level: number; el: ReactNode }[] = [
    ...(isFirst
      ? [
          {
            key: "hp",
            level: 1,
            el: (
              <Accordion
                key="hp"
                title="Hit Points"
                subtitle={subtitleParts("1st level")}
                open={hpOpen ?? false}
                onToggle={setHpOpen ?? (() => {})}
              >
                <HitPointsPanel classData={classData} totalLevel={characterLevel(draft)} />
              </Accordion>
            ),
          },
          {
            key: "prof",
            level: 1,
            el: (
              <Accordion
                key="prof"
                title="Proficiencies"
                subtitle={subtitleParts(classSkillPicks > 0 && `${classSkillPicks} Choices`, "1st level")}
              >
                <ProficienciesPanel classData={classData} />
              </Accordion>
            ),
          },
        ]
      : []),
    ...(subclasses.length > 0
      ? [
          {
            key: "subclass",
            level: 1,
            el: (
              <Accordion
                key="subclass"
                title={classData.subclassTitle ?? "Subclass"}
                subtitle={subtitleParts("1 Choice")}
                defaultOpen={!subclassData}
              >
                <EntityPicker
                  items={subclasses.map((s) => ({ ...s, __type: "subclass" as const }))}
                  selected={subclassChoice}
                  onSelect={(ref) => setSubclass(classIndex, ref)}
                  emptyHint="No subclasses available."
                />
              </Accordion>
            ),
          },
        ]
      : []),
    ...gained.map((f, i) => ({
      key: `f:${f.name}:${i}`,
      level: f.level,
      el: (
        <Accordion key={`f:${f.name}:${i}`} title={f.name} subtitle={`${ordinal(f.level)} level`}>
          {f.entries ? <Entries entries={f.entries} /> : <p className="text-ink/50">No description.</p>}
        </Accordion>
      ),
    })),
    ...optDefs.map((def) => {
      // The class often has a same-named feature explaining the choice — show
      // its text above the picker instead of as a separate accordion.
      const feature = gainedAll.find((f) => f.name.toLowerCase() === def.label.toLowerCase());
      const picks = draft.optionalFeatures[def.key] ?? [];
      return {
        key: def.key,
        level: def.level,
        el: (
          <Accordion
            key={def.key}
            title={def.label}
            subtitle={subtitleParts(
              `${def.count} ${def.count === 1 ? "Choice" : "Choices"}`,
              `${ordinal(def.level)} level`,
            )}
            defaultOpen={picks.length < def.count}
          >
            {feature?.entries && (
              <div className="mb-2 text-sm text-ink/70">
                <Entries entries={feature.entries} />
              </div>
            )}
            <OptionalFeaturePicker def={def} classLevel={level} />
          </Accordion>
        ),
      };
    }),
    ...(masteryCount > 0
      ? [
          {
            key: "mastery",
            level: 1,
            el: (
              <Accordion
                key="mastery"
                title="Weapon Mastery"
                subtitle={subtitleParts(
                  `${masteryCount} ${masteryCount === 1 ? "Choice" : "Choices"}`,
                  "1st level",
                )}
                defaultOpen={draft.weaponMasteries.length < masteryCount}
              >
                {(() => {
                  const feature = gainedAll.find((f) => /^weapon mastery$/i.test(f.name));
                  return feature?.entries ? (
                    <div className="mb-2 text-sm text-ink/70">
                      <Entries entries={feature.entries} />
                    </div>
                  ) : null;
                })()}
                <WeaponMasteryPicker count={masteryCount} />
              </Accordion>
            ),
          },
        ]
      : []),
    ...expertiseFeatures.map((f) => {
      const key = `expertise:${classIndex}:${f.level}`;
      return {
        key,
        level: f.level,
        el: (
          <Accordion
            key={key}
            title={f.name}
            subtitle={subtitleParts("2 Choices", `${ordinal(f.level)} level`)}
            defaultOpen={(draft.expertiseChoices[key] ?? []).length < 2}
          >
            {f.entries && (
              <div className="mb-2 text-sm text-ink/70">
                <Entries entries={f.entries} />
              </div>
            )}
            <ExpertiseSelects choiceKey={key} count={2} />
          </Accordion>
        ),
      };
    }),
    ...asiLevels.map((asiLevel, i) => {
      const slot = slotOffset + i;
      return {
        key: `asi:${slot}`,
        level: asiLevel,
        el: (
          <Accordion
            key={`asi:${slot}`}
            title="Ability Score Improvement"
            subtitle={subtitleParts("1 Choice", `${ordinal(asiLevel)} level`)}
            defaultOpen={!draft.asis[slot]}
          >
            <AsiSlot index={slot} />
          </Accordion>
        ),
      };
    }),
  ].sort((a, b) => a.level - b.level);

  return (
    <div className="space-y-2">
      {cards.map((c) => c.el)}

      {higher.length > 0 && <HigherLevels features={higher} />}
    </div>
  );
}

function HitPointsPanel({ classData, totalLevel }: { classData: ClassData; totalLevel: number }) {
  const draft = useCharacterStore((s) => s.draft);
  const setHpMode = useCharacterStore((s) => s.setHpMode);
  const setHpRolls = useCharacterStore((s) => s.setHpRolls);

  if (!classData.hd) return <p className="text-ink/50">This class declares no hit die.</p>;
  const faces = classData.hd.faces;

  return (
    <div className="space-y-2">
      <p className="text-ink/70">
        <strong>Hit Die:</strong> d{faces} · level 1 grants {faces} + your Constitution modifier;
        later levels add each class's die average or a roll.
      </p>
      {totalLevel > 1 && (
        <>
          <div className="flex gap-2">
            {(["average", "rolled"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setHpMode(mode)}
                className={`rounded border px-2 py-1 text-xs ${
                  draft.hpMode === mode ? "border-blood bg-blood/10 font-semibold" : "border-ink/20"
                }`}
              >
                {mode === "average" ? "Average HP" : "Rolled HP"}
              </button>
            ))}
          </div>
          {draft.hpMode === "rolled" && (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: totalLevel - 1 }).map((_, i) => (
                <label key={i} className="text-xs">
                  L{i + 2}
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={draft.hpRolls[i] ?? ""}
                    onChange={(e) => {
                      const rolls = [...draft.hpRolls];
                      rolls[i] = Number(e.target.value) || 0;
                      setHpRolls(rolls);
                    }}
                    className="ml-1 w-14 rounded border border-ink/20 px-1 py-0.5"
                  />
                </label>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProficienciesPanel({ classData }: { classData: ClassData }) {
  const sp = classData.startingProficiencies;
  const saves = (classData.proficiency ?? [])
    .map((a) => ABILITY_NAMES[a as Ability] ?? a)
    .join(", ");
  const armor = readTokenList(sp?.armor);
  const weapons = readTokenList(sp?.weapons);
  const tools = readNamedGrants(sp?.tools as ProficiencyGrant[] | undefined);

  const rows: [string, string][] = [
    ["Saving Throws", saves],
    ["Armor", armor.join(", ")],
    ["Weapons", weapons.join(", ")],
    ["Tools", [...tools.fixed, ...tools.notes].join(", ")],
  ];

  return (
    <div className="space-y-3">
      <dl className="space-y-1">
        {rows
          .filter(([, v]) => v)
          .map(([label, value]) => (
            <div key={label} className="text-sm">
              <dt className="inline font-semibold">{label}: </dt>
              <dd className="inline text-ink/70">{value}</dd>
            </div>
          ))}
      </dl>
      <SkillChoiceSelects prefixes={["class:"]} />
    </div>
  );
}

function HigherLevels({ features }: { features: { name: string; level: number; entries?: Entry[] }[] }) {
  return (
    <Accordion title={`Available at Higher Levels (${features.length})`}>
      <ul className="space-y-1 text-sm text-ink/70">
        {features.map((f, i) => (
          <li key={`${f.name}:${i}`} className="flex justify-between gap-2 border-b border-ink/5 pb-1">
            <span>{f.name}</span>
            <span className="text-xs uppercase text-ink/40">{ordinal(f.level)} level</span>
          </li>
        ))}
      </ul>
    </Accordion>
  );
}
