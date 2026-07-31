import { readFileSync } from "node:fs";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import { deriveFromCharacter } from "../../store/selectors";
import { BuildView } from "./BuildView";

/**
 * Species-level choices from srd-lite: the Swiftling's `additionalSpells`
 * (a fixed innate cantrip + one cantrip pick) and the Sturdyfolk's
 * "any standard language" grant must surface pickers on the species page.
 */
describe("species spell and language choices", () => {
  beforeAll(() => {
    const text = readFileSync("public/sample-data/srd-lite.json", "utf8");
    useContentStore.getState().importTexts([{ name: "srd-lite.json", text }]);
  });

  beforeEach(() => useCharacterStore.getState().newDraft());

  function openSpeciesPage() {
    render(
      <MemoryRouter>
        <BuildView />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("3. Race"));
  }

  it("offers the Swiftling's innate spell grant and cantrip pick", () => {
    useCharacterStore.getState().setRace({ name: "Swiftling", source: "SRDLite" });
    openSpeciesPage();

    expect(screen.getByText("Swiftling Spells")).toBeInTheDocument();
    // Fixed innate grant is listed…
    expect(screen.getByText("Grants:").parentElement?.textContent).toMatch(/mage light/i);
    // …and the cantrip choice is a dropdown.
    fireEvent.change(screen.getByDisplayValue("— Choose a Spell —"), {
      target: { value: "Spark Touch|SRDLite" },
    });
    expect(useCharacterStore.getState().draft.featSpells["racespell:race:spell:0"]).toEqual([
      { name: "Spark Touch", source: "SRDLite" },
    ]);
  });

  it("offers the Sturdyfolk's standard-language pick and derives it", () => {
    useCharacterStore.getState().setRace({ name: "Sturdyfolk", source: "SRDLite" });
    openSpeciesPage();

    fireEvent.change(screen.getByLabelText("Sturdyfolk language 1"), {
      target: { value: "Dwarvish" },
    });
    const draft = useCharacterStore.getState().draft;
    expect(draft.languageChoices["race:lang:0:anyStandard"]).toEqual(["Dwarvish"]);

    const languages = deriveFromCharacter(draft, useContentStore.getState().index).proficiencies
      .languages.fixed;
    expect(languages).toContain("Common");
    expect(languages).toContain("Dwarvish");
  });

  it("clears species picks when the race changes", () => {
    const store = useCharacterStore.getState();
    store.setRace({ name: "Sturdyfolk", source: "SRDLite" });
    store.setLanguageChoice("race:lang:0:anyStandard", ["Dwarvish"]);
    store.setRace({ name: "Swiftling", source: "SRDLite" });
    expect(useCharacterStore.getState().draft.languageChoices).toEqual({});
  });
});
