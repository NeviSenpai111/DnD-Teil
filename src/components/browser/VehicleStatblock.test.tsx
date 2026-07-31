import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Vehicle } from "../../data/types";
import { VehicleStatblock } from "./VehicleStatblock";

const galleon: Vehicle = {
  name: "Space Galleon with Antimatter Rifle",
  source: "Homebrew",
  vehicleType: "SPELLJAMMER",
  dimensions: ["130 ft.", "30 ft."],
  terrain: ["space", "sea", "air"],
  capCrew: 20,
  capCargo: 20,
  cost: 3000000,
  pace: 4,
  speed: 35,
  hull: { ac: 15, acFrom: ["wood"], hp: 400, dt: 15 },
  weapon: [
    {
      name: "Antimatter Rifle",
      crew: 1,
      count: 2,
      ac: 15,
      hp: 50,
      costs: [{ cost: 10000, note: "Antimatter Rifle" }],
      entries: ["It takes 1 action to fire it."],
      action: [
        {
          name: "Antimatter Shots",
          entries: [
            "{@atk rw} {@hit 6} to hit, range 120/360 ft., one target. {@h}16 ({@damage 6d8}) necrotic damage.",
          ],
        },
      ],
    },
    {
      name: "Mangonel",
      crew: 5,
      ac: 15,
      hp: 100,
      action: [
        {
          name: "Mangonel Stone",
          entries: ["{@atk rw} {@hit 5} to hit. {@h}27 ({@damage 5d10}) bludgeoning damage."],
        },
      ],
    },
  ],
};

describe("VehicleStatblock", () => {
  it("renders the Space Galleon with both weapons and resolved inline tags", () => {
    render(<VehicleStatblock vehicle={galleon} />);

    expect(screen.getByText("Space Galleon with Antimatter Rifle")).toBeInTheDocument();
    expect(screen.getByText("Antimatter Rifle")).toBeInTheDocument();
    expect(screen.getByText("Mangonel")).toBeInTheDocument();
    expect(screen.getByText("3,000,000 gp")).toBeInTheDocument();

    // {@atk rw} -> "Ranged Weapon Attack:", {@hit 6} -> "+6", {@h} -> "Hit:", {@damage 6d8} -> "6d8"
    const attack = screen.getByText(/Antimatter Shots/).closest("div")!;
    expect(attack).toHaveTextContent(
      "Antimatter Shots. Ranged Weapon Attack: +6 to hit, range 120/360 ft., one target. Hit: 16 (6d8) necrotic damage.",
    );
  });
});
