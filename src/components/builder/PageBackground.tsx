import { useActiveEntities, useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import { backgroundFor, listByType, resolveCharacterFeats } from "../../store/selectors";
import type { Background } from "../../data/types/character-content";
import type { CharacterDetails } from "../../model/character";
import { Entries } from "../../data/entryRenderer/EntryRenderer";
import { abilityChoiceDefs } from "../../engine/character";
import { characteristicTables } from "../../engine/characteristics";
import { readNamedGrants } from "../../engine/proficiencies";
import { Icon } from "../common/Icon";
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
              <h4 className="eyebrow">{table.label}</h4>
              <button
                type="button"
                onClick={() =>
                  setDetail(
                    table.field,
                    table.options[Math.floor(Math.random() * table.options.length)],
                  )
                }
                className="btn btn-secondary btn-sm"
              >
                <Icon name="dice" className="h-3.5 w-3.5" />
                {`Roll ${table.label}`}
              </button>
            </div>
            <ul className="mt-2 space-y-0.5">
              {table.options.map((option, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => setDetail(table.field, option)}
                    className="flex w-full gap-2 rounded-md px-2 py-1 text-left text-sm text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink"
                    title={`Use as your ${table.label.toLowerCase()}`}
                  >
                    <span className="w-4 shrink-0 pt-px text-right font-mono text-xs text-ink-faint">{i + 1}</span>
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
      <h2 className="text-2xl font-semibold tracking-tight text-ink">Choose Origin: Background</h2>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={draft.background ? `${draft.background.name}|${draft.background.source}` : ""}
          disabled={isCustom}
          aria-label="Background"
          onChange={(e) => {
            const [name, source] = e.target.value.split("|");
            setBackground(name ? { name, source } : undefined);
          }}
          className="block w-full max-w-md field disabled:opacity-50"
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
          aria-pressed={isCustom}
          className={`btn ${isCustom ? "btn-secondary row-selected border-accent/40" : "btn-secondary"}`}
        >
          {isCustom ? "Use a published background" : "Build a custom background"}
        </button>
      </div>

      {isCustom && draft.customBackground && (
        <div className="space-y-3 rounded-xl border border-line bg-surface-sunk p-4">
          <label className="block text-sm">
            <span className="font-medium">Name</span>
            <input
              value={draft.customBackground.name}
              aria-label="Custom background name"
              onChange={(e) =>
                setCustomBackground({ ...draft.customBackground!, name: e.target.value })
              }
              className="mt-1 block w-full max-w-sm field"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Description</span>
            <textarea
              value={draft.customBackground.description}
              aria-label="Custom background description"
              onChange={(e) =>
                setCustomBackground({ ...draft.customBackground!, description: e.target.value })
              }
              rows={2}
              className="mt-1 block w-full field"
            />
          </label>
          <p className="text-xs text-ink-muted">
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
          <span className="font-medium">Skill Proficiencies:</span>{" "}
          {fixedSkills.map(skillName).join(", ")}
        </p>
      )}
      <SkillChoiceSelects prefixes={["background:"]} />
      {toolText && (
        <p className="text-sm">
          <span className="font-medium">Tool Proficiencies:</span> {toolText}
        </p>
      )}
      <ToolChoiceSelects />
      {langText && (
        <p className="text-sm">
          <span className="font-medium">Languages:</span> {langText}
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
                <LanguageChoiceSelects prefixes={[`feat:${keyPrefix}:lang`]} />
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
      <span className="font-medium">{label}</span>
      <input
        value={details[key]}
        placeholder={placeholder}
        onChange={(e) => setDetail(key, e.target.value)}
        className="mt-1 block w-full field"
      />
    </label>
  );

  const area = (label: string, key: keyof CharacterDetails) => (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <textarea
        value={details[key]}
        rows={2}
        onChange={(e) => setDetail(key, e.target.value)}
        className="mt-1 block w-full field"
      />
    </label>
  );

  return (
    <div className="space-y-2">
      <Accordion title="Character Details" subtitle="Alignment · Faith · Lifestyle">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="font-medium">Alignment</span>
            <select
              value={details.alignment}
              onChange={(e) => setDetail("alignment", e.target.value)}
              className="mt-1 block w-full field"
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
            <span className="font-medium">Lifestyle</span>
            <select
              value={details.lifestyle}
              onChange={(e) => setDetail("lifestyle", e.target.value)}
              className="mt-1 block w-full field"
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
