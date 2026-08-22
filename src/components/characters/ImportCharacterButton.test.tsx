import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImportCharacterButton } from "./ImportCharacterButton";
import { useCharacterStore } from "../../store/characterStore";
import { createCharacter } from "../../model/character";

// The roster persists through Dexie, and jsdom has no IndexedDB.
vi.mock("../../db/persistence", () => ({
  saveCharacter: vi.fn(async () => {}),
  deleteCharacterRecord: vi.fn(async () => {}),
}));

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

const pdf = (body: string, name = "sheet.pdf") =>
  new File([body], name, { type: "application/pdf" });

describe("ImportCharacterButton", () => {
  beforeEach(() => {
    useCharacterStore.setState({ saved: [] });
  });

  it("adds a character exported as JSON to the roster", async () => {
    const exported = createCharacter({ name: "Albert Zweistein" });
    const file = new File([JSON.stringify(exported)], "albert.json", { type: "application/json" });

    render(<ImportCharacterButton />);
    await userEvent.upload(fileInput(), file);

    await waitFor(() => expect(screen.getByText(/Imported Albert Zweistein/)).toBeInTheDocument());
    expect(useCharacterStore.getState().saved.map((c) => c.name)).toEqual(["Albert Zweistein"]);
    // A re-import is a new character, not an overwrite of the original.
    expect(useCharacterStore.getState().saved[0].id).not.toBe(exported.id);
  });

  it("says so when the file isn't a PDF at all", async () => {
    render(<ImportCharacterButton />);
    await userEvent.upload(fileInput(), pdf("this is not really a pdf"));

    await waitFor(() => expect(screen.getByText(/not a PDF/i)).toBeInTheDocument());
    expect(useCharacterStore.getState().saved).toHaveLength(0);
  });

  it("points at the right export when the PDF has no character fields", async () => {
    render(<ImportCharacterButton />);
    await userEvent.upload(
      fileInput(),
      pdf("%PDF-1.7\n1 0 obj\n<< /T (Invoice) /V (42) >>\nendobj\n%%EOF"),
    );

    await waitFor(() =>
      expect(screen.getByText(/no filled character-sheet fields/i)).toBeInTheDocument(),
    );
    expect(useCharacterStore.getState().saved).toHaveLength(0);
  });
});
