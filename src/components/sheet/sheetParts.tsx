/**
 * Small building blocks shared by the full sheet's panels and tabs.
 */

import type { ReactNode } from "react";
import type { Entry } from "../../data/types/common";
import { Entries } from "../../data/entryRenderer/EntryRenderer";

/** A row of spendable slot pips: filled = spent, click to spend/restore. */
export function SlotPips({
  label,
  display,
  total,
  used,
  onChange,
}: {
  label: string;
  /** Visible caption, when it should differ from the accessible `label`. */
  display?: string;
  total: number;
  used: number;
  onChange: (used: number) => void;
}) {
  const spent = Math.min(used, total);
  return (
    <span className="flex items-center gap-1">
      <span className="eyebrow">{display ?? label}</span>
      {Array.from({ length: total }, (_, k) => (
        <button
          key={k}
          type="button"
          aria-label={`${label} slot ${k + 1}`}
          title={k < spent ? "Restore slot" : "Spend slot"}
          onClick={() => onChange(k < spent ? k : k + 1)}
          className={`h-3.5 w-3.5 rounded-full border border-line-strong ${
            k < spent ? "bg-accent" : "bg-transparent hover:bg-ink/5"
          }`}
        />
      ))}
    </span>
  );
}

export function AddButton({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn btn-secondary btn-sm shrink-0 print:hidden"
    >
      {open ? "Done" : `+ ${label}`}
    </button>
  );
}

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="eyebrow mb-1.5">{title}</h3>
      {children}
    </div>
  );
}

export function EntryBlocks({ blocks }: { blocks: { name: string; entries?: Entry[] }[] }) {
  return (
    <div className="space-y-2">
      {blocks.map((b) => (
        <div key={b.name}>
          <h4 className="font-semibold tracking-tight text-ink">{b.name}</h4>
          {b.entries && <Entries entries={b.entries} />}
        </div>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-ink-muted">{children}</p>;
}

export function ProfDot({ on, expertise }: { on: boolean; expertise?: boolean }) {
  const cls = expertise
    ? "bg-accent ring-2 ring-accent/40"
    : on
      ? "bg-accent"
      : "border border-line-strong bg-transparent";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} aria-hidden />;
}

/** "Cantrips", "1st Level", "2nd Level", … */
export function levelLabel(n: number): string {
  if (n === 0) return "Cantrips";
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]} Level`;
}

/** D&D Beyond-style filter pills over a tab's sections ("All", "Attack", …). */
export function FilterPills<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5 print:hidden">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={`rounded-full border px-2.5 py-0.5 font-mono text-2xs font-medium uppercase tracking-wide transition-colors ${
            value === option
              ? "border-accent bg-accent text-on-accent"
              : "border-line-strong text-ink-muted hover:text-ink"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
