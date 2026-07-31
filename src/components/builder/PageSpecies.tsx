import { useState } from "react";
import { useActiveEntities, useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import {
  abilityChoiceDefsFor,
  languageChoiceDefsFor,
  listByType,
  listSubraces,
  resolveRace,
  resolveSubrace,
  skillGrantsFor,
  speciesSpellSources,
} from "../../store/selectors";
import { speciesLabel } from "../../engine/edition";
import type { Entry } from "../../data/types/common";
import { Entries } from "../../data/entryRenderer/EntryRenderer";
import { Accordion, subtitleParts } from "./Accordion";
import { EntityPicker } from "./EntityPicker";
import { AbilityChoices } from "./AbilityChoices";
import { SkillChoiceSelects } from "./SkillChoices";
import { AdditionalSpellPicker } from "./FeatSpellPicker";
import { LanguageChoiceSelects } from "./LanguageChoices";

/** Named sub-blocks of a race's entries become DDB-style trait accordions. */
function splitTraits(entries: Entry[] | undefined): { intro: Entry[]; traits: { name: string; entries: Entry[] }[] } {
  const intro: Entry[] = [];
  const traits: { name: string; entries: Entry[] }[] = [];
  for (const e of entries ?? []) {
    const obj = e as { name?: string; entries?: Entry[] };
    if (typeof e === "object" && e !== null && obj.name && Array.isArray(obj.entries)) {
      traits.push({ name: obj.name, entries: obj.entries });
    } else {
      intro.push(e);
    }
  }
  return { intro, traits };
}

export function PageSpecies() {
  const entities = useActiveEntities();
  const index = useContentStore((s) => s.index);
  const draft = useCharacterStore((s) => s.draft);
  const setRace = useCharacterStore((s) => s.setRace);
  const setSubrace = useCharacterStore((s) => s.setSubrace);
  const [changing, setChanging] = useState(false);

  const label = speciesLabel(draft.edition);
  const races = listByType(entities, "race");
  const race = resolveRace(index, draft.race);
  const subraces = listSubraces(entities, draft.race);
  const subrace = resolveSubrace(index, draft.subrace);

  if (!race || changing) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-ink">Choose Origin: {label}</h2>
        <EntityPicker
          items={races}
          selected={draft.race}
          onSelect={(ref) => {
            setRace(ref);
            setChanging(false);
          }}
          emptyHint={`No ${label.toLowerCase()} options. Import content with a "race" array.`}
        />
      </div>
    );
  }

  const { intro, traits } = splitTraits(race.entries);
  const subTraits = subrace ? splitTraits(subrace.entries) : undefined;
  const abilityDefs = draft.edition === "classic" ? abilityChoiceDefsFor(draft, index).filter((d) => !d.key.startsWith("bgfeat")) : [];
  const skillPicks = skillGrantsFor(draft, index)
    .choices.filter((c) => c.key.startsWith("race:") || c.key.startsWith("subrace:"))
    .reduce((sum, c) => sum + c.count, 0);
  const spellSources = speciesSpellSources(draft, index);
  const languagePicks = languageChoiceDefsFor(draft, index)
    .filter((d) => d.key.startsWith("race:lang") || d.key.startsWith("subrace:lang"))
    .reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-ink">{race.name}</h2>
          {traits.length > 0 && (
            <p className="mt-1 text-sm">
              <span className="font-bold">{label} Traits:</span>{" "}
              {traits.map((t) => t.name).join(", ")}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setChanging(true)}
          className="shrink-0 text-sm font-semibold text-blood underline hover:text-blood-light"
        >
          Change {label}
        </button>
      </div>

      {intro.length > 0 && (
        <div className="text-sm">
          <Entries entries={intro} />
        </div>
      )}

      <div className="space-y-2">
        {traits.map((t) => (
          <Accordion key={t.name} title={t.name}>
            <Entries entries={t.entries} />
          </Accordion>
        ))}

        {skillPicks > 0 && (
          <Accordion title="Skill Choices" subtitle={subtitleParts(`${skillPicks} Choices`)} defaultOpen>
            <SkillChoiceSelects prefixes={["race:", "subrace:"]} />
          </Accordion>
        )}

        {abilityDefs.length > 0 && (
          <Accordion
            title="Ability Scores"
            subtitle={subtitleParts(`${abilityDefs.reduce((n, d) => n + d.count, 0)} Choices`)}
            defaultOpen
          >
            <AbilityChoices defs={abilityDefs} />
          </Accordion>
        )}

        {languagePicks > 0 && (
          <Accordion
            title="Languages"
            subtitle={subtitleParts(`${languagePicks} Choices`)}
            defaultOpen
          >
            <LanguageChoiceSelects prefixes={["race:lang", "subrace:lang"]} />
          </Accordion>
        )}

        {spellSources.map((src) => (
          <Accordion key={src.keyPrefix} title={`${src.entity.name} Spells`} defaultOpen>
            <AdditionalSpellPicker entity={src.entity} keyPrefix={src.keyPrefix} />
          </Accordion>
        ))}
      </div>

      {subraces.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-ink">Subrace</h3>
          <EntityPicker
            items={subraces}
            selected={draft.subrace}
            onSelect={setSubrace}
            emptyHint="No subraces for this race."
          />
          {subTraits && subTraits.traits.length > 0 && (
            <div className="space-y-2">
              {subTraits.traits.map((t) => (
                <Accordion key={t.name} title={t.name}>
                  <Entries entries={t.entries} />
                </Accordion>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
