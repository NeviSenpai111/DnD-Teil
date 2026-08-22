/**
 * Holds the character currently being built (the "draft") and the actions the
 * builder wizard uses to mutate it. Multiple saved characters + persistence are
 * added in Phase 6; for now there is a single in-memory draft.
 */

import { create } from "zustand";
import type { Edition } from "../data/types/meta";
import type { Ability, AbilityScores } from "../engine/constants";
import type { Coin } from "../engine/currency";
import {
  createCharacter,
  newItemId,
  normalizeCharacter,
  type AbilityAdjustments,
  type AbilityMethod,
  type AsiChoice,
  type Character,
  type CharacterDetails,
  type CustomAttack,
  type CustomItemDef,
  type EntityRef,
  type InventoryItem,
  type SpellPick,
} from "../model/character";
import { deleteCharacterRecord, saveCharacter } from "../db/persistence";

interface CharacterState {
  draft: Character;
  /** Saved character roster (most-recently-updated first). */
  saved: Character[];

  setName: (name: string) => void;
  setEdition: (edition: Edition) => void;
  setRace: (ref: EntityRef | undefined) => void;
  setSubrace: (ref: EntityRef | undefined) => void;
  setBackground: (ref: EntityRef | undefined) => void;
  setClass: (ref: EntityRef | undefined) => void;
  /** Add a second/third/... class at level 1 (multiclass). */
  addClass: (ref: EntityRef) => void;
  removeClass: (index: number) => void;
  setClassLevel: (index: number, level: number) => void;
  setSubclass: (index: number, ref: EntityRef | undefined) => void;
  setHpMode: (mode: "average" | "rolled") => void;
  setHpRolls: (rolls: number[]) => void;
  toggleCantrip: (ref: EntityRef, forClass?: string) => void;
  toggleSpell: (ref: EntityRef, forClass?: string) => void;
  /** Choose among a spell-granting feat's option sets (Magic Initiate). */
  setFeatSpellSet: (keyPrefix: string, setName: string) => void;
  /** Store the picks for one feat spell-choice definition. */
  setFeatSpells: (key: string, refs: EntityRef[]) => void;
  setAbilityMethod: (method: AbilityMethod) => void;
  setBaseAbilities: (scores: AbilityScores) => void;
  setBaseAbility: (ability: Ability, value: number) => void;
  /** Set or clear (undefined) a manual score adjustment. */
  setAbilityAdjustment: (
    kind: keyof AbilityAdjustments,
    ability: Ability,
    value: number | undefined,
  ) => void;
  setAbilityChoice: (key: string, abilities: Ability[]) => void;
  setSkillChoice: (key: string, skillIds: string[]) => void;
  /** Store the picks for one optional-feature progression (fighting styles…). */
  setOptionalFeatures: (key: string, refs: EntityRef[]) => void;
  /** Store the expertise skill picks for one granting feature. */
  setExpertiseChoice: (key: string, skillIds: string[]) => void;
  /** Store the picks for one "choose/any N languages" grant. */
  setLanguageChoice: (key: string, languages: string[]) => void;
  /** Store the picks for one "choose/any N tools" grant. */
  setToolChoice: (key: string, tools: string[]) => void;
  setCoin: (coin: Coin, value: number) => void;
  /** Use a build-your-own background (clears any published pick), or drop it. */
  setCustomBackground: (custom: { name: string; description: string } | undefined) => void;
  /** Set the mastered weapon kinds (2024 Weapon Mastery). */
  setWeaponMasteries: (names: string[]) => void;
  addCustomAttack: (attack: CustomAttack) => void;
  removeCustomAttack: (index: number) => void;
  addExtra: (ref: EntityRef) => void;
  removeExtra: (index: number) => void;
  setEquipmentMode: (mode: "kit" | "gold") => void;
  setGold: (gold: number) => void;
  addItem: (item: { ref?: EntityRef; name: string; custom?: CustomItemDef }) => void;
  removeItem: (index: number) => void;
  toggleEquip: (index: number) => void;
  setItemQuantity: (index: number, quantity: number) => void;
  setDetail: (field: keyof CharacterDetails, value: string) => void;
  setAsi: (index: number, choice: AsiChoice) => void;
  /**
   * Apply an edit to whichever character has this id — the working draft or a
   * saved roster entry (saved characters are persisted immediately). Used by
   * the full sheet for quick play-time edits (add items/spells) without a
   * round-trip through the builder.
   */
  updateSheet: (id: string, fn: (c: Character) => Partial<Character>) => void;
  resetDraft: () => void;
  loadDraft: (character: Character) => void;

