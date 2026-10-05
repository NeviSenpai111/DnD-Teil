import type { ReactNode } from "react";

/** Centered first-run / not-found message: a heading, a hint and optional actions. */
export function EmptyState({
  title,
  children,
  actions,
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="grid h-full place-items-center p-4 text-center">
      <div className="max-w-sm">
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
        {children && <div className="mt-1 text-sm text-ink-muted">{children}</div>}
        {actions && <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
