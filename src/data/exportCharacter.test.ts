import { describe, expect, it } from "vitest";
import { createCharacter } from "../model/character";
import { characterToJson } from "./exportCharacter";

describe("characterToJson", () => {
  it("produces JSON that round-trips back to the character", () => {
    const c = createCharacter({
      name: "Round Trip",
      race: { name: "Sturdyfolk", source: "SRDLite" },
      classes: [{ name: "Warden", source: "SRDLite", level: 3 }],
      baseAbilities: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
    });
    const parsed = JSON.parse(characterToJson(c));
    expect(parsed).toEqual(c);
    expect(parsed.classes[0].level).toBe(3);
  });
});
