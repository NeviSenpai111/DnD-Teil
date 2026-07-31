import type { ReactNode } from "react";
import type { Entry, EntriesEntry, ImageEntry, ItemEntry, ListEntry, QuoteEntry, TableEntry, UnknownEntry } from "../types/common";
import { InlineText } from "../tagParser/TagRenderer";

/** Renders a list of entries with vertical spacing between blocks. */
export function Entries({ entries }: { entries: Entry[] }) {
  return (
    <div className="space-y-2">
      {entries.map((e, i) => (
        <EntryRenderer key={i} entry={e} />
      ))}
    </div>
  );
}

/**
 * Recursively renders one 5eTools entry, dispatching on its `type`. Strings are
 * paragraphs of inline-tagged text; unknown object types degrade gracefully.
 */
export function EntryRenderer({ entry }: { entry: Entry }) {
  if (typeof entry === "string") {
    return (
      <p className="leading-relaxed">
        <InlineText text={entry} />
      </p>
    );
  }

  switch (entry.type) {
    case "entries":
    case "section":
    case "variant":
    case "variantSub": {
      const e = entry as EntriesEntry;
      return (
        <section className="space-y-2">
          {e.name && <Heading level={entry.type === "section" ? 3 : 4}>{e.name}</Heading>}
          <Entries entries={e.entries} />
        </section>
      );
    }

    case "inset":
    case "insetReadaloud": {
      const e = entry as EntriesEntry;
      return (
        <aside className="space-y-2 rounded border-l-4 border-blood/50 bg-blood/5 p-3">
          {e.name && <Heading level={4}>{e.name}</Heading>}
          <Entries entries={e.entries} />
        </aside>
      );
    }

    case "list": {
      const e = entry as ListEntry;
      return (
        <ul className="list-disc space-y-1 pl-6">
          {e.items.map((item, i) => (
            <li key={i}>{renderInlineOrBlock(item)}</li>
          ))}
        </ul>
      );
    }

    case "item":
    case "itemSpell":
    case "itemSub": {
      const e = entry as ItemEntry;
      return (
        <div className="space-y-1">
          {(e.name || typeof e.entry === "string") && (
            <p className="leading-relaxed">
              {e.name && <span className="font-semibold">{e.name} </span>}
              {typeof e.entry === "string" && <InlineText text={e.entry} />}
            </p>
          )}
          {e.entry && typeof e.entry !== "string" && <EntryRenderer entry={e.entry} />}
          {e.entries && <Entries entries={e.entries} />}
        </div>
      );
    }

    case "table":
      return <TableBlock entry={entry as TableEntry} />;

    case "quote": {
      const e = entry as QuoteEntry;
      return (
        <blockquote className="border-l-4 border-ink/30 pl-3 italic">
          <Entries entries={e.entries} />
          {e.by && <footer className="mt-1 text-sm not-italic text-ink/60">— {e.by}</footer>}
        </blockquote>
      );
    }

    case "image": {
      const href = (entry as ImageEntry).href;
      const src = href?.url ?? href?.path;
      return src ? (
        <img src={src} alt={(entry as ImageEntry).title ?? ""} className="max-w-full rounded" />
      ) : null;
    }

    case "refClassFeature":
    case "refSubclassFeature":
    case "refOptionalfeature":
    case "refFeat":
      return <FeatureRefLine entry={entry as UnknownEntry} />;

    case "options": {
      // "Choose N of the following" wrapper (e.g. Totem Spirit options).
      const e = entry as { count?: number; entries?: Entry[] };
      return (
        <div className="space-y-2">
          <p className="text-sm italic text-ink/60">Choose {e.count ?? 1}:</p>
          {e.entries && <Entries entries={e.entries} />}
        </div>
      );
    }

    case "abilityDc":
    case "abilityAttackMod": {
      // Spellcasting formula blocks, e.g. "Spell save DC = 8 + prof + Int".
      const e = entry as { name?: string; attributes?: string[] };
      const abilities = (e.attributes ?? [])
        .map((a) => ABILITY_FULL[a] ?? a)
        .join(" or ");
      return (
        <p className="leading-relaxed">
          <span className="font-semibold">
            {e.name} {entry.type === "abilityDc" ? "save DC" : "attack modifier"}
          </span>{" "}
          = {entry.type === "abilityDc" && "8 + "}your proficiency bonus + your {abilities} modifier
        </p>
      );
    }

    case "statblock": {
      // Reference to a full statblock rendered elsewhere; show the name.
      const e = entry as { name?: string };
      return e.name ? (
        <p className="leading-relaxed">
          <span className="font-semibold text-blood">{e.name}</span>
        </p>
      ) : null;
    }

    case "cell": {
      // Table roll cell: {roll:{exact}} or {roll:{min,max}} (d100 tables pad).
      const roll = (entry as { roll?: { exact?: number; min?: number; max?: number; pad?: boolean } }).roll;
      if (!roll) return null;
      const pad = (n: number) => (roll.pad ? String(n).padStart(2, "0") : String(n));
      return <>{roll.exact != null ? pad(roll.exact) : `${pad(roll.min ?? 0)}–${pad(roll.max ?? 0)}`}</>;
    }

    default:
      return <UnknownBlock entry={entry as UnknownEntry} />;
  }
}

