# Development guide

How the code is laid out, how imports work, and how to test against real data.
For installing and using the app, see the [README](../README.md).

## Scripts

```bash
npm install            # install dependencies
npm run dev            # dev server with hot reload (http://localhost:5173)
npm test               # unit and acceptance tests (Vitest)
npm run test:watch     # tests in watch mode
npm run typecheck      # types only
npm run build          # typecheck + production build into dist/
npm run preview        # serve dist/ (http://localhost:4173)
npm run validate-data  # import a real 5eTools data/ tree and report (see below)
```

## Architecture

```
src/
  data/
    types/          TS interfaces for _meta + each content type
    importer.ts     classify files, parse, normalise, dedupe by identity
    copyResolver.ts _copy/_mod/_templates inheritance + _versions expansion
    contentIndex.ts identity / name+source / tag lookups + distinct sources
    featureResolver.ts  assemble class/subclass features per level
    reprints.ts     hide entries whose newer printing is imported
    tagParser/      {@...} tokenizer (TDD) + React TagRenderer
    entryRenderer/  recursive `entries` renderer
    exportCharacter.ts  JSON export/download
    characterSchema.ts  checks imported character JSON against the model
    pdfForm.ts      minimal PDF AcroForm reader (no dependency)
    ddbImport.ts    D&D Beyond PDF sheet -> Character
    ddbJson.ts      D&D Beyond character JSON: format, source ids, DDB's
                    ability-total and max-HP rules
    ddbJsonImport.ts  D&D Beyond JSON (file or link) -> Character
    characterImport.ts  picks the importer for a dropped file
  engine/           pure, unit-tested rules (modifiers, hp, armor,
                    spellcasting slots, character derivation, edition gating,
                    the typed modifier engine, optional-feature progressions)
  model/character.ts  the character = the player's CHOICES
  store/            Zustand: content, character draft + roster, selectors
  db/               Dexie schema + persistence + startup bootstrap
  components/       browser / builder / sheet / characters / common
```

Core idea: a character stores **choices**; all derived stats are recomputed by
`engine/character.ts` (`deriveCharacter`) from those choices plus the imported
content. The single recursive `EntryRenderer` + `TagRenderer` render any content
type.

`db/bootstrap.ts` hydrates the stores from IndexedDB on startup and autosaves
the content snapshot and the working draft (debounced). The saved-character
roster is written directly by the store's library actions.

### Editions

Both `classic` (2014) and `one` (2024) are supported and gated in
`engine/edition.ts`. Notably, ASIs come from the race (classic) or the
background (2024).

## Importing real 5eTools data

The importer handles real 5eTools dumps, not just the bundled samples.

- **Import the whole `data/` folder at once** with **Import folder…** (or pick
  files with **Import JSON…**). Every file kind in a 5eTools tree is recognised
  and reported instead of silently yielding nothing: content files,
  `spells/sources.json`, `index.json` maps, `book-*`/`adventure-*` prose, and
  `foundry*.json` VTT data. Foundry data is always skipped, because its entries
  share names with real content and would shadow it. The status line under the
  buttons shows counts per type and every warning (skipped entries, unresolved
  copies, failed mods).
- **Identity is per content type**, matching the site: class features are keyed
  by `name|source|className|classSource|level`, subclass features add the
  subclass, subclasses add their class, subraces their race, deities their
  pantheon, item types and properties their abbreviation. (A plain
  `name|source` key silently dropped hundreds of "Ability Score Improvement",
  "Spellcasting" and "Extra Attack" features and every 2014 subclass offered
  under a 2024 class.) Magic variants take their source from `inherits`;
  nameless "base" subraces (where, for example, the PHB Human's +1 to all
  abilities lives) are kept, named after their race and flagged
  `_isBaseVariant`.
- **`_copy` / `_mod` inheritance** is resolved over the full imported pool
  (`data/copyResolver.ts`), ported from the site's copy applier. Bases are found
  by full identity (cross-file); metadata (`page`, `srd`, `reprintedAs`, …) is
  only inherited via `_preserve`; a `null` child field deletes the base's; and
  every `_mod` mode the site supports is implemented: array ops, regex
  `replaceTxt` (tag-aware), `setProp`, scalar ops, and the bestiary ops
  (`addSkills`/`addSaves`/`addSenses`, `addSpells`/`replaceSpells`/`removeSpells`,
  `scalarAddHit`/`scalarAddDc`, `maxSize`, …) with `<$short_name$>`/`<$dc__con$>`
  variables. Monster `_templates` apply their root props and mods. Paths that
  would reach `Object.prototype` (`__proto__`, `constructor`, `prototype`) are
  refused, so a hostile homebrew file can't pollute the app.
