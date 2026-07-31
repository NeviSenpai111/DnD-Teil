import { useState } from "react";
import { useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import { abilityBreakdownFor, deriveFromCharacter } from "../../store/selectors";
import { emptyAbilities, type AbilityMethod } from "../../model/character";
import {
  ABILITIES,
  ABILITY_NAMES,
  POINT_BUY_BUDGET,
  STANDARD_ARRAY,
  type Ability,
} from "../../engine/constants";
import { formatMod, pointBuyCost } from "../../engine/modifiers";
import { roll4d6DropLowest } from "../../engine/dice";

const METHODS: { id: AbilityMethod; label: string }[] = [
  { id: "point-buy", label: "Point Buy" },
  { id: "standard-array", label: "Standard Array" },
  { id: "roll", label: "Roll" },
  { id: "manual", label: "Manual" },
];

type Assignment = Record<Ability, number | null>;
const emptyAssignment = (): Assignment =>
  Object.fromEntries(ABILITIES.map((a) => [a, null])) as Assignment;

export function PageAbilities() {
  const draft = useCharacterStore((s) => s.draft);
  const index = useContentStore((s) => s.index);
  const setMethod = useCharacterStore((s) => s.setAbilityMethod);
  const setBaseAbilities = useCharacterStore((s) => s.setBaseAbilities);
  const setBaseAbility = useCharacterStore((s) => s.setBaseAbility);

  const [pool, setPool] = useState<number[]>([...STANDARD_ARRAY]);
  const [assignment, setAssignment] = useState<Assignment>(emptyAssignment());

  const derived = deriveFromCharacter(draft, index);
  const method = draft.abilityMethod;

  function changeMethod(next: AbilityMethod) {
    setMethod(next);
    if (next === "point-buy") {
      setBaseAbilities(emptyAbilities(8));
    } else if (next === "standard-array") {
      setPool([...STANDARD_ARRAY]);
      setAssignment(emptyAssignment());
      setBaseAbilities(emptyAbilities(8));
    } else if (next === "roll") {
      setPool([]);
      setAssignment(emptyAssignment());
      setBaseAbilities(emptyAbilities(8));
    }
  }

  function assign(ability: Ability, value: number | null) {
    const next = { ...assignment, [ability]: value };
    setAssignment(next);
    const scores = emptyAbilities(8);
    for (const a of ABILITIES) scores[a] = next[a] ?? 8;
    setBaseAbilities(scores);
  }

  function reroll() {
    setPool(Array.from({ length: 6 }, roll4d6DropLowest).sort((a, b) => b - a));
    setAssignment(emptyAssignment());
    setBaseAbilities(emptyAbilities(8));
  }

  const spent = pointBuyCost(draft.baseAbilities);
  const remaining = POINT_BUY_BUDGET - spent;

  // Point buy: a value is offered if switching to it stays within budget.
  const canSet = (ability: Ability, value: number) => {
    if (value < 8 || value > 15) return false;
    const trial = { ...draft.baseAbilities, [ability]: value };
    return pointBuyCost(trial) <= POINT_BUY_BUDGET;
  };

  // Standard array / roll: values still unassigned (each may appear twice).
  const remainingPool = new Map<number, number>();
  for (const v of pool) remainingPool.set(v, (remainingPool.get(v) ?? 0) + 1);
  for (const v of Object.values(assignment))
    if (v != null) remainingPool.set(v, (remainingPool.get(v) ?? 0) - 1);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-ink">Ability Scores</h2>

      <select
        value={method}
        onChange={(e) => changeMethod(e.target.value as AbilityMethod)}
        className="block w-full max-w-md rounded border border-ink/20 bg-white px-2 py-2 text-sm"
      >
        {METHODS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>

      {method === "point-buy" && (
        <div className="text-center">
          <div className="text-xs font-bold uppercase tracking-wide text-ink/60">
            Points Remaining
          </div>
          <div className={`text-2xl font-bold ${remaining < 0 ? "text-blood" : ""}`}>
            {remaining} <span className="text-base font-normal text-ink/50">/ {POINT_BUY_BUDGET}</span>
          </div>
        </div>
      )}

      {method === "roll" && (
        <div className="text-center">
          <button
            type="button"
            onClick={reroll}
            className="rounded bg-blood px-3 py-2 text-sm font-semibold text-parchment hover:bg-blood-light"
          >
            {pool.length === 0 ? "Roll 4d6 (drop lowest) × 6" : "Reroll"}
          </button>
          {pool.length > 0 && (
            <p className="mt-1 text-xs text-ink/60">
              Pool: {[...pool].sort((a, b) => b - a).join(", ")}
            </p>
          )}
        </div>
      )}

      {/* six ability columns with control + TOTAL, like DDB */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {ABILITIES.map((ab) => {
          const current = assignment[ab];
          const options = [...new Set(pool)]
            .filter((v) => (remainingPool.get(v) ?? 0) > 0 || v === current)
            .sort((a, b) => b - a);
          return (
            <div key={ab} className="text-center">
              <div className="text-xs font-bold uppercase tracking-wide text-ink/70">
                {ABILITY_NAMES[ab]}
              </div>
              <div className="mt-1">
                {method === "point-buy" && (
                  <select
                    value={draft.baseAbilities[ab]}
                    onChange={(e) => setBaseAbility(ab, Number(e.target.value))}
                    className="w-full rounded border border-ink/20 bg-white px-1 py-1.5 text-sm"
                  >
                    {Array.from({ length: 8 }, (_, i) => i + 8).map((v) => (
                      <option key={v} value={v} disabled={!canSet(ab, v)}>
                        {v}
                      </option>
                    ))}
                  </select>
                )}
                {(method === "standard-array" || method === "roll") && (
                  <select
                    value={current ?? ""}
                    onChange={(e) => assign(ab, e.target.value === "" ? null : Number(e.target.value))}
                    className="w-full rounded border border-ink/20 bg-white px-1 py-1.5 text-sm"
                  >
                    <option value="">—</option>
                    {options.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                )}
                {method === "manual" && (
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={draft.baseAbilities[ab]}
                    onChange={(e) => setBaseAbility(ab, Number(e.target.value) || 0)}
                    className="w-full rounded border border-ink/20 bg-white px-1 py-1.5 text-center text-sm"
                  />
                )}
              </div>
              <div className="mt-1 text-xs font-bold uppercase text-ink/50">
                Total: <span className="text-sm text-ink">{derived.abilities[ab]}</span>
              </div>
            </div>
          );
        })}
      </div>

      <ScoreCalculations />
    </div>
  );
}

/** DDB's per-ability breakdown cards: total, modifier, base, itemised bonuses,
 * plus editable Set Score / Other Modifier / Override Score rows. */
function ScoreCalculations() {
  const draft = useCharacterStore((s) => s.draft);
  const index = useContentStore((s) => s.index);
  const setAbilityAdjustment = useCharacterStore((s) => s.setAbilityAdjustment);
  const derived = deriveFromCharacter(draft, index);
  const breakdown = abilityBreakdownFor(draft, index);
  const adj = draft.abilityAdjustments;

  return (
    <section className="space-y-3">
      <h3 className="text-xl font-bold text-ink">Score Calculations</h3>
      <p className="text-sm text-ink/70">
        Calculations combine the base scores you set above with every bonus from your{" "}
        {draft.edition === "one" ? "background" : "species"}, feats and ability score improvements.
        <span className="block text-xs text-ink/50">
          Set Score replaces the base score · Other Modifier adds on top · Override Score wins over
          everything.
        </span>
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ABILITIES.map((ab) => {
          const rows = breakdown
            .map((s) => ({ source: s.source, amount: s.bonuses[ab] ?? 0 }))
            .filter((r) => r.amount !== 0);
          const bonusTotal = rows.reduce((sum, r) => sum + r.amount, 0);
          return (
            <div key={ab} className="overflow-hidden rounded border border-blood/20 bg-white/60">
              <div className="bg-ink px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-parchment">
                {ABILITY_NAMES[ab]}
              </div>
              <dl className="divide-y divide-ink/10 text-sm">
                <Row label="Total Score" value={derived.abilities[ab]} strong />
                <Row label="Modifier" value={formatMod(derived.mods[ab])} strong />
                <Row label="Base Score" value={draft.baseAbilities[ab]} />
                <Row label="Bonus" value={formatMod(bonusTotal)} />
                {rows.map((r) => (
                  <div key={r.source} className="flex justify-between px-3 py-1 text-xs text-ink/60">
                    <dt className="pl-3">{r.source}</dt>
                    <dd>({formatMod(r.amount)})</dd>
                  </div>
                ))}
                <AdjustRow
                  label="Set Score"
                  value={adj.set[ab]}
                  onChange={(v) => setAbilityAdjustment("set", ab, v)}
                />
                <AdjustRow
                  label="Other Modifier"
                  value={adj.other[ab]}
                  onChange={(v) => setAbilityAdjustment("other", ab, v)}
                />
                <AdjustRow
                  label="Override Score"
                  value={adj.override[ab]}
                  onChange={(v) => setAbilityAdjustment("override", ab, v)}
                />
              </dl>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** An editable adjustment row; an empty input clears the adjustment. */
function AdjustRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-1">
      <dt className="text-xs text-ink/60">{label}</dt>
      <dd>
        <input
          type="number"
          value={value ?? ""}
          placeholder="—"
          onChange={(e) =>
            onChange(e.target.value === "" ? undefined : Number(e.target.value))
          }
          className="w-16 rounded border border-ink/20 bg-white px-1 py-0.5 text-right text-xs tabular-nums"
        />
      </dd>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string | number; strong?: boolean }) {
  return (
    <div className={`flex justify-between px-3 py-1.5 ${strong ? "bg-blood/5 font-semibold" : ""}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
