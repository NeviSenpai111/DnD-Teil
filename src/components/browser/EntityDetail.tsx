import type { Entry, ImportedEntity, Vehicle } from "../../data/types";
import type { Item } from "../../data/types/item-content";
import type { Spell } from "../../data/types/spell-content";
import type { ClassData, OptionalFeature, Subclass } from "../../data/types/class-content";
import { featureTypeLabel, levelPrerequisite } from "../../engine/optionalFeatures";
import { Entries } from "../../data/entryRenderer/EntryRenderer";
import { VehicleStatblock } from "./VehicleStatblock";
import { ItemDetail } from "./ItemDetail";
import { SpellDetail } from "./SpellDetail";
import { ClassDetail, SubclassDetail } from "./ClassDetail";

/**
 * Renders a single imported entity, dispatching on content type. Vehicles,
 * items, spells, classes and subclasses get dedicated views; everything else
 * uses a generic card backed by the recursive entry renderer.
 */
export function EntityDetail({ entity }: { entity: ImportedEntity }) {
  if (entity.__type === "vehicle") {
    return <VehicleStatblock vehicle={entity as unknown as Vehicle} />;
  }
  if (entity.__type === "item" || entity.__type === "baseitem") {
    return <ItemDetail item={entity as unknown as Item} />;
  }
  if (entity.__type === "spell") {
    return <SpellDetail spell={entity as unknown as Spell} />;
  }
  if (entity.__type === "class") {
    return <ClassDetail cls={entity as unknown as ClassData} />;
  }
  if (entity.__type === "subclass") {
    return <SubclassDetail subclass={entity as unknown as Subclass} />;
  }
  if (entity.__type === "optionalfeature") {
    return <OptionalFeatureDetail feature={entity as unknown as OptionalFeature} />;
  }

  const entries = Array.isArray((entity as { entries?: Entry[] }).entries)
    ? ((entity as { entries?: Entry[] }).entries as Entry[])
    : undefined;

  return <GenericCard entity={entity} entries={entries} />;
}

/** Optional feature (invocation, infusion, metamagic, …): readable type + prerequisite. */
function OptionalFeatureDetail({ feature }: { feature: OptionalFeature }) {
  const types = (feature.featureType ?? []).map(featureTypeLabel);
  const typeLine = [...new Set(types)].join(", ") || "Optional Feature";
  const prereqLevel = levelPrerequisite(feature);

  return (
    <article className="mx-auto max-w-2xl rounded border border-blood/30 bg-parchment p-5 shadow">
      <header className="border-b border-blood/30 pb-2">
        <h2 className="text-2xl font-bold text-blood">{feature.name}</h2>
        <p className="text-xs uppercase tracking-wide text-ink/60">
          {typeLine} · {feature.source}
        </p>
      </header>
      {prereqLevel !== undefined && (
        <p className="mt-2 text-sm">
          <span className="font-semibold">Prerequisite:</span> level {prereqLevel}
        </p>
      )}
      <div className="mt-3 text-sm">
        {feature.entries ? (
          <Entries entries={feature.entries} />
        ) : (
          <p className="text-ink/60">No description text.</p>
        )}
      </div>
    </article>
  );
}

function GenericCard({ entity, entries }: { entity: ImportedEntity; entries?: Entry[] }) {

  return (
    <article className="mx-auto max-w-2xl rounded border border-blood/30 bg-parchment p-5 shadow">
      <header className="border-b border-blood/30 pb-2">
        <h2 className="text-2xl font-bold text-blood">{entity.name}</h2>
        <p className="text-xs uppercase tracking-wide text-ink/60">
          {entity.__type} · {entity.source}
        </p>
      </header>
      <div className="mt-3 text-sm">
        {entries ? (
          <Entries entries={entries} />
        ) : (
          <p className="text-ink/60">This {entity.__type} entry carries no description text.</p>
        )}
      </div>
    </article>
  );
}
