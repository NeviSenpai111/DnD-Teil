import type { Vehicle, VehicleWeapon } from "../../data/types";
import { Entries } from "../../data/entryRenderer/EntryRenderer";

/** Renders a 5eTools vehicle as a statblock card, including mounted weapons. */
export function VehicleStatblock({ vehicle }: { vehicle: Vehicle }) {
  const { hull } = vehicle;
  return (
    <article className="mx-auto max-w-2xl rounded border border-blood/30 bg-parchment p-5 shadow">
      <header>
        <h2 className="text-2xl font-bold text-blood">{vehicle.name}</h2>
        <p className="text-sm italic text-ink/70">
          {[vehicle.vehicleType, vehicle.dimensions?.join(" × ")].filter(Boolean).join(", ")}
        </p>
        <p className="text-xs uppercase tracking-wide text-ink/50">{vehicle.source}</p>
      </header>

      <div className="statblock-rule my-3" />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        <Stat label="Speed" value={vehicle.speed != null ? `${vehicle.speed} ft.` : undefined} />
        <Stat label="Pace" value={vehicle.pace != null ? `${vehicle.pace} mph` : undefined} />
        <Stat label="Crew" value={vehicle.capCrew} />
        <Stat label="Cargo" value={vehicle.capCargo != null ? `${vehicle.capCargo} tons` : undefined} />
        <Stat label="Cost" value={formatGp(vehicle.cost)} />
        <Stat label="Terrain" value={vehicle.terrain?.join(", ")} />
      </dl>

      {hull && (
        <>
          <div className="statblock-rule my-3" />
          <dl className="grid grid-cols-3 gap-x-4 text-sm">
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
        <div className="mt-3 text-sm">
          <Entries entries={vehicle.entries} />
        </div>
      )}

      {vehicle.weapon && vehicle.weapon.length > 0 && (
        <section className="mt-4 space-y-3">
          <div className="statblock-rule" />
          <h3 className="text-lg font-bold text-blood">Weapons</h3>
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
    <div className="rounded border border-blood/20 bg-white/40 p-3">
      <h4 className="font-bold text-blood">{weapon.name}</h4>
      {meta.length > 0 && <p className="text-xs text-ink/60">{meta.join(" · ")}</p>}
      {weapon.entries && weapon.entries.length > 0 && (
        <div className="mt-1 text-sm">
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
    <div>
      <dt className="inline font-semibold">{label}:</dt> <dd className="inline">{value}</dd>
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
