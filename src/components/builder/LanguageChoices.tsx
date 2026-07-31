import { useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import { languageChoiceDefsFor } from "../../store/selectors";

/**
 * Dropdowns for "choose/any N languages" grants whose key starts with one of
 * the given prefixes (race:lang / subrace:lang / background:lang), so each
 * builder page renders only its own grants.
 */
export function LanguageChoiceSelects({ prefixes }: { prefixes: string[] }) {
  const index = useContentStore((s) => s.index);
  const draft = useCharacterStore((s) => s.draft);
  const setLanguageChoice = useCharacterStore((s) => s.setLanguageChoice);

  const defs = languageChoiceDefsFor(draft, index).filter((d) =>
    prefixes.some((p) => d.key.startsWith(p)),
  );
  if (defs.length === 0) return null;

  return (
    <div className="space-y-2">
      {defs.map((def) => {
        const picks = draft.languageChoices[def.key] ?? [];
        return (
          <div key={def.key}>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
              {def.origin}: choose {def.count} language{def.count === 1 ? "" : "s"} ({picks.length}/
              {def.count})
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              {Array.from({ length: def.count }).map((_, slot) => (
                <select
                  key={slot}
                  value={picks[slot] ?? ""}
                  aria-label={`${def.origin} language ${slot + 1}`}
                  onChange={(e) => {
                    const next = [...picks];
                    if (e.target.value) next[slot] = e.target.value;
                    else next.splice(slot, 1);
                    setLanguageChoice(def.key, next.filter(Boolean).slice(0, def.count));
                  }}
                  className="rounded border border-ink/20 bg-white px-2 py-1 text-sm"
                >
                  <option value="">— choose a language —</option>
                  {def.from
                    .filter((lang) => lang === picks[slot] || !picks.includes(lang))
                    .map((lang) => (
                      <option key={lang} value={lang}>
                        {lang}
                      </option>
                    ))}
                </select>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
