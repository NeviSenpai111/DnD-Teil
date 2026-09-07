import { useMemo, useRef, useState } from "react";
import { useContentStore } from "../../store/contentStore";
import { FILE_KIND_LABELS, type FileKind, type ImportIssue, type ImportResult } from "../../data/importer";

/** Only `.json` files are read; a 5eTools `data/` tree also holds READMEs and images. */
function isJsonFile(f: File): boolean {
  return f.name.toLowerCase().endsWith(".json");
}

/** The path a directory pick reports (relative to the picked folder), else the plain name. */
function fileLabel(f: File): string {
  return (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
}

interface LastImport {
  result: ImportResult;
  /** Issues raised while resolving `_copy` / `_versions` in the store, plus parse issues. */
  issues: ImportIssue[];
}

/**
 * Reads one or more JSON files, a whole folder (e.g. a 5eTools `data/`
 * directory, recursively), or the bundled sample into the content store, and
 * reports what was imported and what was skipped.
 */
export function ImportButton() {
  const importTexts = useContentStore((s) => s.importTexts);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<LastImport | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const picked = [...fileList].filter(isJsonFile);
    if (picked.length === 0) {
      setLast(null);
      setBusy("No .json files in the selection.");
      return;
    }
    setBusy(`Reading ${picked.length} file${picked.length === 1 ? "" : "s"}…`);
    try {
      const files = await Promise.all(
        picked.map(async (f) => ({ name: fileLabel(f), text: await f.text() })),
      );
      setBusy("Importing…");
      // Let the status paint before the (synchronous) parse + resolve pass.
      await new Promise((r) => setTimeout(r, 0));
      const result = importTexts(files);
      setLast({ result, issues: result.issues });
    } finally {
      setBusy(null);
    }
  }

  async function loadSample() {
    const names = ["space-galleon.json", "srd-lite.json"];
    setBusy("Loading sample…");
    try {
      const files = await Promise.all(
        names.map(async (name) => ({
          name,
          text: await (await fetch(`${import.meta.env.BASE_URL}sample-data/${name}`)).text(),
        })),
      );
      const result = importTexts(files);
      setLast({ result, issues: result.issues });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        // Non-standard but supported by every current browser: picks a directory, recursively.
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy !== null}
          className="flex-1 rounded bg-blood px-3 py-2 text-sm font-semibold text-parchment hover:bg-blood-light disabled:opacity-60"
        >
          Import JSON…
        </button>
        <button
          type="button"
          onClick={() => void loadSample()}
          disabled={busy !== null}
          className="rounded border border-blood px-3 py-2 text-sm font-medium text-blood hover:bg-blood/10 disabled:opacity-60"
          title="Load the bundled Space Galleon + SRD-lite samples"
        >
          Sample
        </button>
      </div>
      <button
        type="button"
        onClick={() => folderInputRef.current?.click()}
        disabled={busy !== null}
        className="rounded border border-blood/60 px-3 py-1.5 text-sm font-medium text-blood hover:bg-blood/10 disabled:opacity-60"
        title="Pick a 5eTools data/ folder; every JSON file inside (recursively) is imported"
      >
        Import folder…
      </button>
      {busy && <p className="text-xs text-ink/70">{busy}</p>}
      {!busy && last && <ImportReport result={last.result} issues={last.issues} />}
    </div>
  );
}

const KIND_ORDER: FileKind[] = ["content", "spell-sources", "foundry", "book", "index", "unrecognized"];

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function ImportReport({ result, issues }: { result: ImportResult; issues: ImportIssue[] }) {
  const kinds = useMemo(() => {
    const counts = new Map<FileKind, number>();
    for (const f of result.files) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
    return KIND_ORDER.filter((k) => counts.has(k)).map((k) => ({ kind: k, count: counts.get(k) ?? 0 }));
  }, [result.files]);

  const typeCounts = useMemo(
    () => Object.entries(result.typeCounts).sort((a, b) => b[1] - a[1]),
    [result.typeCounts],
  );

  const warnings = issues.filter((i) => i.level !== "info");
  const notes = issues.filter((i) => i.level === "info");

  const headline = [`Imported ${plural(result.entities.length, "entity").replace("entitys", "entities")}`];
  if (result.duplicateCount) headline.push(`${plural(result.duplicateCount, "duplicate")} skipped`);
  if (warnings.length) headline.push(plural(warnings.length, "warning"));

  return (
    <div className="text-xs text-ink/70">
      <p>{headline.join(" · ")}</p>
      {kinds.length > 1 && (
        <p className="mt-0.5 text-ink/50">
          Files: {kinds.map((k) => `${k.count} ${FILE_KIND_LABELS[k.kind]}`).join(", ")}
        </p>
      )}
      {typeCounts.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer select-none text-ink/60 hover:text-ink">
            By type ({typeCounts.length})
          </summary>
          <ul className="mt-1 max-h-40 overflow-y-auto pl-2">
            {typeCounts.map(([type, count]) => (
              <li key={type} className="flex justify-between gap-2">
                <span className="truncate">{type}</span>
                <span className="text-ink/50">{count}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {(warnings.length > 0 || notes.length > 0) && (
        <details className="mt-1">
          <summary className="cursor-pointer select-none text-ink/60 hover:text-ink">
            {warnings.length ? `${plural(warnings.length, "warning")}` : "Notes"}
            {notes.length ? ` · ${plural(notes.length, "note")}` : ""}
          </summary>
          <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto pl-2">
            {[...warnings, ...notes].map((issue, i) => (
              <li
                key={`${issue.fileName}:${i}`}
                className={issue.level === "error" ? "text-blood" : issue.level === "warn" ? "text-ink" : "text-ink/50"}
                title={issue.fileName}
              >
                <span className="font-medium">{issue.fileName.split("/").pop()}</span>: {issue.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