- **`_versions`** expand into sibling entities: "Archmage (Familiar)", "Magic
  Initiate; Cleric", "Aasimar; Necrotic Shroud". Subrace versions are expanded
  against the subrace merged into its race and emitted as races ("Dragonborn
  (Black)"), exactly as the site lists them.
- **Feature refs** (`Name|Class||Level`, nested `refSubclassFeature` entries)
  are resolved with the site's defaults (an omitted source means PHB), so a
  2014 subclass picked under the 2024 class still lists its features.
- **Fluff, templates and glue data** (`*Fluff`, `monsterTemplate`, `itemEntry`,
  …) are imported and indexed for cross-references but hidden from the browser
  list and source counts.
- **Reprinted entries are hidden by default**, as on the site. An entry whose
  `reprintedAs` target is imported and enabled (the 2014 Fighter once the 2024
  one is loaded, the PHB Battle Master under either Fighter, PHB Fireball next
  to XPHB Fireball) is left out of the browser and the builder's pickers
  (`data/reprints.ts`). Tick **Show reprinted** under Sources to list them
  (dimmed), or disable the newer source to bring the originals back. Options a
  character already chose always resolve against the full pool. The browser
  shows each entry's source and, for class/subclass features, subclasses,
  subraces, deities and cards, the parent that makes same-named entries
  distinct.
- **Spell → class lists** come from the `spells/sources.json` reverse index
  (real spells have no inline `classes`). Import that file alongside the spell
  files and the spells step filters correctly per class; spells with no mapping
  fall back to inline `classes.fromClassList`. A spell with no class info at
  all is offered openly **only when nothing is known about the class's spell
  list**. Once any mapping or inline data names the class, unknown spells are
  excluded, so forgetting `sources.json` can't flood every class with every
  spell (the builder shows a warning telling you to import it). Spells
  **reprinted across sources** (for example PHB + XPHB) are collapsed to a
  single entry, preferring the casting class's own source, so each spell
  appears once.
- **Spell slots, cantrip and known/prepared counts** are driven by each class's
  own progression tables. `casterProgression: "artificer"` (also used by 2024
  half-casters, who round up) grants a 1st-level slot at level 1; 2024 classes'
  `preparedSpellsProgression` is read directly instead of approximated.
  Subclass casters (Eldritch Knight, Arcane Trickster) read their spellcasting
  from the subclass, so they get their cantrips and spells too.
- **2024 backgrounds** are fully supported: `choose.weighted` ability grants
  (+2/+1 or +1/+1/+1, assigned per slot in the builder) and background-granted
  **feats** (`{ "name; option|source": true }`) are parsed and applied.
- **Feats** apply their effects: flat and chosen ability increases, fixed skill /
  saving-throw / tool / language proficiencies, expertise, **free-choice skill
  grants** (Prodigy's choose-list, Skilled's "any 3 skills or tools", `any N`)
  and **granted spells** (`additionalSpells`). Magic Initiate's list choice plus
  cantrip and spell picks, and Fey Touched's fixed plus school-filtered picks,
  are chosen inline in the feat's accordion and appear on the sheet's Spells tab
  tagged "Feat". All feat choices are picked inline where the feat is shown
  (ASI slot or background accordion).
- **Starting equipment** is auto-granted from a background or class
  `startingEquipment` (both the 2024 A/B choice-group form and the 2014
  `defaultData` form); the Equipment step's "Add starting equipment" button
  populates the default loadout.
- **Tool / language / armor / weapon** proficiencies from race, background,
  class and feats are gathered and shown on the sheet. "Choose/any N language"
  grants are **pickable** wherever they come from (race, subrace, background or
  feat), and species `additionalSpells` grants appear on the sheet tagged
  **Species**.
- **A general modifier engine** (`engine/modifierEngine.ts`) resolves typed
  `bonus`/`set`/`proficiency`/`advantage` modifiers against targets
  (abilities, AC, initiative, speed, skills) with DDB-style stacking rules:
  bonuses add but same-source bonuses count once, `set` acts as a floor and
  the highest wins, and modifiers can carry equipment conditions (armored /
  unarmored / shield). **Equipped items feed it**: `bonusAc` (+1 rings, cloaks,
  armor) raises AC, `ability.static` set-scores (Headband of Intellect style
  items) floor an ability while worn (a manual Override Score still wins), and
  "advantage on X (Skill) checks" item text becomes an advantage marker on that
  skill. **Species passives** (`resist`/`immune` damage types, `darkvision`)
  surface as Defenses and Senses on the sheet.
- **Choice-driven class features**: a class or subclass
  `optionalfeatureProgression` (fighting styles, invocations, metamagic,
  maneuvers, artificer infusions, …) surfaces an interactive picker in the
  builder, filtered to the matching imported `optionalfeature` entries, with the
  cumulative count for your level (array and `{ "level": count }` progression
  forms), simple level prerequisites enforced, and picks shown on the sheet's
  Features tab. **The options themselves are not in the class file**: 5eTools
  ships them in the separate `optionalfeatures.json` (book content), so import
  that file alongside `class/class-*.json`. The picker says so (naming the
  feature type, for example `AI` = Artificer Infusion) when the options are
  missing, and imported ones get their own browser cards. Class features named
  **Expertise** offer skill picks from your current proficiencies and double the
  proficiency bonus on those checks.
- **Competing AC formulas**: Unarmored Defense-style features are detected from
  feature text ("your Armor Class equals N + your X modifier …" while not
  wearing armor) and the best formula wins: Barbarian 10+Dex+Con (shield
  allowed via "still gain this benefit"), Monk 10+Dex+Wis (lost with a shield),
  Draconic Resilience 13+Dex, and equivalent homebrew. Wearing armor always uses
  the armored formula.
- **Class resources** are parsed from `classTableGroups`: numeric columns that
  aren't known/prepared counts (Rages, Ki Points, Sorcery Points, Superiority
  Dice, …) become spendable pip trackers on the sheet, with the per-level
  maximum from the table.
