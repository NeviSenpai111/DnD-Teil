import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/**
 * First-run / not-found composition: a glyph tile, a heading, a hint on how
 * to fill the view and the one action that does it. Left-aligned in a narrow
 * column, offset toward the top of the view rather than dead-centre.
 */
export function EmptyState({
  title,
  icon = "book",
  children,
  actions,
}: {
  title: string;
  icon?: IconName;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="grid h-full items-start overflow-y-auto pt-[clamp(1rem,12vh,7rem)]">
      <div className="mx-auto w-full max-w-md animate-settle-in px-2">
        <div className="relative mb-6 grid h-14 w-14 place-items-center rounded-2xl border border-line bg-surface text-accent shadow-sm">
          <Icon name={icon} className="h-6 w-6" />
          <span className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full border-2 border-canvas bg-accent" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {children && <div className="mt-2 max-w-[60ch] text-sm leading-relaxed text-ink-muted">{children}</div>}
        {actions && <div className="mt-6 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
