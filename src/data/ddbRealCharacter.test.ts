/**
 * Acceptance run: import a real D&D Beyond character JSON against a real
 * 5eTools `data/` directory and check the result against DDB's own numbers.
 *
 * Skipped unless both exist. Save a public character's JSON from
 * `https://character-service.dndbeyond.com/character/v5/character/<id>` and run
 *
 *   DDB_CHARACTER_JSON=/path/to/character.json npx vitest run src/data/ddbRealCharacter.test.ts
 *
 * (`FIVETOOLS_DATA` overrides the data directory, as for `npm run validate-data`).
 * Neither file belongs in the repo — both are official content.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { importFiles } from "./importer";
import { mergeEntities } from "../store/contentStore";
import { ContentIndex } from "./contentIndex";
import { asDdbCharacter, ddbAbilityTotals, ddbMaxHp, ddbSkillId, activeModifiers } from "./ddbJson";
import { characterFromDdbJson } from "./ddbJsonImport";
import { deriveFromCharacter } from "../store/selectors";
import { abilityMod } from "../engine/modifiers";
import { SKILLS } from "../engine/constants";

const DATA_DIR = process.env.FIVETOOLS_DATA ?? join(homedir(), "Dokumente", "5ETools", "data");
const CHARACTER = process.env.DDB_CHARACTER_JSON ?? "";
const available =
  existsSync(DATA_DIR) && statSync(DATA_DIR).isDirectory() && CHARACTER !== "" && existsSync(CHARACTER);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.toLowerCase().endsWith(".json")) out.push(p);
  }
  return out;
}

/** Import the content and the character (only when both files are present). */
function load() {
  const result = importFiles(walk(DATA_DIR).map((p) => ({ name: relative(DATA_DIR, p), text: readFileSync(p, "utf8") })));
  const entities = mergeEntities([], result.entities, []);
  const index = new ContentIndex(entities, result.metaSources, result.spellClasses);
  const ddb = asDdbCharacter(readFileSync(CHARACTER, "utf8"))!;
  const { character, warnings } = characterFromDdbJson(ddb, index);
  return { index, ddb, character, warnings, derived: deriveFromCharacter(character, index) };
}

describe.skipIf(!available)(`D&D Beyond character ${CHARACTER}`, () => {
  const { ddb, character, warnings, derived } = available ? load() : ({} as ReturnType<typeof load>);
  if (!available) return;

  console.log(
    [
      `\n=== ${character.name}: ${character.classes.map((c) => `${c.name} ${c.level}${c.subclass ? ` (${c.subclass.name})` : ""}`).join(" / ")} ===`,
      `species ${character.race?.name ?? "-"} (${character.race?.source ?? ""})  background ${character.background?.name ?? character.customBackground?.name ?? "-"} (${character.background?.source ?? ""})  edition ${character.edition}`,
      `abilities ${JSON.stringify(derived.abilities)}  HP ${derived.maxHp}  AC ${derived.ac}  PB ${derived.pb}`,
      `skills ${derived.proficientSkillIds.join(", ")}`,
      `languages ${JSON.stringify(derived.proficiencies.languages)}`,
      `tools ${JSON.stringify(derived.proficiencies.tools)}`,
      `inventory ${character.inventory.map((i) => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}${i.equipped ? " [E]" : ""}${i.containedIn ? " (packed)" : ""}${i.ref ? ` ${i.ref.source}` : " custom"}`).join(", ")}`,
      `spells ${[...character.cantrips, ...character.spells].map((s) => `${s.name}|${s.source}`).join(", ")}`,
      `feat spells ${JSON.stringify(character.featSpells)} sets ${JSON.stringify(character.featSpellSets)}`,
      `warnings:`,
      ...warnings.map((w) => `  - ${w}`),
    ].join("\n"),
  );

  it("reproduces D&D Beyond's ability totals", () => {
    expect(derived.abilities).toEqual(ddbAbilityTotals(ddb));
  });

  it("reproduces D&D Beyond's max HP", () => {
    expect(derived.maxHp).toBe(ddbMaxHp(ddb, abilityMod(derived.abilities.con)));
  });

  it("is proficient in every skill D&D Beyond lists", () => {
    const ids = new Set(SKILLS.map((s) => s.id));
    const wanted = activeModifiers(ddb)
      .filter((m) => m.type === "proficiency" && m.subType && ids.has(ddbSkillId(m.subType)))
      .map((m) => ddbSkillId(m.subType!));
    for (const id of wanted) expect(derived.skills[id]?.proficient, id).toBe(true);
  });

  it("resolves the class, species and background", () => {
    expect(character.classes.length).toBe(ddb.classes?.length);
    if (ddb.race) expect(character.race).toBeDefined();
    if (ddb.background?.definition && !ddb.background.hasCustomBackground) expect(character.background).toBeDefined();
  });
});
