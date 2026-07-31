import { useRef, useState } from "react";
import { useContentStore } from "../../store/contentStore";

/** Reads one or more JSON files (or the bundled sample) into the content store. */
export function ImportButton() {
  const importTexts = useContentStore((s) => s.importTexts);
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = await Promise.all(
      [...fileList].map(async (f) => ({ name: f.name, text: await f.text() })),
    );
    const result = importTexts(files);
    reportResult(result.entities.length, result.duplicateCount, result.issues.length);
  }

  async function loadSample() {
    const names = ["space-galleon.json", "srd-lite.json"];
    const files = await Promise.all(
      names.map(async (name) => ({
        name,
        text: await (await fetch(`${import.meta.env.BASE_URL}sample-data/${name}`)).text(),
      })),
    );
    const result = importTexts(files);
    reportResult(result.entities.length, result.duplicateCount, result.issues.length);
  }

  function reportResult(added: number, dupes: number, issues: number) {
    const parts = [`Imported ${added} entit${added === 1 ? "y" : "ies"}`];
    if (dupes) parts.push(`${dupes} duplicate${dupes === 1 ? "" : "s"} skipped`);
    if (issues) parts.push(`${issues} issue${issues === 1 ? "" : "s"}`);
    setStatus(parts.join(" · "));
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex-1 rounded bg-blood px-3 py-2 text-sm font-semibold text-parchment hover:bg-blood-light"
        >
          Import JSON…
        </button>
        <button
          type="button"
          onClick={() => void loadSample()}
          className="rounded border border-blood px-3 py-2 text-sm font-medium text-blood hover:bg-blood/10"
          title="Load the bundled Space Galleon sample"
        >
          Sample
        </button>
      </div>
      {status && <p className="text-xs text-ink/70">{status}</p>}
    </div>
  );
}
