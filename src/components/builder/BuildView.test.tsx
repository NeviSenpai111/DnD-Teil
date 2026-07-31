import { readFileSync } from "node:fs";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it } from "vitest";
import { useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import { BuildView } from "./BuildView";

/**
 * Smoke test for the D&D-Beyond-style builder: with sample content loaded,
 * every page (Home, Class, Background, Species, Abilities, Equipment, What's
 * Next) must mount without crashing and show its key interactions.
 */
describe("BuildView (DDB-style pages)", () => {
  beforeAll(() => {
    const text = readFileSync("public/sample-data/srd-lite.json", "utf8");
    useContentStore.getState().importTexts([{ name: "srd-lite.json", text }]);
    useCharacterStore.getState().newDraft();
  });

  function open() {
    return render(
      <MemoryRouter>
        <BuildView />
      </MemoryRouter>,
    );
  }

  it("renders the tab bar, name header and Home page", () => {
    open();
    expect(screen.getByText("1. Class")).toBeInTheDocument();
    expect(screen.getByText("What's Next ▸")).toBeInTheDocument();
    expect(screen.getByText("Character Name")).toBeInTheDocument();
    expect(screen.getByText("Rules edition")).toBeInTheDocument();
  });

  it("walks the class page: pick a class, see feature accordions and spells tab", () => {
    open();
    fireEvent.click(screen.getByText("1. Class"));
    expect(screen.getByText("Choose a Class")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Channeler")); // caster from srd-lite
    expect(screen.getByText(/Character Level:/)).toBeInTheDocument();
    expect(screen.getByText("Hit Points")).toBeInTheDocument();
    expect(screen.getByText("Proficiencies")).toBeInTheDocument();

    fireEvent.click(screen.getByText(/^Spells/)); // sub-tab
    expect(screen.getByText(/Cantrips \(/)).toBeInTheDocument();
  });

  it("multiclasses via + Add Another Class and shows both class sections", () => {
    // Warden requires Str 13 to multiclass into (prerequisite validation).
    useCharacterStore.getState().setBaseAbility("str", 13);
    open();
    fireEvent.click(screen.getByText("1. Class"));

    fireEvent.click(screen.getByText("+ Add Another Class"));
    fireEvent.click(screen.getByText("Warden")); // martial from srd-lite
    expect(useCharacterStore.getState().draft.classes.map((c) => c.name)).toEqual([
      "Channeler",
      "Warden",
    ]);
    // Both class headers render, and total level sums both classes.
    expect(screen.getByText("Channeler")).toBeInTheDocument();
    expect(screen.getByText("Warden")).toBeInTheDocument();
    expect(screen.getByText("Character Level: 2")).toBeInTheDocument();
  });

  it("renders Background, Species, Abilities, Equipment and What's Next", () => {
    open();
    fireEvent.click(screen.getByText("2. Background"));
    expect(screen.getByText("Choose Origin: Background")).toBeInTheDocument();
    expect(screen.getByText("Character Details")).toBeInTheDocument();

    fireEvent.click(screen.getByText("3. Race")); // classic edition label
    expect(screen.getByText(/Choose Origin: Race|Change Race/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("4. Abilities"));
    expect(screen.getByText("Score Calculations")).toBeInTheDocument();
    expect(screen.getByText("Points Remaining")).toBeInTheDocument();

    fireEvent.click(screen.getByText("5. Equipment"));
    expect(screen.getByText("Choose Equipment")).toBeInTheDocument();
    expect(screen.getByText(/Current Inventory/)).toBeInTheDocument();
    expect(screen.getByText(/Total Weight:/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("What's Next ▸"));
    expect(screen.getByText("What's Next")).toBeInTheDocument();
    expect(screen.getByText("Save to Library")).toBeInTheDocument();
  });
});
