/** The five 5e coin denominations and their gp conversion. */

export const COINS = ["cp", "sp", "ep", "gp", "pp"] as const;
export type Coin = (typeof COINS)[number];
export type Currency = Record<Coin, number>;

export const COIN_IN_GP: Record<Coin, number> = {
  cp: 0.01,
  sp: 0.1,
  ep: 0.5,
  gp: 1,
  pp: 10,
};

export function emptyCurrency(): Currency {
  return { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
}

/** Total purse value expressed in gold pieces. */
export function currencyInGp(currency: Currency): number {
  return COINS.reduce((sum, coin) => sum + (currency[coin] || 0) * COIN_IN_GP[coin], 0);
}

/** Carrying capacity: Strength score × 15 lb. */
export function carryingCapacity(strScore: number): number {
  return strScore * 15;
}

/**
 * Encumbrance state for the carried weight. "ok" under the variant's Str×5
 * threshold, then "encumbered" (speed −10 under the variant rule),
 * "heavily-encumbered" over Str×10 (speed −20), and "over-capacity" past the
 * Str×15 hard limit.
 */
export type Encumbrance = "ok" | "encumbered" | "heavily-encumbered" | "over-capacity";

export function encumbrance(weight: number, strScore: number): Encumbrance {
  if (weight > strScore * 15) return "over-capacity";
  if (weight > strScore * 10) return "heavily-encumbered";
  if (weight > strScore * 5) return "encumbered";
  return "ok";
}
