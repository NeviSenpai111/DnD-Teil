import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GLASS_KEY, SCHEME_KEY, useThemeStore } from "../../store/themeStore";
import { ThemeMenu } from "./ThemeMenu";

// jsdom has no Popover API, so the menu stays closed (display: none) and its
// controls are queried with `hidden: true`; browsers open it natively.
const hidden = { hidden: true } as const;

/** The appearance menu writes the scheme and glass choice to <html> and storage. */
describe("ThemeMenu", () => {
  afterEach(() => {
    useThemeStore.getState().setScheme("codex");
    useThemeStore.getState().setGlass(true);
    localStorage.clear();
  });

  it("opens from the header button", () => {
    render(<ThemeMenu />);
    const button = screen.getByRole("button", { name: "Appearance" });
    const menu = screen.getByRole("dialog", hidden);
    expect(button).toHaveAttribute("popovertarget", menu.id);
    expect(menu).toHaveAttribute("popover", "auto");
  });

  it("starts on Codex with glass on", () => {
    render(<ThemeMenu />);
    expect(screen.getByRole("radio", { name: /Codex/, ...hidden })).toBeChecked();
    expect(screen.getByRole("switch", { name: /Frosted glass/, ...hidden })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe("codex");
    expect(document.documentElement.dataset.glass).toBe("on");
  });

  it("switches the scheme and remembers it", () => {
    render(<ThemeMenu />);
    fireEvent.click(screen.getByRole("radio", { name: /Nord/, ...hidden }));
    expect(screen.getByRole("radio", { name: /Nord/, ...hidden })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe("nord");
    expect(localStorage.getItem(SCHEME_KEY)).toBe("nord");
  });

  it("offers the legacy colours alongside the famous palettes", () => {
    render(<ThemeMenu />);
    const names = screen.getAllByRole("radio", hidden).map((r) => r.closest("label")?.textContent);
    expect(names).toEqual([
      "Codexlight",
      "Legacylight",
      "Solarized Lightlight",
      "Norddark",
      "Gruvboxdark",
      "Catppuccin Mochadark",
    ]);
  });

  it("turns frosted glass off", () => {
    render(<ThemeMenu />);
    fireEvent.click(screen.getByRole("switch", { name: /Frosted glass/, ...hidden }));
    expect(screen.getByRole("switch", { name: /Frosted glass/, ...hidden })).not.toBeChecked();
    expect(document.documentElement.dataset.glass).toBe("off");
    expect(localStorage.getItem(GLASS_KEY)).toBe("off");
  });
});
