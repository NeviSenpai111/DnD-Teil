# 🐉 5eTools Importer + Character Builder

A local-first web app that **imports 5eTools-format JSON** and provides a content
browser (clean statblocks) plus a **D&D-Beyond-style character builder**. All
content comes from imported JSON — nothing official is bundled.

## Run

```bash
npm install
npm run dev        # start the app (Vite)
npm test           # run the unit/acceptance tests (Vitest)
npm run build      # typecheck + production build
npm run typecheck  # types only
```

Open the app, click **Sample** in the sidebar to load the bundled samples
(`public/sample-data/`), then:
- **Browse** the Space Galleon vehicle as a statblock; use the **search box** to
  filter the list by name, content type, or source. Items get a stat card
  (category, damage/AC, properties, weight, cost), spells get a casting card
  (level/school, casting time, range, components, duration), classes show hit
  die, proficiencies and all their features by level, and subclasses list their
  features — other types render their description entries.
- **Build** a character in a D&D-Beyond-style builder: numbered page tabs
  (**Home · 1. Class · 2. Background · 3. Species · 4. Abilities · 5. Equipment
  · What's Next**) with prev/next arrows, a shared character-name header, and
  Level/HP/AC chips + Save + Sheet in the dark builder bar.
  - **Class**: "Character Level" header with Max HP / Hit Dice and **Manage
    HP**; collapsible feature accordions ("N Choices · 1st level") covering hit
    points, proficiencies (with the class's skill dropdowns), the subclass
    pick, every gained feature, interactive **Ability Score Improvement**
    slots (ASI or feat — with the feat's skill and spell picks inline),
    **choice-driven features** — a class/subclass `optionalfeatureProgression`
    (fighting styles, invocations, metamagic, …) becomes a picker limited to
    the count for your level with level-prerequisite gating, and **Expertise**
    features offer skill picks from your current proficiencies (doubling the
    bonus) — and **Available at Higher Levels**; plus a per-class **Spells**
    sub-tab with slots, limits and pick lists. **Weapon Mastery** (2024): a
    "Weapon Mastery" class-table column becomes a picker over
    mastery-property weapons, and the property shows on the sheet's attack
    lines. **"+ Add Another Class"** multiclasses: each class gets its own
    section, level, subclass, features, ASI slots and spell picks; HP uses
    the multiclass rule (only the first class's first level is maxed),
    casting classes share multiclass spell slots, and the incoming class's
    **multiclass ability prerequisites** (incl. either/or forms) are
    enforced. Feats with unmet **prerequisites** (ability/level) are disabled
    in the ASI slots with the reason.
  - **Background**: dropdown pick with description, Skill/Tool/Language
    proficiency lines and skill dropdowns, **tool pickers** for
    choose/any-category grants (SRD artisan/gaming/instrument tables),
    granted-feat accordions (with their ability choices), 2024 **Ability
    Scores** choices, **Suggested Characteristics** tables (2014-style
    personality/ideal/bond/flaw rows — click to pick or roll one into your
    details), a **custom background builder** (name + description granting 2
    any-skill picks, a tool and a standard language through the same
    pickers), and editable **Character Details**
    (alignment/faith/lifestyle), **Physical & Personal Characteristics** and
    **Notes** — all shown on the sheet.
  - **Species**: the chosen species with trait accordions, "Change Species",
    skill/ability choices and subraces — plus **language pickers** for
    "choose/any N language" grants (offering the SRD standard/exotic tables)
    and **species-granted spells** (`additionalSpells`): innate grants are
    listed and choice grants (High-Elf-cantrip style) get spell dropdowns.
  - **Abilities**: method dropdown (point buy / array / roll / manual), a
    centered **Points Remaining** counter, per-ability selects with live
    totals, and **Score Calculations** cards itemising every bonus source —
    with editable **Set Score** (replaces the base), **Other Modifier** (flat
    extra) and **Override Score** (wins over everything) rows per ability.
  - **Equipment**: a Starting Equipment accordion, item search, and a
    **Current Inventory** list with type lines, quantities, wear/wield
    toggles, a **five-coin purse** (CP/SP/EP/GP/PP with a live gp total) and
    **Total Weight vs. carrying capacity** (Str × 15, with an over-capacity
    warning).
  - **What's Next**: a completion checklist (open skill/spell/ASI picks) with
    Save / Full Sheet / Export actions.
- The **full-page sheet** (`/sheet/:id`) is a D&D-Beyond-style layout: ability
  cards + stat chips on top, saving throws / senses / proficiencies and the skill
  list down the side, and a tabbed panel — **Actions** (weapon attacks +
  Unarmed Strike, to-hit and damage derived from your abilities), **Spells**
  (grouped by level with DC/attack), **Inventory**, **Features & Traits** (class,
  species, feats), **Background** (description + your character details),
  **Notes**, **Extras**. The sheet is **playable, not just printable**:
  - **+ Add Spell** / **+ Add Item** menus search the imported content and add
    directly. The spell search **adheres to the caster's spell list** (same
    sources.json mapping, flood guard and castable-level cap as the builder);
    in a multiclass build an "Add for" dropdown picks the caster class and the
    pick is tagged to it. Non-casters get no spell menu.
  - Clicking a weapon, item or spell expands its full detail card inline;
    inventory rows have quantity / equip / remove controls, an **Attune**
    toggle on items that require attunement (3-item limit enforced; an
    attunement item's modifiers apply only while attuned), **charge pips**
    on items with charges (restored by a long rest), and a **container**
    dropdown when a container is carried — containers **nest** (cycle-safe),
    each shows its **load vs. capacity**, and anything inside a weightless
    (bag-of-holding-style) container doesn't count toward carry weight.
    Carried weight past the variant-encumbrance thresholds **reduces speed**
    automatically (−10 / −20 / crawl at the Str×15 cap, flagged on the Speed
    chip). The tab ends with the editable **purse** and weight-vs-capacity
    line, plus a **custom item** mini-form (name/weight/damage — damaging
    items join the attack list). Spell rows tag **Feat**/**Species** grants
    and **Ritual** spells; cantrips show their **damage dice scaled to your
    level** (e.g. 2d8 at level 5). The Actions tab also holds **custom
    attacks** (name/to-hit/damage, rollable like weapons), and the **Extras**
    tab attaches imported creatures (companions/familiars) as mini
    statblocks with their traits and actions.
  - **▲ Level Up** in the header raises a class level (per-class menu when
    multiclassed) — new choices are then made in the builder.
  - **Everything rolls**: click any skill, save, ability modifier, attack
    to-hit or damage expression to roll it — results appear in a dice toast,
    and an **Adv/Dis** toggle in the header applies to every d20. (Damage
    without dice, like an unarmed strike's flat 1, isn't rollable.) Skills
    with **item-granted advantage** (parsed from equipped items' "advantage
    on … checks" text) show an *adv* marker and roll with advantage
    automatically.
  - **Effects toggles**: Mage-Armor-style spells — any known spell whose text
    sets a base AC formula ("base Armor Class becomes 13 + Dexterity…") —
    appear as toggle pills; switch one on when cast and the AC derivation
    picks the best formula.
  - The **HP chip is a tracker**: click it for a damage/heal strip with an
    amount input, temp HP (absorbs damage first), **Short/Long Rest** buttons,
    and a **hit-dice pool** per class ("Spend" rolls the die + Con and heals).
    At **0 HP** the strip shows **death saves**: roll them (nat 1 = two
    failures, nat 20 = back up at 1 HP), or damage taken while down adds a
    failure; healing clears them. Damage is stored as "taken", so leveling up
    keeps the wound.
  - **Spell slots render as pips** on the Spells tab (shared multiclass table
    shown once, pact slots separately) and **class resources** (rage/ki-style
    columns from the class table) render as pips on the Actions tab — click to
    spend or restore. A long rest clears everything; a short rest restores
    pact slots and short-rest resources (Ki/Focus, Channel Divinity,
    Superiority Dice, Second Wind).

  Edits on a saved character's sheet persist immediately; edits on the draft
  flow into the builder as usual. Interactive controls are hidden when
  printing.
- **Characters** to save/load/duplicate/delete, **View** the full-page sheet, and
  export to JSON; **Print** outputs just the sheet.

## Architecture

```
src/
  data/
    types/          TS interfaces for _meta + each content type
    importer.ts     parse / merge / dedupe by name+source
    contentIndex.ts cross-reference lookup + distinct sources
    featureResolver.ts  assemble class/subclass features per level
    tagParser/      {@...} tokenizer (TDD) + React TagRenderer
    entryRenderer/  recursive `entries` renderer
    exportCharacter.ts  JSON export/download
  engine/           pure, unit-tested rules (modifiers, hp, armor,
                    spellcasting slots, character derivation, edition gating,
                    the typed modifier engine, optional-feature progressions)
  model/character.ts  the character = the player's CHOICES
  store/            Zustand: content, character draft + roster, selectors
  db/               Dexie schema + persistence + startup bootstrap
  components/       browser / builder / sheet / characters / common
```

Core idea: a character stores **choices**; all derived stats are recomputed by
`engine/character.ts` (`deriveCharacter`) from those choices + imported content.
The single recursive `EntryRenderer` + `TagRenderer` render any content type.

## Editions

Both `classic` (2014) and `one` (2024) are supported and gated via
`engine/edition.ts` — notably ASIs come from race (classic) vs background (2024).

## Real 5eTools data

The importer handles real 5eTools dumps, not just the bundled samples:

- **`_copy` / `_mod` inheritance** is resolved over the full imported pool
  (`data/copyResolver.ts`) — supported `_mod` ops: `appendArr`, `prependArr`,
  `insertArr`, `removeArr`, `replaceArr`, `replaceTxt`. So subraces/monsters/items
  that copy a base import fully.
- **Spell → class lists** come from the `spells/sources.json` reverse-index
  (real spells have no inline `classes`). Import that file alongside the spell
  files and the spells step filters correctly per class; spells with no mapping
  fall back to inline `classes.fromClassList`. A spell with no class info at
  all is offered openly **only when nothing is known about the class's spell
  list** — once any mapping/inline data names the class, unknown spells are
  excluded so forgetting `sources.json` can't flood every class with every
  spell (the builder shows a warning telling you to import it). Spells
  **reprinted across sources** (e.g. PHB + XPHB) are collapsed to a single
  entry, preferring the casting class's own source, so each spell appears once.
- **Spell slots, cantrip and known/prepared counts** are driven by each class's
  own progression tables. `casterProgression: "artificer"` (also used by 2024
  half-casters, who round up) grants a 1st-level slot at level 1; 2024 classes'
  `preparedSpellsProgression` is read directly instead of approximated. Subclass
  casters (Eldritch Knight, Arcane Trickster) read their spellcasting from the
  subclass, so they get their cantrips and spells too.
- **2024 backgrounds** are fully supported: `choose.weighted` ability grants
  (+2/+1 or +1/+1/+1, assigned per-slot in the builder) and background-granted
  **feats** (`{ "name; option|source": true }`) are parsed and applied.
- **Feats** apply their effects: flat & chosen ability increases, fixed skill /
  saving-throw / tool / language proficiencies, expertise, **free-choice skill
  grants** (Prodigy's choose-list, Skilled's "any 3 skills or tools", `any N`)
  and **granted spells** (`additionalSpells`): Magic Initiate's list choice +
  cantrip/spell picks and Fey Touched's fixed + school-filtered picks are
  chosen inline in the feat's accordion and appear on the sheet's Spells tab
  tagged "Feat". All feat choices are picked inline where the feat is shown
  (ASI slot or background accordion).
- **Starting equipment** is auto-granted from a background/class `startingEquipment`
  (both the 2024 A/B choice-group form and the 2014 `defaultData` form); the
  Equipment step's "Add starting equipment" button populates the default loadout.
- **Tool / language / armor / weapon** proficiencies from race, background, class
  and feats are gathered and shown on the sheet. "Choose/any N language"
  grants are **pickable** wherever they come from — race, subrace,
  background or feat — and species `additionalSpells` grants appear on the
  sheet tagged **Species**.
- **A general modifier engine** (`engine/modifierEngine.ts`) resolves typed
  `bonus`/`set`/`proficiency`/`advantage` modifiers against targets
  (abilities, AC, initiative, speed, skills) with DDB-style stacking rules:
  bonuses add but same-source bonuses count once, `set` acts as a floor and
  the highest wins, and modifiers can carry equipment conditions (armored /
  unarmored / shield). **Equipped items feed it**: `bonusAc` (+1
  rings/cloaks/armor) raises AC, `ability.static` set-scores
  (Headband-of-Intellect-style items) floor an ability while worn — a manual
  Override Score still wins — and "advantage on X (Skill) checks" item text
  becomes an advantage marker on that skill. **Species passives**
  (`resist`/`immune` damage types, `darkvision`) surface as Defenses and
  Senses on the sheet.
- **Choice-driven class features**: a class or subclass
  `optionalfeatureProgression` (fighting styles, invocations, metamagic,
  maneuvers, artificer infusions, …) surfaces an interactive picker in the
  builder filtered to the matching imported `optionalfeature` entries — with
  the cumulative count for your level (array and `{ "level": count }`
  progression forms), simple level prerequisites enforced, and picks shown on
  the sheet's Features tab. **The options themselves are NOT in the class
  file**: 5eTools ships them in the separate `optionalfeature.json` (book
  content), so import that file alongside `class/class-*.json` — the picker
  tells you so (naming the feature type, e.g. `AI` = Artificer Infusion) when
  the options are missing, and imported ones get their own browser cards.
  Class features named **Expertise** offer skill picks from your current
  proficiencies and double the proficiency bonus on those checks.
- **Competing AC formulas**: Unarmored-Defense-style features are detected
  from feature text ("your Armor Class equals N + your X modifier …" while
  not wearing armor) and the best formula wins — Barbarian 10+Dex+Con (shield
  allowed via "still gain this benefit"), Monk 10+Dex+Wis (lost with a
  shield), Draconic Resilience 13+Dex, and equivalent homebrew. Wearing armor
  always uses the armored formula.
- **Class resources** are parsed from `classTableGroups`: numeric columns
  that aren't known/prepared counts (Rages, Ki Points, Sorcery Points,
  Superiority Dice, …) become spendable pip trackers on the sheet, with the
  per-level maximum from the table.
- **Selection limits are enforced** so you can only take what you're entitled to:
  cantrip/spell counts, "choose N" skill groups (a skill can't be picked twice or
  re-picked when already granted), point-buy budget, and feats (the same feat
  can't be taken in two ASI slots).

Import the actual data files (e.g. `class/class-*.json`, `spells/spells-*.json`
+ `spells/sources.json`, `races.json`, `backgrounds.json`, `items-base.json`,
`items.json`, `optionalfeature.json` — needed for invocations / infusions /
metamagic / fighting styles — and `vehicles.json`). Multiple files can be
selected at once.

## Known simplifications / TODOs

- **No official content is bundled.** `srd-lite.json` is small, original test
  content (Sturdyfolk/Swiftling, Warden/Channeler, etc.) to exercise the builder.
  Import your own 5eTools dumps for real content.
- Feats' free-choice **tool/language** grants and save *choices* (e.g.
  Resilient) are summarised but not yet pickable (skill choices and spell
  grants ARE pickable). Multiclassing simplifications: saving throws and
  starting proficiencies come from the first class only, ASI slot indices
  shift if an earlier class gains a slot, and feat spells don't use the
  chosen ability for DCs. Schema validation remains TODO.
- Starting equipment grants the first option of each choice; alternate options
  and gold-alternative parsing are simplified.
- Modifier-engine edges: item-granted spells/resistances and structured
  proficiency grants from items are still TODO (advantage comes from item
  text only). Optional-feature prerequisites beyond a simple level (pact,
  spells known) are not validated. Container capacity is displayed but not
  hard-blocked.
- Rest simplifications: a long rest restores **all** hit dice, resources and
  item charges (RAW restores half the dice; item `recharge` strings aren't
  parsed); which resources a short rest restores is a name heuristic
  (Ki/Focus, Channel Divinity, Superiority Dice, Second Wind) because the
  data carries no recharge rule.
- Prerequisite validation covers ability minimums and level; race,
  spellcasting and proficiency prerequisites are displayed but not checked.
  The multiclass gate checks only the incoming class (RAW also requires the
  current class's minimums). Containers pack a single level deep with no
  capacity cap; only the weightless rule affects carry weight.
- Feature references (`refClassFeature` / `refSubclassFeature` /
  `refOptionalfeature` / `refFeat`) render as named pointer lines rather than
  expanding inline — the referenced features are already listed as their own
  sections. `options`, spellcasting formula blocks (`abilityDc` /
  `abilityAttackMod`), `statblock` refs and table roll cells render natively;
  anything rarer still falls back to a graceful "unsupported" note.
- Cross-reference tags render as styled spans; click-to-navigate is a TODO.
- Source identity follows the data: the toggle uses entity `source` values, which
  can differ from `_meta.sources[].json`.
