import { describe, expect, it } from "vitest";
import { armorClass } from "./armor";

describe("armorClass", () => {
  it("unarmored is 10 + Dex", () => {
    expect(armorClass({ dexMod: 3 })).toBe(13);
  });
  it("light armor adds full Dex", () => {
    expect(armorClass({ dexMod: 3, armor: { ac: 11, category: "LA" } })).toBe(14);
  });
  it("medium armor caps Dex at 2", () => {
    expect(armorClass({ dexMod: 3, armor: { ac: 14, category: "MA" } })).toBe(16);
    expect(armorClass({ dexMod: 1, armor: { ac: 14, category: "MA" } })).toBe(15);
  });
  it("heavy armor ignores Dex", () => {
    expect(armorClass({ dexMod: 3, armor: { ac: 18, category: "HA" } })).toBe(18);
  });
  it("adds a shield and misc bonus", () => {
    expect(armorClass({ dexMod: 2, armor: { ac: 11, category: "LA" }, shield: true, bonus: 1 })).toBe(16);
  });
});
