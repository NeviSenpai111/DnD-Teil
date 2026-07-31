import { describe, expect, it } from "vitest";
import {
  formatCastingTime,
  formatComponents,
  formatDuration,
  formatRange,
  levelSchoolLine,
} from "./spellDisplay";

describe("spellDisplay formatters (real 5eTools shapes)", () => {
  it("formats casting times, including bonus actions and reaction conditions", () => {
    expect(formatCastingTime([{ number: 1, unit: "action" }])).toBe("1 action");
    expect(formatCastingTime([{ number: 1, unit: "bonus" }])).toBe("1 bonus action");
    expect(formatCastingTime([{ number: 10, unit: "minute" }])).toBe("10 minutes");
    expect(
      formatCastingTime([
        { number: 1, unit: "reaction", condition: "which you take when you are damaged" },
      ]),
    ).toBe("1 reaction, which you take when you are damaged");
    expect(formatCastingTime(undefined)).toBeUndefined();
  });

  it("formats point ranges and self-shapes", () => {
    expect(formatRange({ type: "point", distance: { type: "feet", amount: 60 } })).toBe("60 feet");
    expect(formatRange({ type: "point", distance: { type: "self" } })).toBe("Self");
    expect(formatRange({ type: "point", distance: { type: "touch" } })).toBe("Touch");
    expect(formatRange({ type: "cone", distance: { type: "feet", amount: 30 } })).toBe(
      "Self (30-foot cone)",
    );
    expect(formatRange({ type: "point", distance: { type: "miles", amount: 1 } })).toBe("1 mile");
    expect(formatRange({ type: "special" })).toBe("Special");
  });

  it("formats components with material text", () => {
    expect(formatComponents({ v: true, s: true })).toBe("V, S");
    expect(formatComponents({ v: true, m: "a pinch of dust" })).toBe("V, M (a pinch of dust)");
    expect(formatComponents({ m: { text: "a diamond worth 300 gp", cost: 30000 } })).toBe(
      "M (a diamond worth 300 gp)",
    );
    expect(formatComponents(undefined)).toBeUndefined();
  });

  it("formats durations including concentration and permanent-until-dispelled", () => {
    expect(formatDuration([{ type: "instant" }])).toBe("Instantaneous");
    expect(
      formatDuration([
        { type: "timed", duration: { type: "minute", amount: 10 }, concentration: true },
      ]),
    ).toBe("Concentration, up to 10 minutes");
    expect(formatDuration([{ type: "timed", duration: { type: "hour", amount: 1 } }])).toBe(
      "1 hour",
    );
    expect(formatDuration([{ type: "permanent", ends: ["dispel", "trigger"] }])).toBe(
      "Until dispelled or triggered",
    );
  });

  it("builds the level · school line", () => {
    expect(levelSchoolLine({ name: "X", source: "S", level: 0, school: "V" })).toBe(
      "Cantrip · Evocation",
    );
    expect(levelSchoolLine({ name: "X", source: "S", level: 3, school: "N" })).toBe(
      "Level 3 · Necromancy",
    );
    expect(levelSchoolLine({ name: "X", source: "S", level: 2 })).toBe("Level 2");
  });
});
