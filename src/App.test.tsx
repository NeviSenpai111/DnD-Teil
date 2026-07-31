import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "./App";

/**
 * Smoke test that the real component tree mounts without crashing. This guards
 * against runtime-only failures (e.g. zustand v5 selectors returning fresh
 * arrays, which throw a getSnapshot infinite-loop error during render).
 */
describe("App", () => {
  it("renders the shell and the empty browse state", () => {
    render(
      <MemoryRouter initialEntries={["/browse"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText("🐉 5eTools Builder")).toBeInTheDocument();
    expect(screen.getByText("Nothing to browse yet")).toBeInTheDocument();
  });

  it("renders the builder route without content", () => {
    render(
      <MemoryRouter initialEntries={["/build"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText("No content imported")).toBeInTheDocument();
  });
});
