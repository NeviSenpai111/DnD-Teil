import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { useContentStore } from "../../store/contentStore";
import type { ImportedEntity } from "../../data/types/content";
import { EntityDetail } from "./EntityDetail";

/**
 * The browser must show something useful for items, classes and subclasses —
 * these real-data types have no top-level `entries`, so they previously hit
 * the "no description" dead end.
 */
describe("EntityDetail dedicated views", () => {
  beforeAll(() => {
    const text = readFileSync("public/sample-data/srd-lite.json", "utf8");
    useContentStore.getState().importTexts([{ name: "srd-lite.json", text }]);
  });

  function entity(type: string, name: string): ImportedEntity {
    const found = useContentStore
      .getState()
      .entities.find((e) => e.__type === type && e.name === name);
    if (!found) throw new Error(`srd-lite is missing ${type} ${name}`);
    return found;
  }

  it("renders an item with category, AC and cost instead of the fallback", () => {
    render(<EntityDetail entity={entity("item", "Leather Armor")} />);
    expect(screen.getByText("Armor · Light Armor · SRDLite")).toBeInTheDocument();
    expect(screen.getByText("Armor Class:")).toBeInTheDocument();
    expect(screen.getByText("11 + Dex")).toBeInTheDocument();
    expect(screen.getByText("Cost:")).toBeInTheDocument();
    expect(screen.getByText("10 gp")).toBeInTheDocument();
    expect(screen.queryByText(/no description/i)).not.toBeInTheDocument();
  });

  it("renders a class with hit die, proficiencies and its features", () => {
    render(<EntityDetail entity={entity("class", "Warden")} />);
    expect(screen.getByText("Hit Die:")).toBeInTheDocument();
    expect(screen.getByText("Class Features")).toBeInTheDocument();
    // A Warden classFeature from srd-lite must appear with its level tag.
    expect(screen.getAllByText(/level/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/no description/i)).not.toBeInTheDocument();
  });

  it("renders a spell with its casting stats instead of bare entries", () => {
    render(<EntityDetail entity={entity("spell", "Mending Ward")} />);
    expect(screen.getByText("Level 1 · Abjuration · SRDLite")).toBeInTheDocument();
    expect(screen.getByText("Casting Time:")).toBeInTheDocument();
    expect(screen.getByText("1 bonus action")).toBeInTheDocument();
    expect(screen.getByText("30 feet")).toBeInTheDocument();
    expect(screen.getByText("V, S, M (a strip of white cloth)")).toBeInTheDocument();
    expect(screen.getByText("Concentration, up to 10 minutes")).toBeInTheDocument();
  });

  it("renders an optional feature with a readable type and prerequisite", () => {
    render(<EntityDetail entity={entity("optionalfeature", "Emberwatch Stance")} />);
    // The "FS:W" code renders as its human name.
    expect(screen.getByText("Fighting Style · SRDLite")).toBeInTheDocument();
    expect(screen.getByText("Prerequisite:")).toBeInTheDocument();
    expect(screen.getByText(/level 5/)).toBeInTheDocument();
  });

  it("renders a subclass with its parent class and features", () => {
    render(<EntityDetail entity={entity("subclass", "Path of the Sentinel")} />);
    expect(screen.getByText("Warden subclass · SRDLite")).toBeInTheDocument();
    expect(screen.getByText("Sentinel's Watch")).toBeInTheDocument();
    expect(screen.queryByText(/no description/i)).not.toBeInTheDocument();
  });
});
