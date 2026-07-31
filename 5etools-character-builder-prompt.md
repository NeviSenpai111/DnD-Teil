# 🐉 Project Brief: 5eTools Importer + Character Builder

> Paste this whole file into Claude Code as the initial project brief. Adjust the
> **Configurable Decisions** block first if any default doesn't match what you want.

---

## ⚙️ Configurable Decisions (edit these before running)

| Decision | Default | Alternatives |
|---|---|---|
| App type | Web app (local-first, runs in browser) | Tauri desktop app, Electron |
| Frontend | React + TypeScript + Vite | SvelteKit, Vue, plain TS |
| Styling | Tailwind CSS | CSS modules, shadcn/ui |
| State | Zustand | Redux Toolkit, Jotai |
| Persistence | IndexedDB via Dexie | localStorage (small), SQLite (Tauri) |
| Rules edition | Support both `classic` (2014) and `one` (2024) via `_meta.edition` | classic only |
| Scope of v1 | General content importer/renderer **+** character builder | builder only |

**TypeScript is non-negotiable.** The 5eTools schema is deep and irregular; types prevent a class of bugs that will otherwise eat days.

---

## 🎯 Goal

Build a tool that works like D&D Beyond for character creation, but the source content is **imported from 5eTools JSON files** (downloadable, cleanly structured). The importer must handle the *full* 5eTools content model (vehicles, monsters, items, spells, classes, races, backgrounds, feats, etc.), and the character builder is the headline feature layered on top.

A user should be able to:
1. Import one or more 5eTools JSON files (official-format or homebrew).
2. Toggle which **sources** are active.
3. Browse and render any imported content as clean statblocks/cards.
4. Build a character step-by-step (race → class → background → abilities → skills → equipment → spells).
5. See all derived stats auto-calculated and view/export a character sheet.

---

## 📦 The 5eTools Data Format (read carefully — this is the hard part)

### Top-level shape
A file has a `_meta` block plus one or more **content-type arrays**:

```jsonc
{
  "_meta": {
    "sources": [{ "json": "...", "abbreviation": "...", "full": "...", "authors": [...], "version": "..." }],
    "edition": "classic" | "one",
    "dateAdded": 0
  },
  "vehicle": [ /* ... */ ],
  "monster": [ /* ... */ ],
  "spell":   [ /* ... */ ],
  "class":   [ /* ... */ ],
  "race":    [ /* ... */ ],
  "background": [ /* ... */ ],
  "item": [ /* ... */ ],
  "feat": [ /* ... */ ]
  // also: subclass, classFeature, subclassFeature, subrace, baseitem,
  // optionalfeature, reward, deity, object, trap, hazard, condition, action, language
}
```

Every entity carries a `source` string. The same `name` can exist in multiple sources, so **identity = `name` + `source`**.

### 🏷️ The tag system (build this FIRST)
Text strings embed inline tags shaped like `{@tag arg0|arg1|arg2|...}`. Args after the first are usually `|source|displayOverride`. Examples straight from real data:

- `{@atk rw}` / `{@atk mw}` → ranged / melee weapon attack
- `{@hit 6}` → `+6` to hit
- `{@h}` → renders the bold `Hit:` label
- `{@damage 6d8}` / `{@dice 1d20+5}` → rollable dice
- `{@dc 15}` → `DC 15`
- `{@spell fireball}` / `{@item longsword}` / `{@creature goblin}` / `{@condition prone}` / `{@skill Perception}` → cross-reference links
- `{@spell fireball|xphb|fire ball}` → link with display override
- `{@b}`/`{@bold}`, `{@i}`/`{@italic}`, `{@note ...}` → formatting
- `{@scaledamage ...}`, `{@scaledice ...}` → spell upcasting

**Requirement:** a tokenizer that correctly handles nested braces and pipe-separated args, plus a renderer that turns each tag into UI (text, a styled span, a clickable reference, or a roll button). Ship it as a standalone, unit-tested module — everything else depends on it.