  // Library / roster
  hydrateSaved: (characters: Character[]) => void;
  /** Add a character built outside the builder (D&D Beyond PDF / JSON import). */
  addCharacter: (character: Character) => void;
  saveDraftToLibrary: () => void;
  newDraft: () => void;
  loadCharacter: (id: string) => void;
  duplicateCharacter: (id: string) => void;
  deleteCharacter: (id: string) => void;
}

function upsert(list: Character[], character: Character): Character[] {
  const without = list.filter((c) => c.id !== character.id);
  return [character, ...without].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Add or remove an entity ref from a list by identity (name + source). */
function toggleRef(list: SpellPick[], ref: EntityRef, forClass?: string): SpellPick[] {
  const exists = list.some((r) => r.name === ref.name && r.source === ref.source);
  return exists
    ? list.filter((r) => !(r.name === ref.name && r.source === ref.source))
    : [...list, { name: ref.name, source: ref.source, forClass }];
}

/** Spell picks that DON'T belong to the named class (untagged picks belong to
 * the first class). */
function dropClassSpells(list: SpellPick[], className: string, isFirstClass: boolean): SpellPick[] {
  return list.filter((p) => !(p.forClass === className || (!p.forClass && isFirstClass)));
}

/** Drop choice entries whose key starts with any of the given prefixes. */
function clearChoicesByPrefix<T>(record: Record<string, T>, prefixes: string[]): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !prefixes.some((p) => key.startsWith(p))),
  );
}

