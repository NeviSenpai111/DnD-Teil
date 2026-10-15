# Feature reference

Everything the app does, page by page. For installing and getting started, see
the [README](../README.md).

## Browse

Click **Sample** in the content panel to load the bundled samples
(`public/sample-data/`), or import your own 5eTools data, then browse it:

- The **search box** filters the list by name, content type or source.
- **Vehicles** such as the Space Galleon render as statblocks.
- **Items** get a 5eTools-style card: type, rarity and attunement lines; cost and
  weight opposite damage or AC; properties and weapon mastery; then the item
  text, followed by the rules for its type, each property and its mastery
  (taken from the imported `items-base.json`), and the source book with page.
- **Spells** get a casting card: level and school, casting time, range,
  components, duration.
- **Classes** show hit die, proficiencies and all their features by level;
  **subclasses** list their features. Other types render their description entries.

## Build

A D&D Beyond-style builder with numbered page tabs (**Home · 1. Class ·
2. Background · 3. Race · 4. Abilities · 5. Equipment · What's Next**; the
third page is called *Species* in 2024 rules),
prev/next arrows, a shared character-name header, and Level / HP / AC chips
plus **Save** and **Sheet** in the dark builder bar.

### Class

- A "Character Level" header with Max HP / Hit Dice and **Manage HP**.
- Collapsible feature accordions ("N Choices · 1st level") covering hit points,
  proficiencies (with the class's skill dropdowns), the subclass pick, every
  gained feature, and **Available at Higher Levels**.
- Interactive **Ability Score Improvement** slots: ASI or feat, with the feat's
  skill and spell picks inline. Feats with unmet **prerequisites** (ability or
  level) are disabled, with the reason.
- **Choice-driven features**: a class or subclass `optionalfeatureProgression`
  (fighting styles, invocations, metamagic, …) becomes a picker limited to the
  count for your level, with level prerequisites checked.
- **Expertise** features offer skill picks from your current proficiencies
  (doubling the bonus).
- A per-class **Spells** sub-tab with slots, limits and pick lists.
- **Weapon Mastery** (2024): a "Weapon Mastery" class-table column becomes a
  picker over mastery-property weapons, and the property shows on the sheet's
  attack lines.
- **+ Add Another Class** multiclasses: each class gets its own section, level,
  subclass, features, ASI slots and spell picks. HP uses the multiclass rule
  (only the first class's first level is maxed), casting classes share
  multiclass spell slots, and the incoming class's **multiclass ability
  prerequisites** (including either/or forms) are enforced.

### Background

- A dropdown pick with description, Skill / Tool / Language proficiency lines
  and skill dropdowns.
- **Tool pickers** for choose/any-category grants (SRD artisan, gaming and
  instrument tables).
- Granted-feat accordions (with their ability choices) and the 2024 **Ability
  Scores** choices.
- **Suggested Characteristics** tables (2014-style personality / ideal / bond /
  flaw rows): click to pick, or roll one into your details.
- A **custom background builder**: a name and description, granting 2 any-skill
  picks, a tool and a standard language through the same pickers.
- Editable **Character Details** (alignment, faith, lifestyle), **Physical &
  Personal Characteristics** and **Notes**, all shown on the sheet.

### Species (Race in 2014)

- The chosen species with trait accordions, **Change Species**, skill and
  ability choices, and subraces.
- **Language pickers** for "choose/any N language" grants (offering the SRD
  standard and exotic tables).
- **Species-granted spells** (`additionalSpells`): innate grants are listed, and
  choice grants (High Elf cantrip style) get spell dropdowns.

### Abilities

- Method dropdown (point buy, standard array, roll, manual), a centred
  **Points Remaining** counter, and per-ability selects with live totals.
- **Score Calculations** cards itemise every bonus source, with editable
  **Set Score** (replaces the base), **Other Modifier** (a flat extra) and
  **Override Score** (wins over everything) rows per ability.

### Equipment

- A Starting Equipment accordion, item search, and a **Current Inventory** list
  with type lines, quantities and wear/wield toggles.
- A **five-coin purse** (CP / SP / EP / GP / PP with a live gp total).
- **Total Weight vs. carrying capacity** (Str × 15, with an over-capacity warning).

### What's Next

A completion checklist (open skill, spell and ASI picks) with Save / Full Sheet
/ Export actions.

## Character sheet

The full-page sheet (`/sheet/:id`) follows D&D Beyond's layout:

- Across the top: the six ability cards, Proficiency Bonus, Walking Speed,
  **Heroic Inspiration** and a **Hit Points** box (Heal / Damage by amount,
  current / max, temp).
- Down the side: saving throws (with species notes such as Fey Ancestry's
  advantage), senses, proficiencies and the skill list.
- Initiative, Armor Class and **Defenses & Conditions** (add and remove active
  conditions) above a tabbed panel:
  - **Actions**: filter pills (All / Attack / Action / Bonus Action / Reaction /
    Other / Limited Use); an Attack · Range · Hit/DC · Damage table of equipped
    weapons, damaging cantrips and attack-roll spells with their origin
    ("Cantrip · Magic Initiate (Wizard)"), custom attacks and Unarmed Strike.
    Unequipped weapons are one click from the table. Then the bonus-action,
    reaction and other spells, and ritual spells.
  - **Spells**: modifier, spell attack and save DC, then a Time · Range ·
    Hit/DC · Effect · Notes table per level with that level's slot pips,
    including the subclass's always-prepared spells.
  - **Inventory**, **Features & Traits** (filter by class features, species
    traits, feats), **Background**, **Notes**, **Extras**.

### Playing from the sheet

The sheet is playable, not just printable.

- **+ Add Spell** / **+ Add Item** search the imported content and add directly.
  The spell search **sticks to the caster's spell list** (the same
  `sources.json` mapping, flood guard and castable-level cap as the builder). In
  a multiclass build an "Add for" dropdown picks the caster class, and the pick
  is tagged to it. Non-casters get no spell menu.
- Clicking a weapon, item or spell expands its full detail card inline.
- **Inventory** rows have quantity / equip / remove controls, an **Attune**
  toggle on items that require attunement (3-item limit enforced; an attunement
  item's modifiers apply only while attuned), and **charge pips** on items with
  charges (restored by a long rest).
- **Containers:** like D&D Beyond, the Inventory tab lists what the character
  carries under **Equipment** and gives every container its own section with
  its **load vs. capacity**. Drag an item's grip onto a section, or open the
  item and pick **Move to**, to pack it. Containers **nest** (cycle-safe), and
  anything inside a weightless (Bag of Holding style) container doesn't count
  toward carry weight.
- **Encumbrance:** carried weight past the variant-encumbrance thresholds
  **reduces speed** automatically (−10 / −20 / crawl at the Str × 15 cap,
  flagged on the Speed box). A per-character **Variant encumbrance** toggle on
  the Inventory tab turns the steps off (D&D Beyond imports follow the
  character's setting).
- The Inventory tab ends with the editable **purse**, the weight-vs-capacity
  line, and a **custom item** mini-form (name / weight / damage; damaging items
  join the attack list).
- Spell rows tag **Feat** and **Species** grants and **Ritual** spells; cantrips
  show their **damage dice scaled to your level** (for example 2d8 at level 5).
- The Actions tab also holds **custom attacks** (name / to-hit / damage,
  rollable like weapons), and the **Extras** tab attaches imported creatures
  (companions, familiars) as mini statblocks with their traits and actions.
- **Level Up** in the header raises a class level (a per-class menu when
  multiclassed). New choices are then made in the builder.
- **Everything rolls:** click any skill, save, ability modifier, attack to-hit
  or damage expression to roll it. Results appear in a dice toast, and an
  **Adv / Dis** toggle in the header applies to every d20. (Damage without dice,
  like an unarmed strike's flat 1, isn't rollable.) Skills with **item-granted
  advantage** (parsed from equipped items' "advantage on … checks" text) show an
  *adv* marker and roll with advantage automatically.
- **Effect toggles:** Mage Armor-style spells (any known spell whose text sets a
  base AC formula, "base Armor Class becomes 13 + Dexterity…") appear as toggle
  pills. Switch one on when cast and the AC calculation picks the best formula.
- **The HP box is a tracker.** Heal / Damage by an amount (temp HP absorbs
  damage first). Click current / max for a strip with temp HP, **Short / Long
  Rest** buttons (a long rest keeps inspiration and conditions) and a **hit-dice
  pool** per class ("Spend" rolls the die + Con and heals).
- **Death saves:** at **0 HP** the strip shows death saves. Roll them (a natural
  1 is two failures, a natural 20 brings you back at 1 HP); damage taken while
  down adds a failure, and healing clears them. Damage is stored as "taken", so
  levelling up keeps the wound.
- **Spell slots render as pips** on the Spells tab (the shared multiclass table
  is shown once, pact slots separately), and **class resources** (Rage, Ki and
  similar class-table columns) render as pips on the Actions tab. Click to spend
  or restore (the Limited Use filter). A long rest clears everything; a short
  rest restores pact slots and short-rest resources (Ki / Focus, Channel
  Divinity, Superiority Dice, Second Wind).

Edits on a saved character's sheet are saved immediately; edits on the draft
flow into the builder as usual. Interactive controls are hidden when printing.

## Characters

- **Save current draft**, and for each saved character: **View** (the full-page
  sheet), **Load** (into the builder), **Duplicate**, **Export** (JSON) and
  **Delete**.
- **Print** on the sheet prints just the sheet.
- Import a finished character from a **D&D Beyond link**, or with **Import
  file…** from D&D Beyond's character JSON, a D&D Beyond PDF export, or a
  character JSON exported from here. See
  [Importing from D&D Beyond](../README.md#importing-from-dd-beyond) and, for
  how the mapping works, [DEVELOPMENT.md](DEVELOPMENT.md#dd-beyond-import).

## Rules editions

Both Classic (2014) and One (2024) rules are supported (`engine/edition.ts`).
In 2024, ability score increases move from the race to the background, "Race"
becomes "Species", and weapon mastery is added.
