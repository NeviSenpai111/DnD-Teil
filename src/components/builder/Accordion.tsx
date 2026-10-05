import { useState, type ReactNode } from "react";
import { Icon } from "../common/Icon";

/**
 * D&D-Beyond-style collapsible feature card: bold title, a muted subtitle line
 * (e.g. "3 Choices · 1st level") and a chevron. Uncontrolled by default; pass
 * `open` + `onToggle` to control it (e.g. the MANAGE HP button opening the
 * Hit Points card).
 */
export function Accordion({
  title,
  subtitle,
  badge,
  defaultOpen = false,
  open: openProp,
  onToggle,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Small pill rendered next to the title (e.g. "Granted Feat"). */
  badge?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;
  const toggle = () => (onToggle ? onToggle(!open) : setOpenState(!open));

  return (
    <div
      className={`rounded-xl border bg-surface transition-[border-color,box-shadow] duration-200 ease-snap ${
        open ? "border-line-strong shadow-[var(--shadow-panel)]" : "border-line"
      }`}
    >
      <button
        type="button"
        onClick={toggle}
        className="group flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-ink/[0.025]"
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1">
          <span className="font-medium tracking-tight text-ink">
            {title}
            {badge && <span className="chip chip-accent ml-2 align-[0.125rem]">{badge}</span>}
          </span>
          {subtitle && <span className="mt-0.5 block text-xs text-ink-muted">{subtitle}</span>}
        </span>
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line text-ink-muted transition-[transform,color,border-color] duration-(--duration-settle) ease-spring group-hover:border-line-strong group-hover:text-ink ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        >
          <Icon name="chevron-down" className="h-4 w-4" />
        </span>
      </button>
      {open && <div className="animate-settle-in border-t border-line px-4 py-4 text-sm">{children}</div>}
    </div>
  );
}

/** "1st level", "2nd level", … subtitle fragments. */
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** The "· 1st level" / "N Choices" subtitle, skipping empty parts. */
export function subtitleParts(...parts: (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(" · ");
}
