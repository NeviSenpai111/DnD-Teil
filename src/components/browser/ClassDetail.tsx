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
    return <p className="text-sm text-ink-muted">No features imported for this entry.</p>;
  }
  return (
    <div className="divide-y divide-line">
      {features.map((f, i) => (
        <section key={`${f.name}:${f.level}:${i}`} className="py-4 first:pt-0 last:pb-0">
          <h3 className="flex items-baseline gap-2 font-semibold tracking-tight text-ink">
            {f.name}{" "}
            <span className="chip">
              {ordinal(f.level)} level
            </span>
          </h3>
          {f.entries && (
            <div className="prose-rules mt-1.5">
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
    <article className="detail">
      <header className="detail-head">
        <h2 className="detail-title">{cls.name}</h2>
        <p className="eyebrow mt-2">class · {cls.source}</p>
      </header>

      <dl className="detail-facts">
        {rows
          .filter((r): r is [string, string] => !!r[1])
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}: </dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>

      {cls.entries && cls.entries.length > 0 && (
        <div className="prose-rules mt-5">
          <Entries entries={cls.entries} />
        </div>
      )}

      <div className="mt-6 border-t border-line pt-5">
        <h3 className="eyebrow mb-4">
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
    <article className="detail">
      <header className="detail-head">
        <h2 className="detail-title">{subclass.name}</h2>
        <p className="eyebrow mt-2">
          {subclass.className} subclass · {subclass.source}
        </p>
      </header>
      <div className="mt-5">
        <FeatureSections features={features} />
      </div>
    </article>
  );
}
