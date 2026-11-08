import { type AreasReply, roomsByFloor } from "@/helpers/areas";
import { describe, expect, it } from "vitest";

function reply(): AreasReply {
  return {
    floors: [
      { floor_id: "up", name: "Upstairs", level: 1 },
      { floor_id: "empty", name: "Attic", level: 2 },
      { floor_id: "main", name: "Main", level: 0 },
    ],
    areas: [
      { area_id: "kitchen", name: "Kitchen", floor_id: "main" },
      { area_id: "bed", name: "Bedroom", floor_id: "up" },
      { area_id: "garage", name: "Garage", floor_id: null },
      { area_id: "den", name: "Den", floor_id: "main" },
      { area_id: "shed", name: "Shed", floor_id: "gone" },
    ],
    player_areas: {},
  };
}

describe("roomsByFloor", () => {
  it("keeps Home Assistant's order and drops empty floors", () => {
    const groups = roomsByFloor(reply());

    expect(groups.map((g) => g.floor?.name ?? null)).toEqual([
      "Upstairs",
      "Main",
      null,
    ]);
    expect(groups[1]!.rooms.map((r) => r.name)).toEqual(["Kitchen", "Den"]);
  });

  it("puts rooms on no floor or a missing floor last", () => {
    const groups = roomsByFloor(reply());

    expect(groups.at(-1)!.rooms.map((r) => r.name)).toEqual(["Garage", "Shed"]);
  });

  it("has no loose group when every room has a floor", () => {
    const all = reply();
    all.areas = all.areas.filter((a) => a.floor_id === "main");

    expect(roomsByFloor(all)).toHaveLength(1);
  });
});
