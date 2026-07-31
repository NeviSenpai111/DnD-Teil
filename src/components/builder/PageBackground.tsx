import { useActiveEntities, useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import { backgroundFor, listByType, resolveCharacterFeats } from "../../store/selectors";
import type { Background } from "../../data/types/character-content";
import type { CharacterDetails } from "../../model/character";
import { Entries } from "../../data/entryRenderer/EntryRenderer";
import { abilityChoiceDefs } from "../../engine/character";
import { characteristicTables } from "../../engine/characteristics";
import { readNamedGrants } from "../../engine/proficiencies";
import { Accordion, subtitleParts } from "./Accordion";
import { AbilityChoices } from "./AbilityChoices";
import { SkillChoiceSelects, fixedSkillIdsOf, skillName } from "./SkillChoices";
import { FeatSpellPicker } from "./FeatSpellPicker";
import { LanguageChoiceSelects } from "./LanguageChoices";
import { ToolChoiceSelects } from "./ToolChoices";

/**
 * 2014-style suggested-characteristics tables: pick a row or roll one, writing
 * into the matching character-detail field (shown in the accordions below).
 */
function Characteristics({ background }: { background: Background }) {
  const setDetail = useCharacterStore((s) => s.setDetail);
  const tables = characteristicTables(background);
  if (tables.length === 0) return null;

  return (
    <Accordion title="Suggested Characteristics" subtitle={subtitleParts(`${tables.length} Tables`)}>
      <div className="space-y-3">
        {tables.map((table) => (
          <div key={table.field}>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wide text-ink/50">{table.label}</h4>
              <button
                type="button"
                onClick={() =>
                  setDetail(
                    table.field,
                    table.options[Math.floor(Math.random() * table.options.length)],
                  )
                }
                className="rounded border border-blood/40 px-1.5 py-0.5 text-[10px] font-bold uppercase text-blood hover:bg-blood/10"
              >
                🎲 Roll {table.label}
              </button>
            </div>
            <ul className="mt-1 space-y-0.5">
              {table.options.map((option, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => setDetail(table.field, option)}
                    className="w-full rounded px-1 py-0.5 text-left text-sm text-ink/80 hover:bg-blood/10"
                    title={`Use as your ${table.label.toLowerCase()}`}
                  >
                    <span className="mr-1 text-xs text-ink/40">{i + 1}.</span>
                    {option}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Accordion>
  );
}

const ALIGNMENTS = [
  "Lawful Good",
  "Neutral Good",
  "Chaotic Good",
  "Lawful Neutral",
  "True Neutral",
  "Chaotic Neutral",
  "Lawful Evil",
  "Neutral Evil",
  "Chaotic Evil",
];

const LIFESTYLES = [
  "Wretched",
  "Squalid",
  "Poor",
  "Modest",
  "Comfortable",
  "Wealthy",
  "Aristocratic",
];

export function PageBackground() {
  const entities = useActiveEntities();
  const index = useContentStore((s) => s.index);
  const draft = useCharacterStore((s) => s.draft);
  const setBackground = useCharacterStore((s) => s.setBackground);
  const setCustomBackground = useCharacterStore((s) => s.setCustomBackground);

  const backgrounds = listByType(entities, "background");
  const chosen = backgroundFor(draft, index);
  const isCustom = !draft.background && !!draft.customBackground;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-ink">Choose Origin: Background</h2>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={draft.background ? `${draft.background.name}|${draft.background.source}` : ""}
          disabled={isCustom}
          onChange={(e) => {
            const [name, source] = e.target.value.split("|");
            setBackground(name ? { name, source } : undefined);
          }}
          className="block w-full max-w-md rounded border border-ink/20 bg-white px-2 py-2 text-sm disabled:opacity-50"
        >
          <option value="">— Choose a Background —</option>
          {backgrounds.map((b) => (
            <option key={`${b.name}|${b.source}`} value={`${b.name}|${b.source}`}>
              {b.name} ({b.source})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() =>
            setCustomBackground(
              isCustom ? undefined : { name: "Custom Background", description: "" },
            )
          }
          className={`rounded border px-3 py-1.5 text-sm ${
            isCustom ? "border-blood bg-blood/10 font-semibold" : "border-ink/20 hover:bg-blood/5"
          }`}
        >
          {isCustom ? "Use a published background" : "Build a custom background"}
        </button>
      </div>

      {isCustom && draft.customBackground && (
        <div className="space-y-2 rounded border border-blood/20 bg-white/50 p-3">
          <label className="block text-sm">
            <span className="font-semibold">Name</span>
            <input
              value={draft.customBackground.name}
              aria-label="Custom background name"
              onChange={(e) =>
                setCustomBackground({ ...draft.customBackground!, name: e.target.value })
              }
              className="mt-0.5 block w-full max-w-sm rounded border border-ink/20 bg-white px-2 py-1"
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold">Description</span>
            <textarea
              value={draft.customBackground.description}
              aria-label="Custom background description"
              onChange={(e) =>
                setCustomBackground({ ...draft.customBackground!, description: e.target.value })
              }
              rows={2}
              className="mt-0.5 block w-full rounded border border-ink/20 bg-white px-2 py-1"
            />
          </label>
          <p className="text-xs text-ink/60">
            A custom background grants 2 skills of your choice, a tool and a standard language —
            pick them below.
          </p>
        </div>
      )}

      {chosen && <BackgroundDetails background={chosen} />}

      <CharacterDetailAccordions />
    </div>
  );
}

function BackgroundDetails({ background }: { background: Background }) {
  const draft = useCharacterStore((s) => s.draft);
  const index = useContentStore((s) => s.index);

  const fixedSkills = fixedSkillIdsOf(background.skillProficiencies);
  const tools = readNamedGrants(background.toolProficiencies);
  const languages = readNamedGrants(background.languageProficiencies);
  const toolText = [...tools.fixed, ...tools.notes].join(", ");
  const langText = [...languages.fixed, ...languages.notes].join(", ");

  // 2024 backgrounds grant ability scores; feats granted by the background get
  // their own accordions below.
  const abilityDefs = draft.edition === "one" ? abilityChoiceDefs(background, "primary") : [];
  const grantedFeats = resolveCharacterFeats(draft, index).filter((rf) =>
    rf.keyPrefix.startsWith("bgfeat"),
  );

  return (
    <div className="space-y-4">
      {background.entries && (
        <div className="text-sm">
          <Entries entries={background.entries} />
        </div>
      )}

      {fixedSkills.length > 0 && (
        <p className="text-sm">
          <span className="font-bold">Skill Proficiencies:</span>{" "}
          {fixedSkills.map(skillName).join(", ")}
        </p>
      )}
      <SkillChoiceSelects prefixes={["background:"]} />
      {toolText && (
        <p className="text-sm">
          <span className="font-bold">Tool Proficiencies:</span> {toolText}
        </p>
      )}
      <ToolChoiceSelects />
      {langText && (
        <p className="text-sm">
          <span className="font-bold">Languages:</span> {langText}
        </p>
      )}
      <LanguageChoiceSelects prefixes={["background:lang"]} />
      <Characteristics background={background} />

      <div className="space-y-2">
        {grantedFeats.map(({ feat, keyPrefix }) => {
          const defs = abilityChoiceDefs(feat, keyPrefix);
          return (
            <Accordion
              key={keyPrefix}
              title={feat.name}
              badge="Granted Feat"
              subtitle={subtitleParts(defs.length > 0 && `${defs.length} Choices`)}
            >
              <div className="space-y-3">
                {defs.length > 0 && <AbilityChoices defs={defs} />}
                <SkillChoiceSelects prefixes={[`feat:${keyPrefix}:`]} />
                <FeatSpellPicker featRef={{ name: feat.name, source: feat.source }} keyPrefix={keyPrefix} />
                {feat.entries && <Entries entries={feat.entries} />}
              </div>
            </Accordion>
          );
        })}

        {abilityDefs.length > 0 && (
          <Accordion
            title="Ability Scores"
            subtitle={subtitleParts(`${abilityDefs.reduce((n, d) => n + d.count, 0)} Choices`)}
            defaultOpen={!abilityDefs.every((d) => (draft.abilityChoices[d.key] ?? []).length >= d.count)}
          >
            <AbilityChoices defs={abilityDefs} />
          </Accordion>
        )}
      </div>
    </div>
  );
}

/** DDB's Character Details / Physical / Personal Characteristics accordions. */
function CharacterDetailAccordions() {
  const details = useCharacterStore((s) => s.draft.details);
  const setDetail = useCharacterStore((s) => s.setDetail);

  const field = (label: string, key: keyof CharacterDetails, placeholder = "") => (
    <label className="block text-sm">
      <span className="font-semibold">{label}</span>
      <input
        value={details[key]}
        placeholder={placeholder}
        onChange={(e) => setDetail(key, e.target.value)}
        className="mt-0.5 block w-full rounded border border-ink/20 bg-white px-2 py-1"
      />
    </label>
  );

  const area = (label: string, key: keyof CharacterDetails) => (
    <label className="block text-sm">
      <span className="font-semibold">{label}</span>
      <textarea
        value={details[key]}
        rows={2}
        onChange={(e) => setDetail(key, e.target.value)}
        className="mt-0.5 block w-full rounded border border-ink/20 bg-white px-2 py-1"
      />
    </label>
  );

  return (
    <div className="space-y-2">
      <Accordion title="Character Details" subtitle="Alignment · Faith · Lifestyle">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="font-semibold">Alignment</span>
            <select
              value={details.alignment}
              onChange={(e) => setDetail("alignment", e.target.value)}
              className="mt-0.5 block w-full rounded border border-ink/20 bg-white px-2 py-1"
            >
              <option value="">—</option>
              {ALIGNMENTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          {field("Faith", "faith")}
          <label className="block text-sm">
            <span className="font-semibold">Lifestyle</span>
            <select
              value={details.lifestyle}
              onChange={(e) => setDetail("lifestyle", e.target.value)}
              className="mt-0.5 block w-full rounded border border-ink/20 bg-white px-2 py-1"
            >
              <option value="">—</option>
              {LIFESTYLES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Accordion>

      <Accordion title="Physical Characteristics" subtitle="Hair · Eyes · Height · …">
        <div className="grid gap-3 sm:grid-cols-3">
          {field("Hair", "hair")}
          {field("Skin", "skin")}
          {field("Eyes", "eyes")}
          {field("Height", "height")}
          {field("Weight", "weight", "lb")}
          {field("Age", "age")}
          {field("Gender", "gender")}
        </div>
      </Accordion>

      <Accordion title="Personal Characteristics" subtitle="Traits · Ideals · Bonds · Flaws">
        <div className="grid gap-3 sm:grid-cols-2">
          {area("Personality Traits", "personalityTraits")}
          {area("Ideals", "ideals")}
          {area("Bonds", "bonds")}
          {area("Flaws", "flaws")}
          {area("Appearance", "appearance")}
          {area("Backstory", "backstory")}
        </div>
      </Accordion>

      <Accordion title="Notes">{area("Notes", "notes")}</Accordion>
    </div>
  );
}
