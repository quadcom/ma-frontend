import { describe, expect, it, vi } from "vitest";
import { player } from "../../tests/fixtures/player";
import { groupColourName, showsGroupIcon } from "./group_label";
import type { SpeakerListReply } from "./speaker_list";
import { PlayerType } from "@/plugins/api/interfaces";

vi.mock("@/plugins/i18n", () => ({ $t: (key: string) => key }));

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

// Master bath (b) leads Orange with the Master Bedroom pair (mb).
const list: SpeakerListReply = {
  revision: 1,
  grouping: "floor",
  sections: [],
  rooms: { b: room(), mb: room("b") },
  groups: [{ leader: "b", colour: "orange", members: ["mb"] }],
  permanent_groups: [],
};
const alone: SpeakerListReply = { ...list, groups: [] };

const bath = player({ player_id: "b", group_members: ["b", "m1", "m2"] });
const pair = player({
  player_id: "mb",
  type: PlayerType.GROUP,
  group_members: ["m1", "m2"],
});

describe("groupColourName", () => {
  it("names a group's leader by the colour", () => {
    expect(groupColourName("b", list)).toBe("player_select.colours.orange");
  });

  it("leaves a room, a member or a lone pair its own name", () => {
    expect(groupColourName("mb", list)).toBeUndefined();
    expect(groupColourName("mb", alone)).toBeUndefined();
    expect(groupColourName("b", undefined)).toBeUndefined();
  });

  it("names a pair that leads a group by the colour too", () => {
    const pairLeads: SpeakerListReply = {
      ...list,
      groups: [{ leader: "mb", colour: "purple", members: ["b"] }],
    };
    expect(groupColourName("mb", pairLeads)).toBe(
      "player_select.colours.purple",
    );
  });
});

describe("showsGroupIcon", () => {
  it("draws the group icon for a group's leader only", () => {
    expect(showsGroupIcon(bath, list)).toBe(true);
    expect(showsGroupIcon(pair, list)).toBe(false);
  });

  it("keeps a lone pair's own icon, though its speakers are its members", () => {
    expect(showsGroupIcon(pair, alone)).toBe(false);
  });

  it("follows the players without the server's list", () => {
    expect(showsGroupIcon(bath, undefined)).toBe(true);
    expect(showsGroupIcon(pair, undefined)).toBe(false);
    expect(showsGroupIcon(player({ group_members: [] }), undefined)).toBe(
      false,
    );
  });
});
