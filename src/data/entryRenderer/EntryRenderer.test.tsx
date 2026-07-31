import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Entries } from "./EntryRenderer";
import type { Entry } from "../types/common";

describe("EntryRenderer", () => {
  it("renders an `item` entry as a bold lead-in plus its text (no 'unsupported' note)", () => {
    const entries: Entry[] = [
      { type: "item", name: "Equipment:", entry: "A holy symbol and a prayer book." },
    ];
    render(<Entries entries={entries} />);
    expect(screen.getByText("Equipment:")).toBeInTheDocument();
    expect(screen.getByText(/holy symbol and a prayer book/)).toBeInTheDocument();
    expect(screen.queryByText(/Unsupported entry type/)).not.toBeInTheDocument();
  });

  it("renders nested `entries` inside an `item`", () => {
    const entries: Entry[] = [
      { type: "item", name: "Feature:", entries: ["First clause.", "Second clause."] },
    ];
    render(<Entries entries={entries} />);
    expect(screen.getByText("Feature:")).toBeInTheDocument();
    expect(screen.getByText("First clause.")).toBeInTheDocument();
    expect(screen.getByText("Second clause.")).toBeInTheDocument();
  });

  it("renders feature refs as named pointers, not 'unsupported' notes", () => {
    const entries: Entry[] = [
      {
        type: "refSubclassFeature",
        subclassFeature: "Tools of the Trade|Artificer|EFA|Alchemist|EFA|3|EFA",
      } as unknown as Entry,
      { type: "refClassFeature", classFeature: "Infusions Known|Artificer|TCE|2" } as unknown as Entry,
      { type: "refOptionalfeature", optionalfeature: "Repeating Shot|TCE" } as unknown as Entry,
    ];
    render(<Entries entries={entries} />);
    expect(screen.getByText("Tools of the Trade")).toBeInTheDocument();
    expect(screen.getByText("· level 3")).toBeInTheDocument();
    expect(screen.getByText("Infusions Known")).toBeInTheDocument();
    expect(screen.getByText("· level 2")).toBeInTheDocument();
    expect(screen.getByText("Repeating Shot")).toBeInTheDocument();
    expect(screen.queryByText(/Unsupported entry type/)).not.toBeInTheDocument();
  });

  it("renders spellcasting formulas, options wrappers and roll cells", () => {
    const entries: Entry[] = [
      { type: "abilityDc", name: "Spell", attributes: ["int"] } as unknown as Entry,
      { type: "abilityAttackMod", name: "Spell", attributes: ["wis", "cha"] } as unknown as Entry,
      {
        type: "options",
        count: 2,
        entries: [{ type: "refSubclassFeature", subclassFeature: "Bear|Barbarian||Totem Warrior||3" }],
      } as unknown as Entry,
      { type: "refFeat", feat: "Blessed Warrior|XPHB" } as unknown as Entry,
      { type: "statblock", tag: "item", name: "Psychic Blade", source: "XPHB" } as unknown as Entry,
      {
        type: "table",
        colLabels: ["d10", "Effect"],
        rows: [[{ type: "cell", roll: { min: 1, max: 5, pad: true } }, "Something happens."]],
      } as unknown as Entry,
    ];
    render(<Entries entries={entries} />);
    expect(screen.getByText("Spell save DC")).toBeInTheDocument();
    expect(screen.getByText(/8 \+ your proficiency bonus \+ your Intelligence modifier/)).toBeInTheDocument();
    expect(screen.getByText("Spell attack modifier")).toBeInTheDocument();
    expect(screen.getByText(/your Wisdom or Charisma modifier/)).toBeInTheDocument();
    expect(screen.getByText("Choose 2:")).toBeInTheDocument();
    expect(screen.getByText("Bear")).toBeInTheDocument();
    expect(screen.getByText("Blessed Warrior")).toBeInTheDocument();
    expect(screen.getByText("Psychic Blade")).toBeInTheDocument();
    expect(screen.getByText("01–05")).toBeInTheDocument();
    expect(screen.queryByText(/Unsupported entry type/)).not.toBeInTheDocument();
  });
});
