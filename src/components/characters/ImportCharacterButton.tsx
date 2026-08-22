import { useRef, useState } from "react";
import { importCharacterFile } from "../../data/ddbImport";
import { useCharacterStore } from "../../store/characterStore";
import { useContentStore } from "../../store/contentStore";

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
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf,.json,application/json"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          title="Import a character from a D&D Beyond PDF export"
          className="rounded bg-blood px-3 py-2 text-sm font-semibold text-parchment hover:bg-blood-light disabled:opacity-50"
        >
          {busy ? "Importing…" : "📥 Import character…"}
        </button>
        <span className="text-xs text-ink/60">
          A D&amp;D Beyond PDF export (or a character JSON from here).
        </span>
      </div>

      {errors.map((message) => (
        <p key={message} className="text-xs text-blood">
          {message}
        </p>
      ))}

      {reports.map((report) => (
        <div key={report.name} className="rounded border border-blood/20 bg-parchment/60 p-2 text-xs">
          <span className="font-semibold">Imported {report.name}.</span>{" "}
          {report.warnings.length === 0 ? (
            "Everything resolved."
          ) : (
            <>
              <span className="text-ink/70">
                {report.warnings.length} thing{report.warnings.length === 1 ? "" : "s"} to check:
              </span>
              <ul className="ml-4 mt-1 list-disc space-y-0.5 text-ink/70">
                {report.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
