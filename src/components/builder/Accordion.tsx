import { useState, type ReactNode } from "react";

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
    <div className="rounded border border-blood/20 bg-white/50 shadow-sm">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-blood/5"
        aria-expanded={open}
      >
        <span className="flex-1">
          <span className="font-semibold text-ink">
            {title}
            {badge && (
              <span className="ml-2 rounded border border-blood/30 bg-blood/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blood">
                {badge}
              </span>
            )}
          </span>
          {subtitle && <span className="block text-xs text-ink/50">{subtitle}</span>}
        </span>
        <span
          className={`text-ink/40 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          ▾
        </span>
      </button>
      {open && <div className="border-t border-blood/10 px-3 py-3 text-sm">{children}</div>}
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
