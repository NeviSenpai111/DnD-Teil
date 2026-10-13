import { useRef, useState, type FormEvent } from "react";
import { importCharacterFile } from "../../data/characterImport";
import { characterFromDdbJson, fetchDdbCharacter } from "../../data/ddbJsonImport";
import type { CharacterImport } from "../../data/ddbImport";
import { useCharacterStore } from "../../store/characterStore";
import { useContentStore } from "../../store/contentStore";
import { Icon } from "../common/Icon";

interface ImportReport {
  name: string;
  warnings: string[];
}

/**
 * Imports finished characters: a public D&D Beyond character by link, or a
 * file — DDB's PDF export, DDB's character JSON, or a character JSON this app
 * exported. Anything the source mentions that isn't in the imported content
 * can't be resolved, so each import reports what needs a second look.
 */
export function ImportCharacterButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const index = useContentStore((s) => s.index);
  const edition = useContentStore((s) => s.edition);
  const addCharacter = useCharacterStore((s) => s.addCharacter);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [reports, setReports] = useState<ImportReport[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  /** Run imports one after another, collecting a report or an error for each. */
  async function run(jobs: { label: string; load: () => Promise<CharacterImport> }[]): Promise<boolean> {
    setBusy(true);
    const done: ImportReport[] = [];
    const failed: string[] = [];
    for (const job of jobs) {
      try {
        const { character, warnings } = await job.load();
        addCharacter(character);
        done.push({ name: character.name, warnings });
      } catch (error) {
        failed.push(error instanceof Error ? error.message : `Couldn't read ${job.label}.`);
      }
    }
    setReports(done);
    setErrors(failed);
    setBusy(false);
    return failed.length === 0;
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    await run([...fileList].map((file) => ({ label: file.name, load: () => importCharacterFile(file, index, edition) })));
    // Let the same file be picked again after a fix.
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleLink(event: FormEvent) {
    event.preventDefault();
    if (!link.trim()) return;
    const ok = await run([
      { label: link, load: async () => characterFromDdbJson(await fetchDdbCharacter(link), index) },
    ]);
    if (ok) setLink("");
  }

  return (
    <div className="space-y-3">
      <form onSubmit={(e) => void handleLink(e)} className="space-y-1.5">
        <label htmlFor="ddb-link" className="text-xs font-medium text-ink-muted">
          D&amp;D Beyond link
        </label>
        <div className="flex gap-2">
          <input
            id="ddb-link"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="dndbeyond.com/characters/…"
            className="field min-w-0 flex-1 font-mono text-xs"
          />
          <button type="submit" disabled={busy || !link.trim()} className="btn btn-secondary shrink-0">
            Import
          </button>
        </div>
        <p className="text-xs leading-relaxed text-ink-muted">The character's privacy must be set to Public.</p>
      </form>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf,.json,application/json"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        title="Import a character from a file"
        className="btn btn-secondary w-full"
      >
        <Icon name="import" className="h-4 w-4 text-ink-muted" />
        {busy ? "Importing…" : "Import file…"}
      </button>
      <p className="text-xs leading-relaxed text-ink-muted">
        A D&amp;D Beyond PDF export or character JSON, or a character JSON from here.
      </p>
      {busy && <div className="skeleton h-2 w-full" aria-hidden="true" />}

      <div role="status" aria-live="polite" className="space-y-2">
        {errors.map((message) => (
          <p key={message} className="flex gap-2 rounded-lg border border-accent/25 bg-accent/5 px-2.5 py-2 text-xs text-accent">
            <Icon name="alert" className="h-3.5 w-3.5 shrink-0 translate-y-px" />
            {message}
          </p>
        ))}

        {reports.map((report) => (
          <div key={report.name} className="animate-settle-in rounded-lg border border-line bg-surface p-2.5 text-xs">
            <span className="font-medium">Imported {report.name}.</span>{" "}
            {report.warnings.length === 0 ? (
              "Everything resolved."
            ) : (
              <>
                <span className="text-ink-muted">
                  {report.warnings.length} thing{report.warnings.length === 1 ? "" : "s"} to check:
                </span>
                <ul className="ml-4 mt-1 list-disc space-y-0.5 text-ink-muted">
                  {report.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
