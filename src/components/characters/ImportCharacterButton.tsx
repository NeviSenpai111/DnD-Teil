import { useRef, useState } from "react";
import { importCharacterFile } from "../../data/ddbImport";
import { useCharacterStore } from "../../store/characterStore";
import { useContentStore } from "../../store/contentStore";
import { Icon } from "../common/Icon";

interface ImportReport {
  name: string;
  warnings: string[];
}

/**
 * Imports finished characters from a D&D Beyond PDF export (or a character JSON
 * this app exported). Anything the sheet mentions that isn't in the imported
 * content can't be resolved, so each file reports what needs a second look.
 */
export function ImportCharacterButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const index = useContentStore((s) => s.index);
  const edition = useContentStore((s) => s.edition);
  const addCharacter = useCharacterStore((s) => s.addCharacter);
  const [busy, setBusy] = useState(false);
  const [reports, setReports] = useState<ImportReport[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    const done: ImportReport[] = [];
    const failed: string[] = [];
    for (const file of [...fileList]) {
      try {
        const { character, warnings } = await importCharacterFile(file, index, edition);
        addCharacter(character);
        done.push({ name: character.name, warnings });
      } catch (error) {
        failed.push(error instanceof Error ? error.message : `Couldn't read ${file.name}.`);
      }
    }
    setReports(done);
    setErrors(failed);
    setBusy(false);
    // Let the same file be picked again after a fix.
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-3">
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
        title="Import a character from a D&D Beyond PDF export"
        className="btn btn-secondary w-full"
      >
        <Icon name="import" className="h-4 w-4 text-ink-muted" />
        {busy ? "Importing…" : "Import character…"}
      </button>
      <p className="text-xs leading-relaxed text-ink-muted">
        A D&amp;D Beyond PDF export (or a character JSON from here).
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
