import { readFileSync } from "node:fs";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import { SheetView } from "./SheetView";

/**
 * The full sheet is interactive: items and spells can be added from search
 * menus, rows expand into detail cards, and edits persist through the store
 * (rendered via SheetView so the sheet re-renders on every change).
 */
describe("FullSheet interactivity", () => {
  beforeAll(() => {
    const text = readFileSync("public/sample-data/srd-lite.json", "utf8");
    // Extra spells to prove the add menu adheres to the class spell list:
    // one on another class's list, one on the Channeler list but above the
    // castable level at Channeler 1.
    const extra = JSON.stringify({
      _meta: { sources: [{ json: "TESTX", full: "Test Extra" }] },
      spell: [
        {
          name: "Forbidden Word",
          source: "TESTX",
          level: 1,
          school: "N",
          classes: { fromClassList: [{ name: "Necromancer", source: "TESTX" }] },
        },
        {
          name: "Channeler Nova",
          source: "TESTX",
          level: 3,
          school: "V",
          classes: { fromClassList: [{ name: "Channeler", source: "SRDLite" }] },
        },
      ],
    });
    useContentStore
      .getState()
      .importTexts([{ name: "srd-lite.json", text }, { name: "extra.json", text: extra }]);
  });

  beforeEach(() => {
    useCharacterStore.getState().newDraft();
    useCharacterStore.getState().setClass({ name: "Channeler", source: "SRDLite" });
  });

  function open() {
    return render(
      <MemoryRouter initialEntries={["/sheet/draft"]}>
        <Routes>
          <Route path="/sheet/:id" element={<SheetView />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("adds an item from the Inventory menu, shows its detail card, and removes it", () => {
    open();
    fireEvent.click(screen.getByText("Inventory"));

    fireEvent.click(screen.getByText("+ Add Item"));
    fireEvent.change(screen.getByPlaceholderText("Search items to add…"), {
      target: { value: "Longsword" },
    });
    fireEvent.click(screen.getByText("Longsword"));
    expect(useCharacterStore.getState().draft.inventory.map((i) => i.name)).toEqual(["Longsword"]);

    // Close the add menu, then expand the new row into its stat card.
    fireEvent.click(screen.getByText("Done"));
    fireEvent.click(screen.getByText("Longsword"));
    expect(screen.getByText("Damage:")).toBeInTheDocument();
    expect(screen.getByText("1d8 slashing")).toBeInTheDocument();
    expect(screen.getByText("15 gp")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Remove item"));
    expect(useCharacterStore.getState().draft.inventory).toHaveLength(0);
  });

  it("adds a spell from the Spells menu tagged with the caster class, expands it, removes it", () => {
    open();
    fireEvent.click(screen.getByText("Spells"));
    expect(screen.getByText(/Save DC/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("+ Add Spell"));
    fireEvent.change(screen.getByPlaceholderText("Search spells to add…"), {
      target: { value: "Arcane" },
    });
    fireEvent.click(screen.getByText("Arcane Bolt"));
    expect(useCharacterStore.getState().draft.spells).toEqual([
      { name: "Arcane Bolt", source: "SRDLite", forClass: "Channeler" },
    ]);

    fireEvent.click(screen.getByText("Done"));
    expect(screen.getByText("1st Level")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Arcane Bolt"));
    expect(screen.getByText("Casting Time:")).toBeInTheDocument();
    expect(screen.getByText("120 feet")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Remove spell"));
    expect(useCharacterStore.getState().draft.spells).toHaveLength(0);
  });

  it("filters the add-spell search to the caster's spell list and level", () => {
    open();
    fireEvent.click(screen.getByText("Spells"));
    fireEvent.click(screen.getByText("+ Add Spell"));

    const search = screen.getByPlaceholderText("Search spells to add…");
    // Off-list spell: in the pool, but not on the Channeler list.
    fireEvent.change(search, { target: { value: "Forbidden" } });
    expect(screen.getByText("No matches.")).toBeInTheDocument();
    // On-list but level 3 — a level-1 Channeler can't cast it yet.
    fireEvent.change(search, { target: { value: "Nova" } });
    expect(screen.getByText("No matches.")).toBeInTheDocument();
    // On-list and castable.
    fireEvent.change(search, { target: { value: "Frost" } });
    expect(screen.getByText("Frost Bite")).toBeInTheDocument();
  });

  it("offers no spell adding to a non-caster", () => {
    useCharacterStore.getState().setClass({ name: "Warden", source: "SRDLite" });
    open();
    fireEvent.click(screen.getByText("Spells"));
    expect(screen.getByText("Not a spellcaster.")).toBeInTheDocument();
    expect(screen.queryByText("+ Add Spell")).not.toBeInTheDocument();
  });

  it("levels up from the sheet header", () => {
    open();
    expect(screen.getByText("Level 1 · Channeler 1")).toBeInTheDocument();
    fireEvent.click(screen.getByText("▲ Level Up"));
    expect(useCharacterStore.getState().draft.classes[0].level).toBe(2);
    expect(screen.getByText("Level 2 · Channeler 2")).toBeInTheDocument();
  });

  it("tracks damage, temp HP absorption, healing and long rest", () => {
    open();
    // Channeler 1, d6, con 8 (−1) → 5 max HP.
    fireEvent.click(screen.getByLabelText("Hit Points"));
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Damage" }));
    expect(useCharacterStore.getState().draft.play.damageTaken).toBe(2);
    expect(screen.getByText("3/5")).toBeInTheDocument();

    // Temp HP absorbs before real damage.
    fireEvent.change(screen.getByLabelText("Temp HP"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Damage" }));
    expect(useCharacterStore.getState().draft.play).toMatchObject({ tempHp: 0, damageTaken: 3 });

    fireEvent.click(screen.getByText("Heal"));
    expect(useCharacterStore.getState().draft.play.damageTaken).toBe(1);

    fireEvent.click(screen.getByText("Long Rest"));
    expect(useCharacterStore.getState().draft.play.damageTaken).toBe(0);
    expect(screen.getByText("5/5")).toBeInTheDocument();
  });

  it("spends and restores spell slots via the pips", () => {
    open();
    fireEvent.click(screen.getByText("Spells"));
    // Channeler 1 (full caster) has two level-1 slots.
    fireEvent.click(screen.getByLabelText("L1 slot 2"));
    expect(useCharacterStore.getState().draft.play.usedSlots[0]).toBe(2);
    fireEvent.click(screen.getByLabelText("L1 slot 1"));
    expect(useCharacterStore.getState().draft.play.usedSlots[0]).toBe(0);
  });

  it("applies equipped item modifiers and shows species defenses and senses", () => {
    const store = useCharacterStore.getState();
    store.setRace({ name: "Sturdyfolk", source: "SRDLite" });
    store.addItem({ ref: { name: "Charm of Warding", source: "SRDLite" }, name: "Charm of Warding" });
    store.addItem({ ref: { name: "Circlet of Insight", source: "SRDLite" }, name: "Circlet of Insight" });
    store.toggleEquip(0);
    store.toggleEquip(1);
    open();

    // Species passives surface in the sidebar.
    expect(screen.getByText("Darkvision 60 ft.")).toBeInTheDocument();
    expect(screen.getByText("Resistances")).toBeInTheDocument();
    expect(screen.getByText("poison")).toBeInTheDocument();

    // Charm: dex 8 (−1) makes base AC 9; the equipped +1 charm raises it to 10.
    expect(screen.getByText("AC").parentElement?.textContent).toContain("10");
    // Circlet: INT floors at 19 (score badge on the Int ability card).
    expect(screen.getByText("19")).toBeInTheDocument();
  });

  it("shows chosen optional features on the Features & Traits tab", () => {
    const store = useCharacterStore.getState();
    store.setClass({ name: "Warden", source: "SRDLite" });
    store.setOptionalFeatures("optfeature:0:c:0", [
      { name: "Stalwart Stance", source: "SRDLite" },
    ]);
    open();
    fireEvent.click(screen.getByText("Features & Traits"));
    expect(screen.getByText("Feature Choices")).toBeInTheDocument();
    expect(screen.getByText("Stalwart Stance")).toBeInTheDocument();
  });

  describe("dice rolls (seeded)", () => {
    afterEach(() => vi.restoreAllMocks());

    it("rolls a skill check into the result toast, honoring advantage", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5); // every d20 -> 11
      open();

      // Channeler str 8 -> −1: 11 − 1 = 10.
      fireEvent.click(screen.getByLabelText("Roll Athletics"));
      const toast = screen.getByRole("status");
      expect(within(toast).getByText("Athletics")).toBeInTheDocument();
      expect(within(toast).getByText("10")).toBeInTheDocument();

      // Advantage rolls two dice and keeps the higher.
      vi.spyOn(Math, "random").mockReturnValueOnce(0.1).mockReturnValueOnce(0.9); // 3, 19
      fireEvent.click(screen.getByText("Adv"));
      fireEvent.click(screen.getByLabelText("Roll Dexterity save"));
      expect(within(screen.getByRole("status")).getByText("18")).toBeInTheDocument(); // 19 − 1
    });

    it("rolls attack and damage from the Actions tab", () => {
      useCharacterStore
        .getState()
        .addItem({ ref: { name: "Longsword", source: "SRDLite" }, name: "Longsword" });
      vi.spyOn(Math, "random").mockReturnValue(0.999);
      open();

      fireEvent.click(screen.getByLabelText("Roll attack: Longsword"));
      expect(within(screen.getByRole("status")).getByText(/d20 \[20\]/)).toBeInTheDocument();

      // Longsword damage "1d8−1 slashing" (str −1): max roll 8 − 1 = 7.
      fireEvent.click(screen.getByLabelText("Roll damage: Longsword"));
      expect(within(screen.getByRole("status")).getByText("7")).toBeInTheDocument();

      // Unarmed Strike damage has no dice term, so it isn't rollable.
      expect(screen.queryByLabelText("Roll damage: Unarmed Strike")).not.toBeInTheDocument();
    });

    it("spends a hit die to heal by the roll plus Con", () => {
      open();
      fireEvent.click(screen.getByLabelText("Hit Points"));
      fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "3" } });
      fireEvent.click(screen.getByRole("button", { name: "Damage" }));
      expect(useCharacterStore.getState().draft.play.damageTaken).toBe(3);

      vi.spyOn(Math, "random").mockReturnValue(0.5); // d6 -> 4; con −1 -> heal 3
      fireEvent.click(screen.getByLabelText("Spend d6 hit die"));
      expect(useCharacterStore.getState().draft.play).toMatchObject({
        damageTaken: 0,
        usedHitDice: [1],
      });
      expect(screen.getByText("5/5")).toBeInTheDocument();
    });

    it("tracks death saves at 0 HP: rolls, damage-as-failure, healing clears", () => {
      open();
      fireEvent.click(screen.getByLabelText("Hit Points"));
      fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "5" } });
      fireEvent.click(screen.getByRole("button", { name: "Damage" }));
      expect(screen.getByText("Death Saves")).toBeInTheDocument();

      vi.spyOn(Math, "random").mockReturnValue(0.5); // d20 -> 11: success
      fireEvent.click(screen.getByText("Roll Death Save"));
      expect(useCharacterStore.getState().draft.play.deathSaves).toEqual({
        successes: 1,
        failures: 0,
      });

      // Damage while at 0 HP is a death-save failure, not more damage.
      fireEvent.click(screen.getByRole("button", { name: "Damage" }));
      expect(useCharacterStore.getState().draft.play.deathSaves.failures).toBe(1);

      fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "2" } });
      fireEvent.click(screen.getByText("Heal"));
      expect(useCharacterStore.getState().draft.play.deathSaves).toEqual({
        successes: 0,
        failures: 0,
      });
    });
  });

  it("tracks class resources with pips and restores them on a long rest", () => {
    useCharacterStore.getState().setClass({ name: "Warden", source: "SRDLite" });
    open();

    // Warden 1 has 2 Vigor Uses (from its class table); spend both.
    fireEvent.click(screen.getByLabelText("Vigor Uses slot 2"));
    expect(useCharacterStore.getState().draft.play.usedResources["Vigor Uses"]).toBe(2);

    // Vigor isn't a short-rest resource — only a long rest restores it.
    fireEvent.click(screen.getByLabelText("Hit Points"));
    fireEvent.click(screen.getByText("Short Rest"));
    expect(useCharacterStore.getState().draft.play.usedResources["Vigor Uses"]).toBe(2);
    fireEvent.click(screen.getByText("Long Rest"));
    expect(useCharacterStore.getState().draft.play.usedResources).toEqual({});
  });

  it("uses the best competing AC formula (Unarmored Defense) when unarmored", () => {
    const store = useCharacterStore.getState();
    store.setClass({ name: "Warden", source: "SRDLite" });
    store.setBaseAbility("con", 16);
    open();

    // Unarmored Defense: 10 + dex (−1) + con (+3) = 12 beats base 9.
    expect(screen.getByText("AC").parentElement?.textContent).toContain("12");
  });

  it("applies an attunement item's bonus only while attuned, capped at 3 items", () => {
    const store = useCharacterStore.getState();
    for (let i = 0; i < 4; i++) {
      store.addItem({ ref: { name: "Warded Band", source: "SRDLite" }, name: "Warded Band" });
    }
    store.toggleEquip(0);
    open();

    // Equipped but not attuned: the +1 AC does not apply (dex 8 -> AC 9).
    expect(screen.getByText("AC").parentElement?.textContent).toContain("9");

    fireEvent.click(screen.getByText("Inventory"));
    fireEvent.click(screen.getAllByText("Attune")[0]);
    expect(screen.getByText("AC").parentElement?.textContent).toContain("10");

    // Attune two more; the fourth is blocked by the 3-item limit.
    fireEvent.click(screen.getAllByText("Attune")[0]);
    fireEvent.click(screen.getAllByText("Attune")[0]);
    expect(screen.getAllByText("Attuned")).toHaveLength(3);
    expect(screen.getByText("Attune")).toBeDisabled();
    expect(screen.getByText(/Attuned: 3\/3/)).toBeInTheDocument();
  });

  it("edits the five-coin purse on the Inventory tab with gp conversion", () => {
    open();
    fireEvent.click(screen.getByText("Inventory"));
    fireEvent.change(screen.getByLabelText("PP"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("SP"), { target: { value: "5" } });
    expect(useCharacterStore.getState().draft.currency).toMatchObject({ pp: 2, sp: 5 });
    expect(screen.getByText(/≈ 20.5 gp/)).toBeInTheDocument();
  });

  it("tags species-granted spells, flags rituals, and notes cantrip scaling", () => {
    const store = useCharacterStore.getState();
    store.setRace({ name: "Swiftling", source: "SRDLite" }); // innate Mage Light
    store.toggleSpell({ name: "Mending Ward", source: "SRDLite" }, "Channeler"); // ritual
    store.setClassLevel(0, 5); // cantrip dice scale at level 5
    open();
    fireEvent.click(screen.getByText("Spells"));

    expect(screen.getByText("Mage Light")).toBeInTheDocument();
    expect(screen.getByText("Species")).toBeInTheDocument();
    expect(screen.getByText("Ritual")).toBeInTheDocument();
    expect(screen.getByText(/damage dice ×2/)).toBeInTheDocument();
  });

  it("shows a mastered weapon's mastery property on its attack line", () => {
    const store = useCharacterStore.getState();
    store.setClass({ name: "Warden", source: "SRDLite" });
    store.addItem({ ref: { name: "Longsword", source: "SRDLite" }, name: "Longsword" });
    store.setWeaponMasteries(["Longsword"]);
    open();
    expect(screen.getByText(/Mastery: Sap/)).toBeInTheDocument();
  });

  it("adds a rollable custom attack from the Actions tab", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    open();
    fireEvent.click(screen.getByText("+ Add Attack"));
    fireEvent.change(screen.getByLabelText("Attack name"), { target: { value: "Flame Jet" } });
    fireEvent.change(screen.getByLabelText("Attack bonus"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Attack damage"), { target: { value: "2d6 fire" } });
    fireEvent.click(screen.getByText("Add"));

    expect(useCharacterStore.getState().draft.customAttacks).toEqual([
      { name: "Flame Jet", hit: 5, damage: "2d6 fire" },
    ]);
    fireEvent.click(screen.getByLabelText("Roll attack: Flame Jet"));
    expect(within(screen.getByRole("status")).getByText("16")).toBeInTheDocument(); // 11 + 5
    vi.restoreAllMocks();
  });

  it("tracks magic-item charges, restored by a long rest", () => {
    const store = useCharacterStore.getState();
    store.addItem({ ref: { name: "Rod of Embers", source: "SRDLite" }, name: "Rod of Embers" });
    open();
    fireEvent.click(screen.getByText("Inventory"));
    fireEvent.click(screen.getByLabelText("Rod of Embers charges slot 2"));
    expect(useCharacterStore.getState().draft.play.usedItemCharges["Rod of Embers"]).toBe(2);

    fireEvent.click(screen.getByLabelText("Hit Points"));
    fireEvent.click(screen.getByText("Long Rest"));
    expect(useCharacterStore.getState().draft.play.usedItemCharges).toEqual({});
  });

  it("excludes the contents of a weightless container from carried weight", () => {
    const store = useCharacterStore.getState();
    store.addItem({
      ref: { name: "Sack of Deep Holding", source: "SRDLite" },
      name: "Sack of Deep Holding",
    });
    store.addItem({ ref: { name: "Rod of Embers", source: "SRDLite" }, name: "Rod of Embers" });
    open();
    fireEvent.click(screen.getByText("Inventory"));

    // Sack 5 lb + rod 2 lb carried normally.
    expect(screen.getByText(/Total Weight: 7 lb \//)).toBeInTheDocument();

    const sackId = useCharacterStore.getState().draft.inventory[0].id!;
    fireEvent.change(screen.getByLabelText("Container for Rod of Embers"), {
      target: { value: sackId },
    });
    expect(screen.getByText(/Total Weight: 5 lb \//)).toBeInTheDocument();
  });

  it("attaches an imported creature on the Extras tab", () => {
    open();
    fireEvent.click(screen.getByText("Extras"));
    fireEvent.click(screen.getByText("+ Add Creature"));
    fireEvent.change(screen.getByPlaceholderText("Search creatures to add…"), {
      target: { value: "Ember" },
    });
    fireEvent.click(screen.getByText("Ember Hawk"));

    expect(useCharacterStore.getState().draft.extras).toEqual([
      { name: "Ember Hawk", source: "SRDLite" },
    ]);
    expect(screen.getByText(/Talons/)).toBeInTheDocument();
    expect(screen.getByText("11 (2d6 + 4)", { exact: false })).toBeInTheDocument();
  });

  it("toggles a Mage-Armor-style spell effect on and off the AC", () => {
    useCharacterStore.getState().toggleSpell({ name: "Warding Aegis", source: "SRDLite" }, "Channeler");
    open();

    // Off: base 10 + dex −1 = 9.
    expect(screen.getByText("AC").parentElement?.textContent).toContain("9");
    fireEvent.click(screen.getByRole("button", { name: "Warding Aegis", pressed: false }));
    expect(useCharacterStore.getState().draft.play.activeEffects).toEqual(["Warding Aegis"]);
    // On: 13 + dex −1 = 12.
    expect(screen.getByText("AC").parentElement?.textContent).toContain("12");
    fireEvent.click(screen.getByRole("button", { name: "Warding Aegis", pressed: true }));
    expect(screen.getByText("AC").parentElement?.textContent).toContain("9");
  });

  it("marks item-granted advantage on the skill and rolls with it", () => {
    const store = useCharacterStore.getState();
    store.addItem({ ref: { name: "Whispering Boots", source: "SRDLite" }, name: "Whispering Boots" });
    store.toggleEquip(0);
    vi.spyOn(Math, "random").mockReturnValueOnce(0.1).mockReturnValueOnce(0.9); // 3, 19
    open();

    expect(screen.getByText("adv")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Roll Stealth"));
    const toast = screen.getByRole("status");
    // Advantage keeps the 19; stealth dex −1 -> 18.
    expect(within(toast).getByText("18")).toBeInTheDocument();
    expect(within(toast).getByText(/advantage/)).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("shows a cantrip's damage dice scaled to the character level", () => {
    const store = useCharacterStore.getState();
    store.toggleCantrip({ name: "Spark Touch", source: "SRDLite" }, "Channeler");
    store.setClassLevel(0, 5);
    open();
    fireEvent.click(screen.getByText("Spells"));
    expect(screen.getByText("2d8")).toBeInTheDocument();
  });

  it("nests containers and shows the load against capacity", () => {
    const store = useCharacterStore.getState();
    store.addItem({ ref: { name: "Sack of Deep Holding", source: "SRDLite" }, name: "Sack of Deep Holding" });
    store.addItem({ ref: { name: "Sack of Deep Holding", source: "SRDLite" }, name: "Sack of Deep Holding" });
    store.addItem({ ref: { name: "Rod of Embers", source: "SRDLite" }, name: "Rod of Embers" });
    open();
    fireEvent.click(screen.getByText("Inventory"));

    const [sackAId, sackBId] = useCharacterStore
      .getState()
      .draft.inventory.slice(0, 2)
      .map((e) => e.id!);
    // Rod -> sack B -> sack A: everything inside A is weightless.
    fireEvent.change(screen.getByLabelText("Container for Rod of Embers"), {
      target: { value: sackBId },
    });
    fireEvent.change(screen.getAllByLabelText("Container for Sack of Deep Holding")[1], {
      target: { value: sackAId },
    });
    expect(screen.getByText(/Total Weight: 5 lb \//)).toBeInTheDocument();
    // Sack A holds sack B (5) + its rod (2) against its 250 lb capacity.
    expect(screen.getByText(/holds 7 lb \/ 250 lb/)).toBeInTheDocument();
  });

  it("expands a weapon on the Actions tab into its item card", () => {
    useCharacterStore.getState().addItem({ ref: { name: "Longsword", source: "SRDLite" }, name: "Longsword" });
    open();
    // Actions is the default tab; the weapon name expands to the item detail.
    fireEvent.click(screen.getByText("Longsword"));
    expect(screen.getByText("1d8 slashing")).toBeInTheDocument();
    expect(screen.getByText("15 gp")).toBeInTheDocument();
  });
});
