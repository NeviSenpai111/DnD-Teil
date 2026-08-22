# Feature Gap Analysis — vs. D&D Beyond Character Builder

Cross-reference of `ddb-character-builder-feature-reference.md` against this
codebase. The **Quickbuilder / fast-path (§1.1)** is intentionally excluded per
request. Legend: ✅ done · 🟡 partial · ❌ missing.

Verified against `src/engine/*`, `src/components/builder/*`, `src/components/sheet/*`,
`src/store/*`, `src/model/character.ts`.

---

## The one-paragraph verdict

The build side is genuinely strong: four ability-score methods, build-at-any-level,
multiclassing with a real multiclass slot table + separate pact magic, class-list-aware
spell picking, feats that actually apply their effects, and a clean 2014/2024 edition
toggle (which already *beats* DDB's intermingled lists — see reference §17.1). The
sheet is now interactive (HP/temp/rests, slot pips, add-spell/item, level-up). The two
structural things missing are the same two the reference flags as highest-value: **(1) a
general modifier engine** (everything is hand-coded per source, so subclass/feature
mechanical effects don't propagate), and **(2) interactive choice prompts for
choice-driven class features** (Fighting Style, Invocations, Metamagic, Expertise,
Weapon Mastery…). Everything else is leaf features layered on those two.

---

## Prioritised "what to add" (recommended order)

Following the reference's own §19 ordering, adapted to what's already here:

1. ~~**Modifier engine** (§14)~~ — **DONE** (2026-07-31): `engine/modifierEngine.ts`
   resolves typed `bonus`/`set` modifiers against targets (abilities, AC, initiative,
   speed) with stacking rules (same-source bonuses count once; highest `set` wins as a
   floor) and equipment conditions (armored/unarmored/shield). Wired into
   `deriveCharacter`; equipped items emit `bonusAc` and `ability.static` set-scores;
   species `resist`/`immune`/`darkvision` surface as Defenses/Senses on the sheet.
   *Still open:* proficiency/advantage/resistance-type modifiers from features,
   toggleable modifiers, item-charge activation.
2. ~~**Choice-driven class features** (§3)~~ — **DONE** (2026-07-31) for
   `optionalfeatureProgression`-declared choices (Fighting Styles, Invocations,
   Metamagic, Maneuvers — anything with a `featureType`d `optionalfeature` pool):
   interactive picker per progression, count by level (both progression forms),
   level-prerequisite gating, multiclass-scoped keys, sheet display. **Expertise**
   features offer skill picks that double proficiency. *Still open:* Weapon Mastery
   (2024), non-level prerequisites (pact/spell), and choices embedded only in feature
   text with no structured data (Totem-style entry lists).
3. ~~**Competing AC formulas**~~ — **DONE** (2026-07-31): `engine/acFormulas.ts` detects
   Unarmored-Defense-style formulas from feature text (one pattern covers Barbarian,
   Monk, Draconic Resilience and homebrew); `bestArmorClass` picks the best candidate,
   respecting shield compatibility and armor exclusivity. *Still open:* Mage Armor
   (needs a cast-state toggle).
4. ~~**Sheet dice roller** (§12)~~ — **DONE** (2026-07-31): every skill, save, ability
   mod, attack to-hit and damage expression rolls on click, with an Adv/Dis header
   toggle and a result toast. *Still open:* 3D/shared dice (out of scope).
5. ~~**Class resource tracking**~~ — **DONE** (2026-07-31): numeric `classTableGroups`
   columns (excluding known/prepared counts) become spendable pip trackers; long rest
   restores all, short rest restores Ki/Focus/Channel/Superiority/Second Wind by name
   heuristic (the data has no recharge rule). *Still open:* text-only resources with no
   table column (Wild Shape 2/rest, Lay on Hands pool), magic-item charges.
6. ~~**Death saves + hit-dice pool**~~ — **DONE** (2026-07-31): at 0 HP the HP strip
   tracks death saves (rollable; nat 1 = 2 failures, nat 20 = up at 1 HP; damage while
   down = a failure; healing clears); hit dice are spendable per class (roll + Con
   heals). Simplification: a long rest restores all dice, not RAW's half.
7. ~~Leaf items~~ — **DONE** (2026-07-31): language selection (race/subrace/background
   "choose/any N" grants pickable against the SRD standard/exotic tables; feat language
   choices still summarised), species-granted spells (`additionalSpells` on races —
   innate grants + choice dropdowns, tagged **Species** on the sheet), CP/SP/EP/GP/PP
   currency with gp conversion (builder + sheet; legacy `gold` migrates to gp),
   attunement (3-item limit; attunement-item modifiers apply only while attuned),
   ritual flag + cantrip-dice multiplier display, and carrying capacity / encumbrance
   thresholds (display only — no automatic speed penalty).
8. ~~Remaining candidates~~ — **DONE** (2026-07-31): multiclass prerequisite gating
   (the incoming class's ability minimums, incl. `or` groups), feat prerequisite
   validation (ability/level; other kinds shown but not validated), Weapon Mastery
   (count from the class table; picks from mastery-property weapons; shown on attack
   lines), 2014 characteristics tables (pick-or-roll into the detail fields), a custom
   background builder (2 any-skills + tool + language via the standard pickers),
   tool-category pickers (SRD artisan/gaming/instrument tables), containers
   (single-level packing; weightless containers exclude contents from carry weight),
   magic-item charges (pips; long-rest recharge), custom items (name/weight/damage)
   and custom attacks (rollable), and an Extras tab attaching imported creatures with
   mini statblocks.
9. ~~The 🟡 edges~~ — **DONE** (2026-07-31): toggleable effects (Mage-Armor-style AC
   formulas detected in known spells' text become sheet "Effects" toggles), feat
   language choices (pickable in ASI slots / background feat accordions), nested
   containers (cycle-safe packing, ancestor-aware weightless rule, load-vs-capacity
   line), per-spell cantrip dice (the first `{@damage}` tag scaled to character level
   on the sheet), variant-encumbrance speed penalties (−10/−20/crawl applied to
   derived speed), and proficiency/advantage-type modifiers (advantage parsed from
   item text, marked on skills, auto-applied to rolls).
10. What's left is only the out-of-scope column (campaign/VTT/marketplace/shared dice)
   and small notes in the tables: feature-granted spells/resistances from items,
   ad-hoc custom resource counters, half-proficiency, per-skill manual overrides,
   capacity hard-blocking, and non-ability prerequisite kinds.

---

## Category-by-category

### Setup (§2)
| Feature | Status | Notes |
|---|---|---|
| Ability method (array/point-buy/manual/roll) | ✅ | `PageAbilities` — incl. in-app 4d6-drop-lowest roller |
| HP method (fixed/rolled) | ✅ | `hpMode` |
| Ruleset 2014/2024 selection | ✅ | Edition toggle; cleaner than DDB's intermingled lists |
| Build at any level 1–20 | ✅ | `setClassLevel` |
| Homebrew enable | ✅ (implicit) | all content is user-imported |
| Source/content toggling | 🟡 | source **filter** in browser; no per-character legal-source gating |
| Encumbrance variant | ✅ | variant thresholds auto-apply speed penalties (−10/−20/crawl) |
| Campaign / privacy / avatar / backdrop | ❌ | out of scope (single-user, local) |

### Class (§3)
| Feature | Status | Notes |
|---|---|---|
| All classes, both rulesets | ✅ | from imported data |
| Subclass at correct level | ✅ | |
| Auto-granted features per level | ✅ | `featureResolver` lists them |
| **Feature choice prompts** | ✅ | via `optionalfeatureProgression` pickers (count, level gates, multiclass keys) |
| **Weapon Mastery (2024)** | ✅ | count from class table; picker; mastery shown on sheet attack lines |
| Multiclassing | ✅ | independent levels, multiclass HP |
| Multiclass spell slot table | ✅ | `multiclassSpellSlots` |
| Warlock Pact Magic separate pool | ✅ | `pactSlots` + separate pips |
| **Multiclass prereq validation** | ✅ | incoming class's minimums (incl. `or` groups) block the add with the reason |
| **Class resource definitions** | 🟡 | table-column resources tracked as pips; text-only pools (Wild Shape, Lay on Hands) TODO |

### Species (§4)
| Feature | Status | Notes |
|---|---|---|
| Species + subrace | ✅ | `PageSpecies` |
| Trait display (speed/darkvision/resistance) | 🟡 | resistances/immunities/darkvision now applied + shown (Defenses/Senses); innate spells still text |
| **Species-granted spell choices** | ✅ | race/subrace `additionalSpells`: innate + choice picks, "Species" tag on sheet |
| **Variable ancestry pickers** | ❌ | Dragonborn ancestry/breath, Genasi element, Goliath |
| **Customize Your Origin** | ❌ | reassign ASIs / swap profs / swap languages |

### Background & Origin (§5)
| Feature | Status | Notes |
|---|---|---|
| 2024 backgrounds (skills/tool/feat/ASI-choice) | ✅ | weighted ASI + granted feat parsed |
| 2014 legacy backgrounds | 🟡 | skills/feat yes; characteristics **tables** no |
| Character detail fields (alignment/faith/etc.) | ✅ | free-text, on the sheet |
| **Personality/Ideal/Bond/Flaw pick-or-roll** | ✅ | tables detected in background entries; click-to-pick + roll |
| **Language selection UI** | ✅ | race/subrace/background/feat choose/any grants all pickable (SRD tables) |
| **Custom Background builder** | ✅ | name/description + 2 any-skills, tool and language via standard pickers |

### Abilities (§6)
| Feature | Status | Notes |
|---|---|---|
| Point buy w/ live budget | ✅ | enforced |
| Standard array / manual / roll | ✅ | |
| Other Modifier / Override Score | ✅ | Score Calculations cards |
| Set Score (manual) | ✅ | |
| **Set Score from items** | ✅ | `ability.static` on equipped items floors the score (override still wins) |
| Derived: mods/saves/skills/init/passive Perc/DC/attack | ✅ | |
| Passive Investigation/Insight, jump, carry capacity | ❌ | minor |

### Feats (§7)
| Feature | Status | Notes |
|---|---|---|
| ASI-vs-feat at ASI levels | ✅ | `AsiSlot` |
| Origin feats (2024 background) | ✅ | |
| Feats apply effects (ability/skill/save/expertise/spells) | ✅ | incl. free-choice skill grants & granted spells |
| **Prerequisite validation** | ✅ | ability/level checked, feat disabled with reason; other kinds not validated |
| **Repeatable feats** | 🟡 | actively *prevented* from double-take; no true repeatable support |
| Fighting Style / Epic Boon categories | ❌ | not categorised |
| Feat tool/language free-choices pickable | ❌ | summarised only (README TODO) |

### Proficiencies (§8)
| Feature | Status | Notes |
|---|---|---|
| Skill selection + duplicate detection | ✅ | class/background skill dropdowns |
| **Expertise selection UI** | ✅ | Expertise features offer picks from proficient skills; bonus doubles |
| **Half-proficiency** (Jack of All Trades) | ❌ | |
| **Tool-category → specific-item pickers** | ✅ | background choose/any grants pick from SRD tool tables |
| **Manual per-skill proficiency override** | ❌ | |
| Saving throws | 🟡 | multiclass: first class only |

### Equipment & Inventory (§9)
| Feature | Status | Notes |
|---|---|---|
| Starting equipment packages | 🟡 | takes **first** of each A/B choice |
| Item catalogue + search | ✅ | |
| Equip toggle affecting AC | ✅ | |
| Auto attack list (weapons + unarmed) | ✅ | `attacks.ts` |
| Total weight | ✅ | |
| Starting gold (rolled) + in-builder shop | 🟡 | gold mode exists; no roll/shop |
| **Attunement + 3-slot limit** | ✅ | sheet Attune toggle; item modifiers gated on attunement |
| **Containers (nested)** | ✅ | nested cycle-safe packing; ancestor weightless rule; load vs capacity shown (not hard-blocked) |
| **Encumbrance thresholds/variant** | ✅ | thresholds applied to derived speed; state shown on the Speed chip |
| **Currency CP/SP/EP/GP/PP + conversion** | ✅ | five-coin purse + gp total (builder & sheet); legacy gold migrates |
| **Custom items with modifiers** | 🟡 | name/weight/damage (joins the attack list); no modifiers |
| **Magic-item charges** | ✅ | charge pips per item; long rest restores (recharge string not parsed) |
| **Item-granted modifiers** (AC/set-score/spells) | 🟡 | `bonusAc`, `ability.static`, text-derived advantage; granted spells/resistances TODO |
| **Custom attacks/actions** | ✅ | name/to-hit/damage rows on the sheet, rollable like weapons |

### Spells (§10)
| Feature | Status | Notes |
|---|---|---|
| Class spell lists, filtered | ✅ | `sources.json` mapping + flood guard + level cap |
| Slots incl. multiclass + Pact Magic | ✅ | |
| Feat/non-class spell sources, tagged | ✅ | "Feat" tag |
| Spell cards (time/range/components/duration/concentration) | ✅ | `SpellDetail` |
| Homebrew spells | ✅ | imported |
| Save DC / attack bonus per source | ✅ | |
| Known vs Prepared + preparation counter | 🟡 | progression read; swap-on-level-up & strict prepared cap not enforced |
| **Ritual flag** | ✅ | badge on spell cards + sheet rows |
| **Cantrip damage scaling by level** | ✅ | per-spell scaled dice (e.g. 2d8) shown on sheet cantrip rows |
| **Advanced spell search** (school/time/concentration/ritual) | ❌ | name/type/source only |
| Non-class spell own casting ability for DC | 🟡 | feat spells don't use chosen ability (README TODO) |

### Sheet (§12)
| Feature | Status | Notes |
|---|---|---|
| Live recalculation | ✅ | |
| HP / temp HP / damage / heal | ✅ | just built |
| Short & long rest | ✅ | slots + resources + hit dice + death saves (recharge rule is a name heuristic) |
| Spell-slot tracking (pips) | ✅ | shared multiclass table + pact |
| Level-up | 🟡 | bumps level; doesn't prompt new choices (deferred to builder) |
| Print/PDF | ✅ | browser print, sheet-only |
| **Integrated dice roller (adv/dis)** | ✅ | skills/saves/abilities/attacks/damage + hit dice/death saves; Adv-Dis toggle |
| **Death saves** | ✅ | at 0 HP: rollable, damage-as-failure, healing clears |
| **Hit-dice pool tracking** | ✅ | per-class spend (roll + Con heals); long rest restores all (RAW: half) |
| **Conditions + 2024 exhaustion** | ❌ | |
| **Custom resource counters** | 🟡 | class-table resources auto-tracked; ad-hoc custom counters TODO |
| **Inspiration toggle** | ❌ | |
| **Extras** (companions/summons/wild shape) | ✅ | attach imported creatures; mini statblock with traits/actions |

### Engine (§14) — highest leverage
| Feature | Status | Notes |
|---|---|---|
| **General modifier system** (type/target/value/condition) | ✅ | `bonus`/`set`/`proficiency`/`advantage` with equipment conditions |
| **Modifier stacking rules** | ✅ | same-source bonuses count once; highest `set` wins as a floor |
| **Competing AC formulas** | ✅ | features + Mage-Armor-style spells (as toggles); best formula wins |
| Level-gated unlocks | 🟡 | features by level yes; spell/trait gating partial |
| Duplicate-grant detection | 🟡 | skills only; not cross-source generally |
| **Conditional / toggleable modifiers** | ✅ | equipment conditions + spell-effect toggles on the sheet |

### Data (§15) — the differentiator, done
| Feature | Status | Notes |
|---|---|---|
| JSON import (5eTools) | ✅ | incl. `_copy`/`_mod` resolution |
| **D&D Beyond character import** | ✅ | reads a DDB PDF export's form fields; see [Importing a D&D Beyond character](README.md#importing-a-dd-beyond-character) |
| JSON export / re-import | ✅ | round-trips a character through the same Import button |
| Character duplicate | ✅ | |
| Local persistence + **offline** | ✅ | Dexie; the key advantage over DDB |

---

## What to skip (reference agrees — §12/§19)
Campaign management, VTT/Maps embedding, 3D/shared dice, content marketplace,
Master-Tier content sharing, avatar/backdrop uploads, XP/character log. Out of scope
for a single-user local tool.