- **Selection limits are enforced**, so you can only take what you're entitled
  to: cantrip and spell counts, "choose N" skill groups (a skill can't be picked
  twice or re-picked when already granted), point-buy budget, and feats (the
  same feat can't be taken in two ASI slots).

### Testing against a real data tree

`npm run validate-data` runs the whole pipeline over a real 5eTools `data/`
folder and prints a report: file kinds, entities per type, and every warning.
Point it at your copy with `FIVETOOLS_DATA`:

```bash
FIVETOOLS_DATA=/path/to/5etools/data npm run validate-data
```

Without `FIVETOOLS_DATA` it looks in `~/Dokumente/5ETools/data`, and **it skips
silently** if nothing is there. On 5eTools v2.37.0 it imports 24,854 entities
from 515 files with zero warnings, and asserts the cases above (all same-named
class features present, legacy subclasses resolving under 2024 classes,
versions expanded, Foundry files skipped).

## D&D Beyond import

The user-facing steps are in the
[README](../README.md#importing-from-dd-beyond). This section covers how the
mapping works.

Every imported character file is checked against the character model first
(`data/characterSchema.ts`). A field of the wrong type falls back to its
default and is listed in the import report, so a damaged file can't break the
roster.

### From a link or character JSON

**Characters → D&D Beyond link** takes a sheet link
(`dndbeyond.com/characters/<id>`) and imports the character directly. The
character's privacy must be **Public**. D&D Beyond's API only answers its own
origin (CORS), so the request goes through a relay in the Vite **dev and
preview servers** (`/ddb-character/<id>` in `vite.config.ts`: only that
endpoint, and no cookies are forwarded). On a static deployment without the
relay, open
`https://character-service.dndbeyond.com/character/v5/character/<id>`, save it
as a `.json` file and use **Import file…** instead; the same importer reads it.

The JSON is what D&D Beyond builds its own sheet from, so it maps far more
faithfully than the PDF (`data/ddbJson.ts` for the format,
`data/ddbJsonImport.ts` for the mapping):

- **Every entity names its book.** DDB source ids map to 5eTools sources, so a
  2024 "Sage" resolves to the XPHB background and a "Dagger" from the 2024 basic
  rules to the XPHB item, not whichever reprint was imported first. DDB's
  spellings are translated too ("Crossbow, Light", "Studded Leather",
  "Magic Initiate (Wizard)" → its `_versions` entry).
- **Ability scores** keep their real base values; DDB's *Other Modifier* and
  *Override Score* map onto the same fields here; ASIs, feat and species
  choices (including a 2024 background's +2/+1) are rebuilt as choices. The
  totals are computed with DDB's own rule, ported from its sheet code (see the
  [ability-score diagram](#how-dd-beyonds-sheet-works)), including dropping a
  legacy species' ASI when a 2024 background supplies it (which also sets the
  character's edition). Any ability the imported content can't reproduce (a
  Tome of Clear Thought's +2) is pinned with Override Score and reported with
  DDB's breakdown.
- **Proficiencies** come from DDB's typed modifiers and are dealt into the
  build's choice slots; **feat and species spells** land in the feat's own pick
  slots (Magic Initiate's list included); prepared class spells come over
  without the always-prepared ones the subclass already grants.
- **Inventory** keeps quantities, equipped/attuned state and **containers**;
  homebrew or third-party items become custom items that still attack correctly
  (category, melee/ranged, range).
- **At the table**: damage taken, temp HP, death saves, spent slots and hit
  dice, Heroic Inspiration, conditions, currency, details and notes, custom
  actions, companions, and DDB's encumbrance setting.

### From a PDF export

**Import file…** also takes a D&D Beyond **PDF export** (DDB's *Export → PDF*
on the character sheet). The PDF is the official fillable sheet with its form
fields filled in, so the importer reads the fields directly (`data/pdfForm.ts`,
a small AcroForm reader with no PDF dependency) rather than scraping page text.
Encrypted PDFs are rejected, and object streams (a DDB export re-saved by
Acrobat or Preview) are inflated via `DecompressionStream`, with a cap on how
far they may expand.

Mapping a sheet onto this app's model means turning *results* back into
*choices* (`data/ddbImport.ts`):

- **Everything is resolved against your imported content by name**, so import
  the 5eTools files first. A character imported against an empty library keeps
  its numbers but loses its class, species, items and spells.
- **Ability scores** are stored as base scores *plus* a matching Override Score
  (DDB's own escape hatch), so the totals match the sheet exactly no matter
  what the content computes. Clear the overrides on the Abilities page to hand
  them back to the builder; the base scores already have the race and feat
  bonuses backed out, so the totals stay put.
- **Skills, languages and tools** are dealt into the choice slots your race,
  background and class actually grant, most restrictive slot first. Anything
  with no slot to live in is reported.
- **Max HP** is matched exactly by fitting per-level hit-dice rolls, since DDB
  tracks a fixed total.
- **Spells**: a prepared caster's sheet lists everything the class *could*
  prepare, so when the list runs past the class's own prepared limit only the
  always-prepared entries are imported, and the rest are re-picked in the
  builder. Feat- and species-granted spells are reported rather than filed under
  the class.
- **Equipment** comes in with quantities and per-item weights; worn armour, a
  shield, attuned items and anything named in an attack row are marked
  equipped. Attack rows with no item or spell behind them become custom attack
  lines.
- **Feats** are placed into ASI slots in the order the sheet lists them. DDB
  doesn't record which slot each came from, so check the What's Next page.

Anything that can't be resolved is listed after the import instead of being
guessed at.

### Testing against a real character

`npm test` covers the mapping with an original fixture. To check it against a
real character, save its JSON **outside the repo** (never commit D&D Beyond
data) and run:

```bash
DDB_CHARACTER_JSON=/path/to/character.json \
FIVETOOLS_DATA=/path/to/5etools/data \
npx vitest run src/data/ddbRealCharacter.test.ts
```

Like `validate-data`, it skips silently unless both files exist.

### How D&D Beyond's sheet works

The diagrams below come from studying D&D Beyond's own character sheet
(character-app 1.72.9): a live capture of a public character loading, plus a
static read of the shipped bundle. They are also shown in the README.

| Diagram | What it shows |
|---|---|
| [Architecture](diagrams/ddb-sheet/01-architecture.svg) | React UI, Redux store, sagas, the selector engine and the three services it talks to. |
| [Load sequence](diagrams/ddb-sheet/02-load-sequence.svg) | Token, two parallel request waves, store writes, then LOADED. |
| [Derived-stat graph](diagrams/ddb-sheet/03-derived-stats.svg) | Raw JSON → modifier hub → abilities and proficiency → AC, HP, skills. |
| [Write path](diagrams/ddb-sheet/04-write-path.svg) | Optimistic commit to the store, then one fine-grained PUT, with the error branch. |
| [Ability-score formula](diagrams/ddb-sheet/05-ability-formula.svg) | The order bonuses, caps, set scores and overrides are applied in, with a worked INT example. This is the rule `data/ddbJson.ts` ports. |

## Security notes

- Imported files are untrusted. Homebrew is rendered as text (no
  `dangerouslySetInnerHTML`), `_copy`/`_mod` paths can't reach the prototype
  chain, character JSON is checked against the model, and PDF streams have an
  expansion cap.
- The built app ships a Content-Security-Policy `<meta>` tag (added at build
  time by `vite.config.ts`): only the app's own scripts run, and homebrew
  images may load from any `https:` host. To allow plain `http:` images, add
  `http:` to `img-src` there.
- Homebrew images load lazily and without a `Referer` header.