export const useCharacterStore = create<CharacterState>((set) => {
  const update = (fn: (draft: Character) => Partial<Character>) =>
    set((s) => ({ draft: { ...s.draft, ...fn(s.draft), updatedAt: Date.now() } }));

  return {
    draft: createCharacter(),
    saved: [],

    setName: (name) => update(() => ({ name })),
    setEdition: (edition) => update(() => ({ edition })),

    setRace: (race) =>
      update((d) => ({
        race,
        subrace: undefined,
        // Race change invalidates race/subrace-scoped picks.
        abilityChoices: clearChoicesByPrefix(d.abilityChoices, ["primary:", "subrace:"]),
        skillChoices: clearChoicesByPrefix(d.skillChoices, ["race:", "subrace:"]),
        languageChoices: clearChoicesByPrefix(d.languageChoices, ["race:lang", "subrace:lang"]),
        featSpells: clearChoicesByPrefix(d.featSpells, ["racespell:"]),
        featSpellSets: clearChoicesByPrefix(d.featSpellSets, ["racespell:"]),
      })),

    setSubrace: (subrace) =>
      update((d) => ({
        subrace,
        skillChoices: clearChoicesByPrefix(d.skillChoices, ["subrace:"]),
        abilityChoices: clearChoicesByPrefix(d.abilityChoices, ["subrace:"]),
        languageChoices: clearChoicesByPrefix(d.languageChoices, ["subrace:lang"]),
        featSpells: clearChoicesByPrefix(d.featSpells, ["racespell:subrace"]),
        featSpellSets: clearChoicesByPrefix(d.featSpellSets, ["racespell:subrace"]),
      })),

    setBackground: (background) =>
      update((d) => ({
        background,
        // Background-granted feats change with the background, so their skill
        // and spell picks (feat:bgfeat:… / bgfeat:…) go stale too.
        skillChoices: clearChoicesByPrefix(d.skillChoices, ["background:", "feat:bgfeat:"]),
        abilityChoices: clearChoicesByPrefix(d.abilityChoices, ["primary:", "bgfeat"]),
        featSpells: clearChoicesByPrefix(d.featSpells, ["bgfeat"]),
        featSpellSets: clearChoicesByPrefix(d.featSpellSets, ["bgfeat"]),
        languageChoices: clearChoicesByPrefix(d.languageChoices, [
          "background:lang",
          "feat:bgfeat",
        ]),
      })),

    setClass: (ref) =>
      update((d) => {
        const prev = d.classes[0];
        return {
          classes: ref
            ? [
                { name: ref.name, source: ref.source, level: prev?.level ?? 1 },
                ...d.classes.slice(1),
              ]
            : d.classes.slice(1),
          skillChoices: clearChoicesByPrefix(d.skillChoices, ["class:"]),
          optionalFeatures: clearChoicesByPrefix(d.optionalFeatures, ["optfeature:0:"]),
          expertiseChoices: clearChoicesByPrefix(d.expertiseChoices, ["expertise:0:"]),
          // Spell lists are class-specific; clear the outgoing class's picks.
          cantrips: prev ? dropClassSpells(d.cantrips, prev.name, true) : d.cantrips,
          spells: prev ? dropClassSpells(d.spells, prev.name, true) : d.spells,
        };
      }),
    addClass: (ref) =>
      update((d) => ({
        classes: [...d.classes, { name: ref.name, source: ref.source, level: 1 }],
      })),
    removeClass: (index) =>
      update((d) => {
        const removed = d.classes[index];
        if (!removed) return {};
        return {
          classes: d.classes.filter((_, i) => i !== index),
          cantrips: dropClassSpells(d.cantrips, removed.name, index === 0),
          spells: dropClassSpells(d.spells, removed.name, index === 0),
          optionalFeatures: clearChoicesByPrefix(d.optionalFeatures, [`optfeature:${index}:`]),
          expertiseChoices: clearChoicesByPrefix(d.expertiseChoices, [`expertise:${index}:`]),
          ...(index === 0 ? { skillChoices: clearChoicesByPrefix(d.skillChoices, ["class:"]) } : {}),
        };
      }),
    setClassLevel: (index, level) =>
      update((d) => ({
        classes: d.classes.map((c, i) => (i === index ? { ...c, level: Math.max(1, level) } : c)),
      })),
    setSubclass: (index, ref) =>
      update((d) => ({
        classes: d.classes.map((c, i) => (i === index ? { ...c, subclass: ref } : c)),
        // Subclass-scoped optional-feature picks go stale with the subclass.
        optionalFeatures: clearChoicesByPrefix(d.optionalFeatures, [`optfeature:${index}:s:`]),
      })),
    setHpMode: (hpMode) => update(() => ({ hpMode })),
    setHpRolls: (hpRolls) => update(() => ({ hpRolls })),

    toggleCantrip: (ref, forClass) =>
      update((d) => ({ cantrips: toggleRef(d.cantrips, ref, forClass) })),
    toggleSpell: (ref, forClass) =>
      update((d) => ({ spells: toggleRef(d.spells, ref, forClass) })),

    setFeatSpellSet: (keyPrefix, setName) =>
      update((d) => ({
        featSpellSets: { ...d.featSpellSets, [keyPrefix]: setName },
        // Switching the set (e.g. Cleric -> Wizard list) invalidates its picks.
        featSpells: clearChoicesByPrefix(d.featSpells, [`${keyPrefix}:`]),
      })),
    setFeatSpells: (key, refs) =>
      update((d) => ({ featSpells: { ...d.featSpells, [key]: refs } })),

    setAbilityMethod: (abilityMethod) => update(() => ({ abilityMethod })),
    setBaseAbilities: (baseAbilities) => update(() => ({ baseAbilities })),
    setBaseAbility: (ability, value) =>
      update((d) => ({ baseAbilities: { ...d.baseAbilities, [ability]: value } })),

    setAbilityAdjustment: (kind, ability, value) =>
      update((d) => {
        const record = { ...d.abilityAdjustments[kind] };
        if (value === undefined) delete record[ability];
        else record[ability] = value;
        return { abilityAdjustments: { ...d.abilityAdjustments, [kind]: record } };
      }),

    setAbilityChoice: (key, abilities) =>
      update((d) => ({ abilityChoices: { ...d.abilityChoices, [key]: abilities } })),
    setSkillChoice: (key, skillIds) =>
      update((d) => ({ skillChoices: { ...d.skillChoices, [key]: skillIds } })),
    setOptionalFeatures: (key, refs) =>
      update((d) => ({ optionalFeatures: { ...d.optionalFeatures, [key]: refs } })),
    setExpertiseChoice: (key, skillIds) =>
      update((d) => ({ expertiseChoices: { ...d.expertiseChoices, [key]: skillIds } })),
    setLanguageChoice: (key, languages) =>
      update((d) => ({ languageChoices: { ...d.languageChoices, [key]: languages } })),
    setToolChoice: (key, tools) =>
      update((d) => ({ toolChoices: { ...d.toolChoices, [key]: tools } })),
    setCoin: (coin, value) =>
      update((d) => ({ currency: { ...d.currency, [coin]: Math.max(0, value) } })),
    setCustomBackground: (custom) =>
      update((d) => ({
        customBackground: custom,
        // Switching modes invalidates background-scoped picks either way.
        ...(custom ? { background: undefined } : {}),
        skillChoices: clearChoicesByPrefix(d.skillChoices, ["background:"]),
        languageChoices: clearChoicesByPrefix(d.languageChoices, ["background:lang"]),
        toolChoices: clearChoicesByPrefix(d.toolChoices, ["background:tool"]),
      })),
    setWeaponMasteries: (weaponMasteries) => update(() => ({ weaponMasteries })),
    addCustomAttack: (attack) =>
      update((d) => ({ customAttacks: [...d.customAttacks, attack] })),
    removeCustomAttack: (index) =>
      update((d) => ({ customAttacks: d.customAttacks.filter((_, i) => i !== index) })),
    addExtra: (ref) => update((d) => ({ extras: [...d.extras, ref] })),
    removeExtra: (index) =>
      update((d) => ({ extras: d.extras.filter((_, i) => i !== index) })),

    setEquipmentMode: (equipmentMode) => update(() => ({ equipmentMode })),
    setGold: (gold) => update(() => ({ gold: Math.max(0, gold) })),
    addItem: (item) =>
      update((d) => ({
        inventory: [
          ...d.inventory,
          {
            id: newItemId(),
            ref: item.ref,
            custom: item.custom,
            name: item.name,
            quantity: 1,
            equipped: false,
          } satisfies InventoryItem,
        ],
      })),
    removeItem: (index) =>
      update((d) => {
        const removed = d.inventory[index];
        return {
          inventory: d.inventory
            .filter((_, i) => i !== index)
            // Items packed into a removed container fall back to being carried.
            .map((it) =>
              removed?.id && it.containedIn === removed.id
                ? { ...it, containedIn: undefined }
                : it,
            ),
        };
      }),
    toggleEquip: (index) =>
      update((d) => ({
        inventory: d.inventory.map((it, i) =>
          i === index ? { ...it, equipped: !it.equipped } : it,
        ),
      })),
    setItemQuantity: (index, quantity) =>
      update((d) => ({
        inventory: d.inventory.map((it, i) =>
          i === index ? { ...it, quantity: Math.max(1, quantity) } : it,
        ),
      })),
    setDetail: (field, value) =>
      update((d) => ({ details: { ...d.details, [field]: value } })),
    setAsi: (index, choice) =>
      update((d) => {
        const asis = [...d.asis];
        asis[index] = choice;
        // A slot's feat choices are keyed `asifeat:<index>:…` (ability),
        // `feat:asifeat:<index>:…` (skills) and `asifeat:<index>:spell:…`
        // (feat spells); changing the slot invalidates them all.
        return {
          asis,
          abilityChoices: clearChoicesByPrefix(d.abilityChoices, [`asifeat:${index}:`]),
          skillChoices: clearChoicesByPrefix(d.skillChoices, [`feat:asifeat:${index}:`]),
          languageChoices: clearChoicesByPrefix(d.languageChoices, [`feat:asifeat:${index}:`]),
          featSpells: clearChoicesByPrefix(d.featSpells, [`asifeat:${index}:`]),
          featSpellSets: clearChoicesByPrefix(d.featSpellSets, [`asifeat:${index}`]),
        };
      }),

    updateSheet: (id, fn) =>
      set((s) => {
        if (id === s.draft.id) {
          return { draft: { ...s.draft, ...fn(s.draft), updatedAt: Date.now() } };
        }
        const found = s.saved.find((c) => c.id === id);
        if (!found) return {};
        const character = { ...found, ...fn(found), updatedAt: Date.now() };
        void saveCharacter(character);
        return { saved: upsert(s.saved, character) };
      }),

    resetDraft: () => set({ draft: createCharacter() }),
    loadDraft: (character) => set({ draft: normalizeCharacter(character) }),

    hydrateSaved: (characters) => set({ saved: characters.map(normalizeCharacter) }),

    addCharacter: (character) =>
      set((s) => {
        const stored = normalizeCharacter({ ...character, updatedAt: Date.now() });
        void saveCharacter(stored);
        return { saved: upsert(s.saved, stored) };
      }),

    saveDraftToLibrary: () =>
      set((s) => {
        const character = { ...s.draft, updatedAt: Date.now() };
        void saveCharacter(character);
        return { draft: character, saved: upsert(s.saved, character) };
      }),

    newDraft: () => set({ draft: createCharacter() }),

    loadCharacter: (id) =>
      set((s) => {
        const found = s.saved.find((c) => c.id === id);
        return found ? { draft: normalizeCharacter(structuredClone(found)) } : {};
      }),

    duplicateCharacter: (id) =>
      set((s) => {
        const found = s.saved.find((c) => c.id === id);
        if (!found) return {};
        const now = Date.now();
        const copy: Character = {
          ...structuredClone(found),
          id: createCharacter().id,
          name: `${found.name} (copy)`,
          createdAt: now,
          updatedAt: now,
        };
        void saveCharacter(copy);
        return { saved: upsert(s.saved, copy) };
      }),

    deleteCharacter: (id) =>
      set((s) => {
        void deleteCharacterRecord(id);
        return { saved: s.saved.filter((c) => c.id !== id) };
      }),
  };
});
