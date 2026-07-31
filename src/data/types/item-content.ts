import type { Entry } from "./common";

/**
 * 5eTools `item` / `baseitem` (partial). `type` encodes armor/weapon categories:
 * LA = light armor, MA = medium, HA = heavy, S = shield, M = melee weapon,
 * R = ranged weapon (often suffixed with a source like "M|XPHB").
 */
export interface Item {
  name: string;
  source: string;
  type?: string;
  /** Armor class granted (for armor) or shield bonus base. */
  ac?: number;
  /** Max Dex bonus this armor allows (medium armor caps at 2 by default). */
  dexterityMax?: number;
  armor?: boolean;
  weapon?: boolean;
  weaponCategory?: string;
  dmg1?: string;
  dmgType?: string;
  range?: string;
  properties?: unknown[];
  value?: number;
  /** Weight in pounds. */
  weight?: number;
  /** Magic AC bonus while equipped — a number or a "+1" string. */
  bonusAc?: number | string;
  /** Requires attunement (true, or a string like "by a wizard"). */
  reqAttune?: boolean | string;
  /** Weapon mastery properties (2024), e.g. `["Sap|XPHB"]`. */
  mastery?: unknown[];
  /** Magic-item charges (spendable; restored on a long rest here). */
  charges?: number;
  recharge?: string;
  /** Container info; `weightless` contents don't count toward carry weight. */
  containerCapacity?: { weight?: number[]; weightless?: boolean };
  /** Ability effects, e.g. `{ static: { int: 19 } }` set-score items. */
  ability?: unknown;
  entries?: Entry[];
}

/** The leading letter of an item `type`, e.g. "M|XPHB" -> "M". */
export function itemTypeCode(type?: string): string | undefined {
  return type?.split("|")[0];
}
