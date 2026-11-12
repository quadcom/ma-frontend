import { describe, expect, it } from "vitest";
import { player } from "../../tests/fixtures/player";
import { groupVolumeIds } from "./group_volume";
import type { SpeakerListReply } from "./speaker_list";
import { PlayerType } from "@/plugins/api/interfaces";

const room = (group_leader: string | null = null) => ({
  name: "",
  area: null,
  floor: null,
  floor_level: null,
  labels: [],
  available: true,
  group_leader,
  is_permanent_group: false,
  group_with: [],
});

// Master bath (b) leads with the Master Bedroom pair (mb: hidden m1 + m2).
const list: SpeakerListReply = {
  revision: 1,
  grouping: "floor",
  sections: [],
  rooms: { b: room(), mb: room("b") },
  groups: [{ leader: "b", colour: "orange", members: ["mb"] }],
  permanent_groups: [
    { player: "mb", name: "Master Bedroom", members: ["m1", "m2"] },
  ],
};

const bath = player({
  player_id: "b",
  group_members: ["b", "m2", "m1"],
});
const pair = player({
  player_id: "mb",
  type: PlayerType.GROUP,
  group_members: ["m1", "m2"],
});

describe("groupVolumeIds", () => {
  it("gives a group its rooms, the pair as one, never its speakers", () => {
    expect([...groupVolumeIds(bath, list)]).toEqual(["b", "mb"]);
    expect([...groupVolumeIds(pair, list)]).toEqual(["b", "mb"]);
  });

  it("gives a pair on its own no list", () => {
    expect([...groupVolumeIds(pair, { ...list, groups: [] })]).toEqual([]);
  });

  it("falls back to the players without the server's list", () => {
    expect([...groupVolumeIds(bath, undefined)]).toEqual(["b", "m2", "m1"]);
    expect([...groupVolumeIds(pair, undefined)]).toEqual(["m1", "m2"]);
  });
});
