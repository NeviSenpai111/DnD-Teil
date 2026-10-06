import { Link } from "react-router-dom";
import { Icon } from "../common/Icon";
import { useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import {
  allSpellcastersFor,
  deriveFromCharacter,
  skillGrantsFor,
} from "../../store/selectors";
import { characterLevel } from "../../model/character";
import { asiSlotsForClasses } from "../../engine/character";
import { speciesLabel } from "../../engine/edition";
import { downloadCharacterJson } from "../../data/exportCharacter";

interface ChecklistItem {
  label: string;
  done: boolean;
  page: string;
}

/** Completion page: an open-choices checklist plus save/export/sheet actions. */
export function PageWhatsNext({ goTo }: { goTo: (id: string) => void }) {
  const draft = useCharacterStore((s) => s.draft);
  const index = useContentStore((s) => s.index);
  const saveDraftToLibrary = useCharacterStore((s) => s.saveDraftToLibrary);

  const derived = deriveFromCharacter(draft, index);
  const grants = skillGrantsFor(draft, index);
  const casters = allSpellcastersFor(draft, index);

  const openSkillPicks = grants.choices.reduce(
    (sum, c) => sum + Math.max(0, c.count - (draft.skillChoices[c.key] ?? []).length),
    0,
  );
  const openAsiSlots =
    asiSlotsForClasses(draft.classes.map((c) => c.level)) - draft.asis.filter(Boolean).length;

  // Per-class shortfalls: untagged legacy picks count toward the first caster.
  const pickCount = (list: { forClass?: string }[], className: string, classIndex: number) =>
    list.filter((p) => p.forClass === className || (!p.forClass && classIndex === 0)).length;
  const missingCantrips = casters.reduce(
    (sum, sc) =>
      sum + Math.max(0, sc.limits.cantrips - pickCount(draft.cantrips, sc.className, sc.classIndex)),
    0,
  );
  const missingSpells = casters.reduce(
    (sum, sc) =>
      sum + Math.max(0, sc.limits.spells - pickCount(draft.spells, sc.className, sc.classIndex)),
    0,
  );

  const items: ChecklistItem[] = [
    { label: "Choose a class", done: draft.classes.length > 0, page: "class" },
    { label: "Choose a background", done: !!draft.background, page: "background" },
    { label: `Choose a ${speciesLabel(draft.edition).toLowerCase()}`, done: !!draft.race, page: "species" },
    {
      label: openSkillPicks > 0 ? `Pick ${openSkillPicks} more skill${openSkillPicks === 1 ? "" : "s"}` : "Pick your skills",
      done: openSkillPicks === 0,
      page: "class",
    },
    ...(casters.length > 0
      ? [
          {
            label:
              missingCantrips > 0
                ? `Choose ${missingCantrips} more cantrip${missingCantrips === 1 ? "" : "s"}`
                : "Choose your cantrips",
            done: missingCantrips === 0,
            page: "class",
          },
          {
            label:
              missingSpells > 0
                ? `Choose ${missingSpells} more spell${missingSpells === 1 ? "" : "s"}`
                : "Choose your spells",
            done: missingSpells === 0,
            page: "class",
          },
        ]
      : []),
    ...(openAsiSlots > 0
      ? [{ label: `Resolve ${openAsiSlots} ability score improvement${openAsiSlots === 1 ? "" : "s"}`, done: false, page: "class" }]
      : []),
    { label: "Add equipment", done: draft.inventory.length > 0, page: "equipment" },
  ];

  const openCount = items.filter((i) => !i.done).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-ink">What's Next</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {openCount === 0
            ? `${draft.name} is ready to play!`
            : `${openCount} step${openCount === 1 ? "" : "s"} left before ${draft.name} is ready.`}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip label="Level" value={characterLevel(draft)} />
        <Chip label="Max HP" value={derived.maxHp ?? "—"} />
        <Chip label="AC" value={derived.ac} />
      </div>

      <ul className="stagger max-w-md space-y-1.5">
        {items.map((item) => (
          <li key={item.label}>
            <button
              type="button"
              onClick={() => goTo(item.page)}
              className="group flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-left text-sm transition-colors hover:border-line-strong"
            >
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                  item.done ? "bg-success text-surface" : "border border-dashed border-line-strong"
                }`}
                aria-hidden
              >
                {item.done && <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.25} />}
              </span>
              <span className={`flex-1 ${item.done ? "text-ink-muted line-through decoration-ink-faint" : ""}`}>{item.label}</span>
              <Icon name="chevron-right" className="h-4 w-4 text-ink-faint transition-transform group-hover:translate-x-0.5" />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={saveDraftToLibrary}
          className="btn btn-primary"
        >
          Save to Library
        </button>
        <Link
          to="/sheet/draft"
          className="btn btn-secondary"
        >
          View Full Sheet
          <Icon name="arrow-up-right" className="h-3.5 w-3.5" />
        </Link>
        <button
          type="button"
          onClick={() => downloadCharacterJson(draft)}
          className="btn btn-secondary"
        >
          Export JSON
        </button>
      </div>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline gap-2 rounded-lg border border-line bg-surface-sunk px-3 py-2">
      <div className="eyebrow">{label}</div>
      <div className="font-mono text-base font-medium">{value}</div>
    </div>
  );
}