### 🧱 The `entries` structure (build this SECOND)
Descriptions are recursive `entries` arrays mixing plain strings (which contain tags) and typed objects:

```jsonc
"entries": [
  "Plain text with {@damage 6d8} inside.",
  { "type": "entries", "name": "Subheading", "entries": [ "..." ] },
  { "type": "list", "items": [ "...", "..." ] },
  { "type": "table", "colLabels": [...], "rows": [[...]] },
  { "type": "inset", "name": "...", "entries": [...] }
]
```

Build a **recursive entry renderer** that dispatches on `type` (`entries`, `list`, `table`, `inset`, `section`, `quote`, `image`, default = string→tagParser). This renderer + the tag parser together render *any* content type, so prove it early against the vehicle example.

### ⚠️ Advanced (defer to a later phase)
- **`_copy` / `_mod` patching**: entities can copy another entity and apply patch operations. Powerful but fiddly — phase it in later.
- **Class feature resolution**: `class` entries reference `classFeature`/`subclassFeature` objects by `name|className|source|level`; you must resolve and assemble them per level.

---

## 🧮 The Rules Engine (pure functions, no UI)

Implement as pure, unit-tested functions:

- Ability modifier: `floor((score - 10) / 2)`
- Proficiency bonus: `2 + floor((level - 1) / 4)`
- Skill mod: `abilityMod + (proficient ? PB : 0) + (expertise ? PB : 0)`
- Saving throw: `abilityMod + (proficient ? PB : 0)`
- Spell save DC: `8 + PB + spellAbilityMod`
- Spell attack: `PB + spellAbilityMod`
- Passive Perception: `10 + perceptionMod`
- Max HP: `(hitDieMax + conMod)` at L1, then `+ (avg or rolled hitDie + conMod)` per level
- Spell slots: from class `casterProgression` (full / half / third casters) + Warlock **Pact Magic** as a separate track
- Initiative, AC (from armor/items/Dex), attacks per action

**Edition branching:** `classic` (2014) and `one` (2024) differ a lot — 2024 puts ASIs on backgrounds, renames race→species, adds weapon mastery. Gate edition-specific logic behind the `_meta.edition` flag.

---

## 🪜 Character Builder Flow (D&D Beyond-style wizard)

1. Select active sources
2. Race / Species (+ subrace) → ability bonuses, size, speed, traits, proficiencies
3. Class (+ subclass at the right level) → hit die, proficiencies, features, spellcasting
4. Background → skills, tools, languages, equipment, feature
5. Ability scores → point-buy / standard array / roll / manual, then apply racial mods
6. Skills & proficiencies → choose from class+background pools, dedupe overlaps
7. Equipment → starting kit or gold
8. Spells (if caster) → cantrips, spells known/prepared, ritual handling
9. Feats / ASIs (respect variant-rule toggles)
10. Derived stats auto-computed → render sheet
11. Level-up flow → re-resolve features, HP, slots

---

## 🗂️ Suggested Architecture

```
src/
  data/
    types/          # TS interfaces for each 5eTools content type + _meta
    importer.ts     # parse files, merge sources, dedupe by name+source
    tagParser/      # {@...} tokenizer + tests
    entryRenderer/  # recursive entries renderer (React)
  engine/           # pure rules functions (modifiers, slots, HP) + tests
  store/            # Zustand: imported content, active sources, characters
  db/               # Dexie schema + load/save
  components/
    builder/        # wizard steps
    sheet/          # character sheet view
    browser/        # content browser + statblock cards
  App.tsx
```

---

## 🧗 Hardest Parts (call these out, do them early)
1. **Tag parser** — nested braces + pipe args. #1 risk. Test-driven.
2. **Recursive entry renderer** — arbitrary nesting.
3. **Source merge & dedupe** — identity = name+source; later, `_copy`/`_mod`.
4. **Class feature assembly** — resolving referenced features per level.
5. **Spellcasting variance** — known vs prepared vs pact magic.

