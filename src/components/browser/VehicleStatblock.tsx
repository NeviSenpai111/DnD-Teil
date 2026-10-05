import type { Vehicle, VehicleWeapon } from "../../data/types";
import { Entries } from "../../data/entryRenderer/EntryRenderer";

/** Renders a 5eTools vehicle as a statblock card, including mounted weapons. */
export function VehicleStatblock({ vehicle }: { vehicle: Vehicle }) {
  const { hull } = vehicle;
  return (
    <article className="detail">
      <header className="detail-head">
        <h2 className="detail-title">{vehicle.name}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {[vehicle.vehicleType, vehicle.dimensions?.join(" × ")].filter(Boolean).join(", ")}
        </p>
        <p className="eyebrow mt-2">{vehicle.source}</p>
      </header>

      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
        <Stat label="Speed" value={vehicle.speed != null ? `${vehicle.speed} ft.` : undefined} />
        <Stat label="Pace" value={vehicle.pace != null ? `${vehicle.pace} mph` : undefined} />
        <Stat label="Crew" value={vehicle.capCrew} />
        <Stat label="Cargo" value={vehicle.capCargo != null ? `${vehicle.capCargo} tons` : undefined} />
        <Stat label="Cost" value={formatGp(vehicle.cost)} />
        <Stat label="Terrain" value={vehicle.terrain?.join(", ")} />
      </dl>

      {hull && (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
            <Stat
              label="Hull AC"
              value={hull.ac != null ? `${hull.ac}${hull.acFrom ? ` (${hull.acFrom.join(", ")})` : ""}` : undefined}
            />
            <Stat label="Hull HP" value={hull.hp} />
            <Stat label="Damage Threshold" value={hull.dt} />
          </dl>
        </>
      )}

      {vehicle.entries && vehicle.entries.length > 0 && (
        <div className="prose-rules mt-5">
          <Entries entries={vehicle.entries} />
        </div>
      )}

      {vehicle.weapon && vehicle.weapon.length > 0 && (
        <section className="mt-6 space-y-3 border-t border-line pt-5">
          <h3 className="eyebrow">Weapons</h3>
          {vehicle.weapon.map((w, i) => (
            <WeaponBlock key={`${w.name}-${i}`} weapon={w} />
          ))}
        </section>
      )}
    </article>
  );
}

function WeaponBlock({ weapon }: { weapon: VehicleWeapon }) {
  const meta = [
    weapon.count && weapon.count > 1 ? `${weapon.count}×` : null,
    weapon.crew != null ? `Crew ${weapon.crew}` : null,
    weapon.ac != null ? `AC ${weapon.ac}` : null,
    weapon.hp != null ? `HP ${weapon.hp}` : null,
    formatCosts(weapon.costs),
  ].filter(Boolean);

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <h4 className="font-semibold tracking-tight text-ink">{weapon.name}</h4>
      {meta.length > 0 && <p className="mt-0.5 font-mono text-2xs text-ink-muted">{meta.join(" · ")}</p>}
      {weapon.entries && weapon.entries.length > 0 && (
        <div className="prose-rules mt-2">
          <Entries entries={weapon.entries} />
        </div>
      )}
      {weapon.action?.map((action, i) => (
        <div key={`${action.name}-${i}`} className="mt-2 text-sm">
          {action.name && <span className="font-semibold italic">{action.name}. </span>}
          <Entries entries={action.entries} />
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: string | number }) {
  if (value == null || value === "") return null;
  return (
    <div className="bg-surface px-3 py-2.5">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm text-ink">{value}</dd>
    </div>
  );
}

function formatGp(n?: number): string | undefined {
  return n == null ? undefined : `${n.toLocaleString("en-US")} gp`;
}

function formatCosts(costs?: { cost?: number; note?: string }[]): string | null {
  if (!costs || costs.length === 0) return null;
  return costs
    .map((c) => [c.cost != null ? formatGp(c.cost) : null, c.note].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(", ");
}
