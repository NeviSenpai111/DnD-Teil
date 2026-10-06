import { useId } from "react";
import { SCHEMES, type SchemeId, useThemeStore } from "../../store/themeStore";
import { Icon } from "./Icon";

/** Header button with a native popover holding the appearance options (from `sm` up). */
export function ThemeMenu() {
  const menuId = useId();
  const scheme = useThemeStore((s) => s.scheme);

  return (
    <>
      <button
        type="button"
        popoverTarget={menuId}
        aria-label="Appearance"
        title="Appearance"
        className="btn btn-ghost btn-icon"
      >
        <Icon name="palette" className="h-5 w-5" />
      </button>
      {/* Re-declaring the scheme resets any header remap (Legacy's `.chrome`) the menu would inherit. */}
      <div
        id={menuId}
        popover="auto"
        role="dialog"
        aria-label="Appearance"
        data-theme={scheme}
        className="popover-menu glass"
      >
        <h2 className="eyebrow px-2 pb-2 pt-1.5">Appearance</h2>
        <AppearanceOptions />
      </div>
    </>
  );
}

/** Colour scheme radios and the frosted-glass switch; in the menu and, below `sm`, the content panel. */
export function AppearanceOptions() {
  const name = useId();
  const scheme = useThemeStore((s) => s.scheme);
  const glass = useThemeStore((s) => s.glass);
  const setScheme = useThemeStore((s) => s.setScheme);
  const setGlass = useThemeStore((s) => s.setGlass);

  return (
    <div>
      <fieldset className="grid gap-0.5">
        <legend className="sr-only">Colour scheme</legend>
        {SCHEMES.map((s) => {
          const selected = s.id === scheme;
          return (
            <label
              key={s.id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                selected ? "row-selected" : "hover:bg-ink/5"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={s.id}
                checked={selected}
                onChange={() => setScheme(s.id)}
                className="sr-only"
              />
              <Swatch scheme={s.id} />
              <span className={`min-w-0 flex-1 truncate text-sm ${selected ? "font-semibold" : "font-medium"}`}>
                {s.name}
              </span>
              <span className="font-mono text-2xs text-ink-muted">{s.tone}</span>
            </label>
          );
        })}
      </fieldset>
      <label className="mt-1.5 flex cursor-pointer items-center justify-between gap-3 border-t border-line px-2 pb-1.5 pt-2.5">
        <span>
          <span className="block text-sm font-medium">Frosted glass</span>
          <span className="block text-xs text-ink-muted">Translucent panels over a soft backdrop</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={glass}
          onChange={(e) => setGlass(e.target.checked)}
          className="switch"
        />
      </label>
    </div>
  );
}

/** A scheme in miniature: its canvas, a surface card and the accent. The
 * subtree carries the scheme's own `data-theme`, so the tokens are the real ones. */
function Swatch({ scheme }: { scheme: SchemeId }) {
  return (
    <span
      data-theme={scheme}
      aria-hidden="true"
      className="flex h-8 w-11 shrink-0 items-end gap-1 rounded-md border border-line-strong bg-canvas p-1"
    >
      <span className="h-full flex-1 rounded-[3px] border border-line bg-surface" />
      <span className="mb-0.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
    </span>
  );
}