---

## 🚦 Build Phases (ship incrementally, working app at each step)

- **Phase 0** — Scaffold, TS types for `_meta` + the content types in the sample, JSON import + source toggle UI.
- **Phase 1** — Tag parser + entry renderer. **Acceptance: render the sample Space Galleon vehicle (incl. its weapons/actions) correctly as a statblock.**
- **Phase 2** — Race + Background + ability scores + basic derived stats + sheet shell.
- **Phase 3** — Class + subclass + feature resolution + HP/level.
- **Phase 4** — Spellcasting (slots, known/prepared, spell list).
- **Phase 5** — Equipment, feats, level-up.
- **Phase 6** — Persistence (Dexie), multiple characters, export (JSON + printable sheet).
- **Phase 7 (advanced)** — `_copy`/`_mod`, homebrew authoring, schema validation.

---

## ✅ MVP Acceptance Criteria
- [ ] Import the provided sample JSON without errors and list its sources.
- [ ] Render the Space Galleon (with Antimatter Rifle + Mangonel) as a clean statblock, with `{@damage}` / `{@hit}` / `{@atk}` resolved.
- [ ] Build a level-1 character from imported race + class + background.
- [ ] All derived stats (mods, PB, AC, HP, saves, skills, passive perception) compute correctly.
- [ ] Character persists across reloads and can be exported as JSON.

---

## 🛠️ How to Work (instructions to the agent)
- Write **types first**, then the parser, then renderer, then engine, then UI.
- Keep the rules engine and tag parser **UI-free and unit-tested** — they're the foundation.
- Prefer small, reviewable commits per phase; leave the app runnable at each phase boundary.
- Don't hardcode official content — everything comes from imported JSON.
- When a schema field is ambiguous, infer from the **sample data**, leave a `// TODO:` note, and surface the assumption rather than guessing silently.
- Pause and ask before any large architectural change to the decisions table above.

---

## 📎 Reference: sample input
```json
{
  "_meta": {
    "sources": [
      { "json": "SpaceGalleonBrew", "abbreviation": "SGB", "full": "Space Galleon Homebrew", "authors": ["NeviSenpai"], "version": "1.0.0" }
    ],
    "edition": "classic"
  },
  "vehicle": [
    {
      "name": "Space Galleon with Antimatter Rifle",
      "source": "Homebrew",
      "vehicleType": "SPELLJAMMER",
      "dimensions": ["130 ft.", "30 ft."],
      "terrain": ["space", "sea", "air"],
      "capCrew": 20, "capCargo": 20, "cost": 3000000, "pace": 4, "speed": 35,
      "hull": { "ac": 15, "acFrom": ["wood"], "hp": 400, "dt": 15 },
      "weapon": [
        { "name": "Antimatter Rifle", "crew": 1, "count": 2, "ac": 15, "hp": 50,
          "costs": [{ "cost": 10000, "note": "Antimatter Rifle" }],
          "entries": ["It takes 1 action to fire it. After 5 consecutive shots the rifle needs to cool down for 3 turns."],
          "action": [{ "name": "Antimatter Shots", "entries": ["{@atk rw} {@hit 6} to hit, range 120/360 ft., one target. {@h}16 ({@damage 6d8}) necrotic damage."] }] },
        { "name": "Mangonel", "crew": 5, "ac": 15, "hp": 100,
          "costs": [{ "cost": 10000, "note": "mangonel" }, { "note": "stone" }],
          "entries": ["It takes 2 actions to load the mangonel, 2 actions to aim it, and 1 action to fire it."],
          "action": [{ "name": "Mangonel Stone", "entries": ["{@atk rw} {@hit 5} to hit, range 200/800 ft. (can't hit targets within 60 feet of it), one target. {@h}27 ({@damage 5d10}) bludgeoning damage."] }] }
      ]
    }
  ]
}
```
