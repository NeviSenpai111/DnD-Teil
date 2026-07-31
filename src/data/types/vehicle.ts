import type { Entry } from "./common";

/** An action available on a vehicle weapon (e.g. "Antimatter Shots"). */
export interface VehicleWeaponAction {
  name?: string;
  entries: Entry[];
}

/** A mounted weapon on a vehicle (cannon, mangonel, ...). */
export interface VehicleWeapon {
  name: string;
  crew?: number;
  count?: number;
  ac?: number;
  hp?: number;
  costs?: { cost?: number; note?: string }[];
  entries?: Entry[];
  action?: VehicleWeaponAction[];
}

export interface VehicleHull {
  ac?: number;
  acFrom?: string[];
  hp?: number;
  /** Damage threshold. */
  dt?: number;
}

/**
 * 5eTools `vehicle`. Modeled from the Space Galleon sample; many official
 * vehicle fields (control, movement, ...) are not present in the sample and are
 * left out until we have data exercising them.
 */
export interface Vehicle {
  name: string;
  source: string;
  vehicleType?: string;
  dimensions?: string[];
  terrain?: string[];
  capCrew?: number;
  capCargo?: number;
  cost?: number;
  pace?: number;
  speed?: number;
  hull?: VehicleHull;
  weapon?: VehicleWeapon[];
  entries?: Entry[];
}
