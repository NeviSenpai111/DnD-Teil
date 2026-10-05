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
          ? "rounded-lg border border-line bg-surface p-4"
          : "detail"
      }
    >
      <header className="detail-head">
        <h2 className={`detail-title ${embedded ? "text-lg" : ""}`}>
          {spell.name}
        </h2>
        <p className="eyebrow mt-2">
          {levelSchoolLine(spell)} · {spell.source}
          {spell.meta?.ritual && (
            <span className="ml-1.5 rounded border border-line-strong px-1 font-semibold text-ink-muted">
              Ritual
            </span>
          )}
        </p>
      </header>

      {shown.length > 0 && (
        <dl className="detail-facts">
          {shown.map(([label, value]) => (
            <div key={label}>
              <dt>{label}: </dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {spell.entries && spell.entries.length > 0 && (
        <div className="prose-rules mt-5 border-t border-line pt-5">
          <Entries entries={spell.entries} />
        </div>
      )}
      {spell.entriesHigherLevel && spell.entriesHigherLevel.length > 0 && (
        <div className="prose-rules mt-3">
          <Entries entries={spell.entriesHigherLevel} />
        </div>
      )}
    </article>
  );
}
