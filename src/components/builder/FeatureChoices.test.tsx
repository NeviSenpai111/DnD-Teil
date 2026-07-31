import { readFileSync } from "node:fs";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import { deriveFromCharacter } from "../../store/selectors";
import { BuildView } from "./BuildView";

/**
 * Choice-driven class features: the Warden's "Warden Stance" progression
 * (srd-lite) must surface an interactive picker limited to the class's count
 * and gated by level prerequisites, and its Expertise feature must offer skill
 * picks that double proficiency.
 */
describe("class feature choice prompts", () => {
  beforeAll(() => {
    const text = readFileSync("public/sample-data/srd-lite.json", "utf8");
    useContentStore.getState().importTexts([{ name: "srd-lite.json", text }]);
  });

  beforeEach(() => {
    useCharacterStore.getState().newDraft();
    useCharacterStore.getState().setClass({ name: "Warden", source: "SRDLite" });
  });

  function openClassPage() {
    const view = render(
      <MemoryRouter>
        <BuildView />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("1. Class"));
    return view;
  }

  it("picks a Warden Stance, enforcing the count and the level prerequisite", () => {
    openClassPage();

    // The progression renders as an interactive accordion, open by default.
    expect(screen.getByText("Warden Stance")).toBeInTheDocument();
    expect(screen.getByText("Chosen 0 / 1")).toBeInTheDocument();

    // Emberwatch requires level 5 — locked at level 1.
    expect(screen.getByText("Requires level 5")).toBeInTheDocument();
    expect(screen.getByLabelText("Emberwatch Stance")).toBeDisabled();

    fireEvent.click(screen.getByLabelText("Stalwart Stance"));
    expect(useCharacterStore.getState().draft.optionalFeatures["optfeature:0:c:0"]).toEqual([
      { name: "Stalwart Stance", source: "SRDLite" },
    ]);

    // At the limit, the other legal option is disabled until a pick is freed.
    expect(screen.getByText("Chosen 1 / 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Riverflow Stance")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Stalwart Stance"));
    expect(useCharacterStore.getState().draft.optionalFeatures["optfeature:0:c:0"]).toEqual([]);
  });

  it("unlocks the second stance and the prerequisite option at level 5", () => {
    useCharacterStore.getState().setClassLevel(0, 5);
    openClassPage();

    // Both the stance progression and Weapon Mastery offer 2 picks now.
    expect(screen.getAllByText("Chosen 0 / 2")).toHaveLength(2);
    expect(screen.getByLabelText("Emberwatch Stance")).toBeEnabled();
  });

  it("explains which file to import when a progression's options are missing", () => {
    // A class declaring Artificer-Infusion-style choices with no matching
    // optionalfeature entities imported (they live in optionalfeature.json).
    useContentStore.getState().importTexts([
      {
        name: "tinkerer.json",
        text: JSON.stringify({
          _meta: { sources: [{ json: "TESTY", full: "Test Tinkerer" }] },
          class: [
            {
              name: "Tinkerer",
              source: "TESTY",
              hd: { number: 1, faces: 8 },
              optionalfeatureProgression: [
                { name: "Infusions", featureType: ["AI"], progression: { "2": 4 } },
              ],
            },
          ],
        }),
      },
    ]);
    useCharacterStore.getState().setClass({ name: "Tinkerer", source: "TESTY" });
    useCharacterStore.getState().setClassLevel(0, 2);
    openClassPage();

    expect(screen.getByText(/Artificer Infusion \("AI"\)/)).toBeInTheDocument();
    expect(screen.getByText(/optionalfeature\.json/)).toBeInTheDocument();
  });

  it("offers expertise picks from proficient skills and doubles their bonus", () => {
    // Class skill picks first — expertise chooses among proficiencies.
    useCharacterStore.getState().setSkillChoice("class:skill:0", ["athletics", "perception"]);
    openClassPage();

    expect(screen.getByText("Expertise")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Expertise skill 1"), {
      target: { value: "athletics" },
    });

    const draft = useCharacterStore.getState().draft;
    expect(draft.expertiseChoices["expertise:0:1"]).toEqual(["athletics"]);

    const derived = deriveFromCharacter(draft, useContentStore.getState().index);
    expect(derived.skills.athletics.expertise).toBe(true);
    // PB 2 doubled: mod = str 0 + 4 (all base 8 -> str mod -1... use delta vs perception)
    expect(derived.skills.athletics.mod - derived.mods.str).toBe(4);
    expect(derived.skills.perception.mod - derived.mods.wis).toBe(2);
  });
});
