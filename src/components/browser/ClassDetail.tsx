import type { ClassData, Subclass } from "../../data/types/class-content";
import type { ProficiencyGrant } from "../../data/types/character-content";
import type { Entry } from "../../data/types/common";
import { Entries } from "../../data/entryRenderer/EntryRenderer";
import { listSubclasses, resolveClassFeatures } from "../../data/featureResolver";
import type { ImportedEntity } from "../../data/types/content";
import { useActiveEntities } from "../../store/contentStore";
import { readNamedGrants, readTokenList } from "../../engine/proficiencies";
import { ABILITY_NAMES, type Ability } from "../../engine/constants";

interface LeveledFeature {
  name: string;
  level: number;
  entries?: Entry[];
}

/** "1st", "2nd", … for feature level headings. */
function ordinal(n: number): string {
  const suffix = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `${n}${suffix}`;
}

function FeatureSections({ features }: { features: LeveledFeature[] }) {
  if (features.length === 0) {
    return <p className="text-sm text-ink/50">No features imported for this entry.</p>;
  }
  return (
    <div className="space-y-3">
      {features.map((f, i) => (
        <section key={`${f.name}:${f.level}:${i}`}>
          <h3 className="font-bold text-blood">
            {f.name}{" "}
            <span className="text-xs font-semibold uppercase text-ink/40">
              {ordinal(f.level)} level
            </span>
          </h3>
          {f.entries && (
            <div className="text-sm">
              <Entries entries={f.entries} />
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

/** Browser detail card for a `class` entity: stats, proficiencies, features. */
export function ClassDetail({ cls }: { cls: ClassData }) {
  const entities = useActiveEntities();
  const features = resolveClassFeatures(entities, cls, 20);
  const subclasses = listSubclasses(entities, cls);

  const sp = cls.startingProficiencies;
  const saves = (cls.proficiency ?? []).map((a) => ABILITY_NAMES[a as Ability] ?? a).join(", ");
  const tools = readNamedGrants(sp?.tools as ProficiencyGrant[] | undefined);
  const rows: [string, string | undefined][] = [
    ["Hit Die", cls.hd ? `d${cls.hd.faces}` : undefined],
    ["Saving Throws", saves || undefined],
    ["Armor", readTokenList(sp?.armor).join(", ") || undefined],
    ["Weapons", readTokenList(sp?.weapons).join(", ") || undefined],
    ["Tools", [...tools.fixed, ...tools.notes].join(", ") || undefined],
    [
      "Spellcasting",
      cls.spellcastingAbility
        ? `${ABILITY_NAMES[cls.spellcastingAbility as Ability] ?? cls.spellcastingAbility}${cls.casterProgression ? ` (${cls.casterProgression} caster)` : ""}`
        : undefined,
    ],
    [
      cls.subclassTitle ?? "Subclasses",
      subclasses.length ? subclasses.map((s) => s.name).join(", ") : undefined,
    ],
  ];

  return (
    <article className="mx-auto max-w-2xl rounded border border-blood/30 bg-parchment p-5 shadow">
      <header className="border-b border-blood/30 pb-2">
        <h2 className="text-2xl font-bold text-blood">{cls.name}</h2>
        <p className="text-xs uppercase tracking-wide text-ink/60">class · {cls.source}</p>
      </header>

      <dl className="mt-3 space-y-1 text-sm">
        {rows
          .filter((r): r is [string, string] => !!r[1])
          .map(([label, value]) => (
            <div key={label}>
              <dt className="inline font-semibold">{label}: </dt>
              <dd className="inline text-ink/80">{value}</dd>
            </div>
          ))}
      </dl>

      {cls.entries && cls.entries.length > 0 && (
        <div className="mt-3 text-sm">
          <Entries entries={cls.entries} />
        </div>
      )}

      <div className="mt-4 border-t border-blood/15 pt-3">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink/60">
          Class Features
        </h3>
        <FeatureSections features={features} />
      </div>
    </article>
  );
}

/** Browser detail card for a `subclass` entity: its features by level. */
export function SubclassDetail({ subclass }: { subclass: Subclass }) {
  const entities = useActiveEntities();
  // Resolve without needing the parent class entity: match by class name +
  // subclass short name directly, across all levels.
  const features = entities
    .filter((e) => e.__type === "subclassFeature")
    .map((e) => e as unknown as ImportedEntity & LeveledFeature & { className?: string; subclassShortName?: string })
    .filter(
      (f) =>
        f.className === subclass.className &&
        (f.subclassShortName === subclass.shortName || f.subclassShortName === subclass.name),
    )
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  return (
    <article className="mx-auto max-w-2xl rounded border border-blood/30 bg-parchment p-5 shadow">
      <header className="border-b border-blood/30 pb-2">
        <h2 className="text-2xl font-bold text-blood">{subclass.name}</h2>
        <p className="text-xs uppercase tracking-wide text-ink/60">
          {subclass.className} subclass · {subclass.source}
        </p>
      </header>
      <div className="mt-3">
        <FeatureSections features={features} />
      </div>
    </article>
  );
}
