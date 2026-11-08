import { describe, expect, it } from "vitest";
import { player } from "../../tests/fixtures/player";
import {
  findHandovers,
  groupColourHex,
  groupLeaderOf,
  groupSpeakers,
  isSpeakerListReply,
  listLeaders,
  listPlayingRoomIds,
  permanentGroupOf,
  type SpeakerListReply,
  toSections,
} from "./speaker_list";
import { PlaybackState } from "@/plugins/api/interfaces";

const roomEntry = (group_leader: string | null = null) => ({
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

const reply: SpeakerListReply = {
  revision: 3,
  grouping: "floor",
  sections: [
    { key: "floor:main", kind: "floor", title: "Main", rooms: ["k", "d", "x"] },
    { key: "other", kind: "other", title: null, rooms: ["g"] },
  ],
  rooms: { k: roomEntry(), d: roomEntry("k"), g: roomEntry(), x: roomEntry() },
  groups: [{ leader: "k", colour: "orange", members: ["d"] }],
  permanent_groups: [],
};

const players = {
  k: player({ player_id: "k", name: "Kitchen" }),
  d: player({ player_id: "d", name: "Dining" }),
  g: player({ player_id: "g", name: "Gym" }),
};

describe("isSpeakerListReply", () => {
  it("accepts the server's shape", () => {
    expect(isSpeakerListReply(reply)).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isSpeakerListReply(null)).toBe(false);
    expect(isSpeakerListReply({ players: {} })).toBe(false);
  });
});

describe("toSections", () => {
  it("keeps the server's order and skips rooms the app does not know", () => {
    expect(
      toSections(reply.sections, players).map((s) => [
        s.title,
        s.isOther,
        s.rooms.map((r) => r.player_id),
      ]),
    ).toEqual([
      ["Main", false, ["k", "d"]],
      [null, true, ["g"]],
    ]);
  });
  it("leaves out rooms shown elsewhere and drops an emptied section", () => {
    const sections = toSections(reply.sections, players, new Set(["g"]));
    expect(sections.map((s) => s.key)).toEqual(["floor:main"]);
  });
  it("draws grouping none as one block without a heading", () => {
    const all = toSections(
      [{ key: "all", kind: "all", title: "ignored", rooms: ["k"] }],
      players,
    );
    expect(all[0].title).toBeNull();
  });
});

describe("groups", () => {
  it("finds a room's group leader, itself when it leads", () => {
    expect(groupLeaderOf(reply, "d")).toBe("k");
    expect(groupLeaderOf(reply, "k")).toBe("k");
    expect(groupLeaderOf(reply, "g")).toBeUndefined();
  });
  it("puts the leader first among a group's speakers", () => {
    expect(
      groupSpeakers({
        leader: "k",
        colour: "orange",
        members: ["a", "k", "b"],
      }),
    ).toEqual(["k", "a", "b"]);
  });
  it("knows the drawn colour of each colour word", () => {
    expect(groupColourHex("orange")).toBe("#fb923c");
    expect(groupColourHex("blue")).toBeUndefined();
  });
});

describe("findHandovers", () => {
  it("follows a colour to its new leader", () => {
    const before = [
      { leader: "k", colour: "orange", members: ["d", "l"] },
      { leader: "g", colour: "purple", members: ["b"] },
    ];
    const after = [
      { leader: "g", colour: "purple", members: ["b"] },
      { leader: "d", colour: "orange", members: ["l"] },
    ];
    expect([...findHandovers(before, after)]).toEqual([["k", "d"]]);
  });
  it("sees no handover when a group simply ends", () => {
    const before = [{ leader: "k", colour: "orange", members: ["d"] }];
    expect(findHandovers(before, []).size).toBe(0);
  });
});

describe("membership from the list", () => {
  // Master Bedroom (mb, speakers m1 and m2, hidden) is in Kitchen's group.
  const withPermanent: SpeakerListReply = {
    ...reply,
    rooms: { ...reply.rooms, mb: roomEntry("k") },
    groups: [{ leader: "k", colour: "orange", members: ["d", "mb"] }],
    permanent_groups: [
      { player: "mb", name: "Master Bedroom", members: ["m1", "m2"] },
    ],
  };

  it("maps each room in a group to its leader, a permanent group as one room", () => {
    expect([...listLeaders(withPermanent)]).toEqual([
      ["d", "k"],
      ["mb", "k"],
    ]);
  });

  it("finds a permanent group by its room", () => {
    expect(permanentGroupOf(withPermanent, "mb")?.members).toEqual([
      "m1",
      "m2",
    ]);
    expect(permanentGroupOf(withPermanent, "k")).toBeUndefined();
  });

  it("counts a permanent group as playing when one of its speakers plays", () => {
    const lead: SpeakerListReply = {
      ...withPermanent,
      rooms: { ...withPermanent.rooms, mb: roomEntry() },
      groups: [],
    };
    const all = {
      ...players,
      mb: player({ player_id: "mb", name: "Master Bedroom" }),
      m1: player({ player_id: "m1", playback_state: PlaybackState.PLAYING }),
      x: player({ player_id: "x", playback_state: PlaybackState.PLAYING }),
    };
    expect(listPlayingRoomIds(lead, [all.k, all.mb, all.x], all)).toEqual([
      "mb",
      "x",
    ]);
  });

  it("leaves out a room that plays inside another room's group", () => {
    const all = {
      ...players,
      d: player({ player_id: "d", playback_state: PlaybackState.PLAYING }),
    };
    expect(listPlayingRoomIds(withPermanent, [all.k, all.d], all)).toEqual([]);
  });
});
