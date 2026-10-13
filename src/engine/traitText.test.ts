import { describe, expect, it } from "vitest";
import { traitNotes } from "./traitText";

describe("traitNotes", () => {
  it("reads Fey-Ancestry-style save advantage and sleep immunity from trait prose", () => {
    const notes = traitNotes([
      {
        name: "Fey Ancestry",
        entries: ["You have advantage on saving throws against being {@condition charmed}, and magic can't put you to sleep."],
      },
    ]);
    expect(notes).toEqual({ saveNotes: ["Advantage against being charmed"], immunities: ["magical sleep"] });
  });

  it("handles the 2024 wording and ignores unrelated text", () => {
    const notes = traitNotes([
      "You have {@variantrule Advantage|XPHB} on saving throws you make to avoid or end the {@condition Charmed|XPHB} condition.",
      "You can see in dim light within 60 feet of you.",
    ]);
    expect(notes).toEqual({
      saveNotes: ["Advantage on saves you make to avoid or end the Charmed condition"],
      immunities: [],
    });
  });
});
