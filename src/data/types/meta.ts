import type { MetaSource } from "./common";

/** Rules edition. `classic` = 2014, `one` = 2024. Gates edition-specific logic. */
export type Edition = "classic" | "one";

export interface Meta {
  sources?: MetaSource[];
  edition?: Edition;
  dateAdded?: number;
  [key: string]: unknown;
}
