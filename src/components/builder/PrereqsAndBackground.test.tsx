import { readFileSync } from "node:fs";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import { deriveFromCharacter } from "../../store/selectors";
import { BuildView } from "./BuildView";

/**
 * The remaining builder leaf features: multiclass/feat prerequisite gating,
 * Weapon Mastery picks, the custom background, its tool/language pickers, and
 * the 2014-style characteristics tables.
 */
describe("prerequisites, mastery and background extras", () => {
  beforeAll(() => {
    const text = readFileSync("public/sample-data/srd-lite.json", "utf8");
    useContentStore.getState().importTexts([{ name: "srd-lite.json", text }]);
  });

  beforeEach(() => useCharacterStore.getState().newDraft());
  afterEach(() => vi.restoreAllMocks());

  function open(tab: string) {
    render(
      <MemoryRouter>
        <BuildView />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText(tab));
  }

  it("blocks multiclassing into a class whose ability prerequisite is unmet", () => {
    useCharacterStore.getState().setClass({ name: "Channeler", source: "SRDLite" });
    open("1. Class");

    fireEvent.click(screen.getByText("+ Add Another Class"));
    fireEvent.click(screen.getByText("Warden"));
    expect(screen.getByText("Warden requires Strength 13 to multiclass into.")).toBeInTheDocument();
    expect(useCharacterStore.getState().draft.classes).toHaveLength(1);

    // Meeting the requirement lets the class through (fresh render).
    useCharacterStore.getState().setBaseAbility("str", 13);
    cleanup();
    open("1. Class");
    fireEvent.click(screen.getByText("+ Add Another Class"));
    fireEvent.click(screen.getByText("Warden"));
    expect(useCharacterStore.getState().draft.classes.map((c) => c.name)).toEqual([
      "Channeler",
      "Warden",
    ]);
  });

  it("disables feats whose prerequisites are unmet in the ASI slot", () => {
    const store = useCharacterStore.getState();
    store.setClass({ name: "Warden", source: "SRDLite" });
    store.setClassLevel(0, 4);
    open("1. Class");

    fireEvent.click(screen.getByText("Feat"));
    const option = screen.getByRole("option", {
      name: "Stalwart Guard (requires Strength 13)",
    }) as HTMLOptionElement;
    expect(option.disabled).toBe(true);

    // Raising Strength requalifies the feat (fresh render; the ASI accordion
    // starts collapsed once a choice exists).
    useCharacterStore.getState().setBaseAbility("str", 13);
    cleanup();
    open("1. Class");
    fireEvent.click(screen.getByText("Ability Score Improvement"));
    expect(
      (screen.getByRole("option", { name: "Stalwart Guard" }) as HTMLOptionElement).disabled,
    ).toBe(false);
  });

  it("offers Weapon Mastery picks from mastery-property weapons", () => {
    useCharacterStore.getState().setClass({ name: "Warden", source: "SRDLite" });
    open("1. Class");

    expect(screen.getByText("Weapon Mastery")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Master Longsword"));
    fireEvent.click(screen.getByLabelText("Master Shortbow"));
    expect(useCharacterStore.getState().draft.weaponMasteries).toEqual(["Longsword", "Shortbow"]);
  });

  it("offers a feat's language choices in its ASI slot and derives them", () => {
    const store = useCharacterStore.getState();
    store.setClass({ name: "Warden", source: "SRDLite" });
    store.setClassLevel(0, 4);
    store.setAsi(0, { type: "feat", ref: { name: "Polyglot Scholar", source: "SRDLite" } });
    open("1. Class");
    fireEvent.click(screen.getByText("Ability Score Improvement"));

    fireEvent.change(screen.getByLabelText("Polyglot Scholar language 1"), {
      target: { value: "Elvish" },
    });
    const draft = useCharacterStore.getState().draft;
    expect(draft.languageChoices["feat:asifeat:0:lang:0:anyStandard"]).toEqual(["Elvish"]);
    const derived = deriveFromCharacter(draft, useContentStore.getState().index);
    expect(derived.proficiencies.languages.fixed).toContain("Elvish");
  });

  it("builds a custom background with tool and language picks that derive", () => {
    open("2. Background");
    fireEvent.click(screen.getByText("Build a custom background"));

    // The synthesized background surfaces the standard pickers.
    fireEvent.change(screen.getByLabelText("Custom Background tool 1"), {
      target: { value: "Smith's Tools" },
    });
    fireEvent.change(screen.getByLabelText("Custom Background language 1"), {
      target: { value: "Dwarvish" },
    });

    const draft = useCharacterStore.getState().draft;
    expect(draft.customBackground).toBeTruthy();
    const derived = deriveFromCharacter(draft, useContentStore.getState().index);
    expect(derived.proficiencies.tools.fixed).toContain("Smith's Tools");
    expect(derived.proficiencies.languages.fixed).toContain("Dwarvish");
  });

  it("rolls and picks 2014-style characteristics into the details", () => {
    useCharacterStore.getState().setBackground({ name: "Veteran Guard", source: "SRDLite" });
    open("2. Background");

    fireEvent.click(screen.getByText("Suggested Characteristics"));
    vi.spyOn(Math, "random").mockReturnValue(0); // roll -> first row
    fireEvent.click(screen.getByText("🎲 Roll Personality Trait"));
    expect(useCharacterStore.getState().draft.details.personalityTraits).toBe(
      "I always have a plan for when things go wrong.",
    );

    // Clicking a picker row picks it directly (the raw table also renders in
    // the background's description, so target the picker buttons by title).
    const rows = screen.getAllByTitle("Use as your personality trait");
    fireEvent.click(rows[3]);
    expect(useCharacterStore.getState().draft.details.personalityTraits).toBe(
      "I judge people by their deeds, not their words.",
    );
  });
});
