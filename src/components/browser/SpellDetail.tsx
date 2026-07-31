import type { Spell } from "../../data/types/spell-content";
import { Entries } from "../../data/entryRenderer/EntryRenderer";
import {
  formatCastingTime,
  formatComponents,
  formatDuration,
  formatRange,
  levelSchoolLine,
} from "../common/spellDisplay";

/**
 * Detail card for a `spell`: level/school line, casting stats, description and
 * at-higher-levels text. `embedded` renders a compact version for inline use
 * (expanded rows on the character sheet) instead of the full browser card.
 */
export function SpellDetail({ spell, embedded }: { spell: Spell; embedded?: boolean }) {
  const rows: [string, string | undefined][] = [
    ["Casting Time", formatCastingTime(spell.time)],
    ["Range", formatRange(spell.range)],
    ["Components", formatComponents(spell.components)],
    ["Duration", formatDuration(spell.duration)],
  ];
  const shown = rows.filter((r): r is [string, string] => !!r[1]);

  return (
    <article
      className={
        embedded
          ? "rounded border border-blood/20 bg-white/50 p-3"
          : "mx-auto max-w-2xl rounded border border-blood/30 bg-parchment p-5 shadow"
      }
    >
      <header className="border-b border-blood/30 pb-2">
        <h2 className={`font-bold text-blood ${embedded ? "text-lg" : "text-2xl"}`}>
          {spell.name}
        </h2>
        <p className="text-xs uppercase tracking-wide text-ink/60">
          {levelSchoolLine(spell)} · {spell.source}
          {spell.meta?.ritual && (
            <span className="ml-1.5 rounded border border-ink/30 px-1 font-semibold text-ink/50">
              Ritual
            </span>
          )}
        </p>
      </header>

      {shown.length > 0 && (
        <dl className="mt-3 space-y-1 text-sm">
          {shown.map(([label, value]) => (
            <div key={label}>
              <dt className="inline font-semibold">{label}: </dt>
              <dd className="inline text-ink/80">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {spell.entries && spell.entries.length > 0 && (
        <div className="mt-3 border-t border-blood/15 pt-3 text-sm">
          <Entries entries={spell.entries} />
        </div>
      )}
      {spell.entriesHigherLevel && spell.entriesHigherLevel.length > 0 && (
        <div className="mt-2 text-sm">
          <Entries entries={spell.entriesHigherLevel} />
        </div>
      )}
    </article>
  );
}