function TableBlock({ entry }: { entry: TableEntry }) {
  return (
    <figure className="overflow-x-auto">
      {entry.caption && <figcaption className="mb-1 font-semibold">{entry.caption}</figcaption>}
      <table className="w-full border-collapse text-sm">
        {entry.colLabels && (
          <thead>
            <tr className="border-b border-blood/40 text-left">
              {entry.colLabels.map((label, i) => (
                <th key={i} className="px-2 py-1">
                  <InlineText text={label} />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {entry.rows.map((row, r) => (
            <tr key={r} className="border-b border-ink/10">
              {row.map((cell, c) => (
                <td key={c} className="px-2 py-1 align-top">
                  {renderInlineOrBlock(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Full ability names for the spellcasting formula blocks (kept local — the
 * data layer must not depend on the engine). */
const ABILITY_FULL: Record<string, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

/**
 * A `refClassFeature` / `refSubclassFeature` / `refOptionalfeature` / `refFeat`
 * entry points at a feature described elsewhere (`"Name|Class|Source|…|Level"`).
 * The referenced features are already listed as their own sections in the
 * class/subclass views, so render a compact pointer instead of expanding
 * inline (which would duplicate them).
 */
function FeatureRefLine({ entry }: { entry: UnknownEntry }) {
  const e = entry as {
    classFeature?: string;
    subclassFeature?: string;
    optionalfeature?: string;
    feat?: string;
  };
  const raw = e.classFeature ?? e.subclassFeature ?? e.optionalfeature ?? e.feat;
  if (typeof raw !== "string" || !raw) return null;

  const parts = raw.split("|");
  const name = parts[0];
  // Level position: refClassFeature Name|Class|Source|Level,
  // refSubclassFeature Name|Class|ClassSource|Short|SubSource|Level.
  const levelPart = e.classFeature ? parts[3] : e.subclassFeature ? parts[5] : undefined;
  const level = levelPart && /^\d+$/.test(levelPart) ? Number(levelPart) : undefined;

  return (
    <p className="leading-relaxed">
      <span className="font-semibold text-blood">{name}</span>
      {level !== undefined && (
        <span className="text-xs uppercase text-ink/40"> · level {level}</span>
      )}
    </p>
  );
}

/** Best-effort rendering for entry objects we don't model explicitly. */
function UnknownBlock({ entry }: { entry: UnknownEntry }) {
  if (Array.isArray(entry.entries)) {
    return (
      <section className="space-y-2">
        {entry.name && <Heading level={4}>{entry.name}</Heading>}
        <Entries entries={entry.entries} />
      </section>
    );
  }
  if (Array.isArray(entry.items)) {
    return (
      <ul className="list-disc space-y-1 pl-6">
        {entry.items.map((item, i) => (
          <li key={i}>{renderInlineOrBlock(item)}</li>
        ))}
      </ul>
    );
  }
  // TODO: model this entry type. Surface it rather than silently dropping it.
  return (
    <p className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-900">
      Unsupported entry type: <code>{entry.type}</code>
    </p>
  );
}

/** Strings render inline (no paragraph wrapper); objects recurse fully. */
function renderInlineOrBlock(entry: Entry): ReactNode {
  return typeof entry === "string" ? <InlineText text={entry} /> : <EntryRenderer entry={entry} />;
}

function Heading({ level, children }: { level: 3 | 4; children: ReactNode }) {
  const cls = level === 3 ? "text-lg font-bold text-blood" : "font-semibold text-blood";
  const Tag = level === 3 ? "h3" : "h4";
  return <Tag className={cls}>{children}</Tag>;
}
