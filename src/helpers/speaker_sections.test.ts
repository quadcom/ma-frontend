import { describe, expect, it } from "vitest";
import { PlaybackState, PlayerType } from "@/plugins/api/interfaces";
import { player } from "../../tests/fixtures/player";
import {
  boundLeaders,
  canLeaveOwnGroup,
  membersOf,
  nextTopOrder,
  parseGrouping,
  permanentGroupRooms,
  playingRoomIds,
  type PlayerLocation,
  sectionGroupAction,
  speakerSections,
} from "./speaker_sections";

const room = (id: string, name: string, extra = {}) =>
  player({ player_id: id, name, ...extra });

const at = (
  area: string | null,
  floor: string | null,
  floor_level: number | null,
  labels: string[] = [],
): PlayerLocation => ({ area, floor, floor_level, labels });

const ids = (sections: ReturnType<typeof speakerSections>) =>
  sections.map((section) => [
    section.isOther ? "Other" : section.title,
    section.rooms.map((r) => r.player_id),
  ]);

describe("parseGrouping", () => {
  it("groups by floor when the server sends no choice", () => {
    expect(parseGrouping(undefined)).toBe("floor");
    expect(parseGrouping(null)).toBe("floor");
  });
  it("follows a known choice", () => {
    expect(parseGrouping("label")).toBe("label");
  });
  it("shows one block for an unknown choice", () => {
    expect(parseGrouping("zones")).toBe("none");
  });
});

describe("boundLeaders", () => {
  it("maps members to their leader, never the leader to itself", () => {
    const players = [
      room("k", "Kitchen", { group_members: ["k", "d"] }),
      room("d", "Dining", { synced_to: "k" }),
      room("p", "Patio", { synced_to: "x" }),
    ];
    expect([...boundLeaders(players)]).toEqual([
      ["d", "k"],
      ["p", "x"],
    ]);
  });
  it("counts the members of an active group player", () => {
    const players = [
      room("g", "Group", { type: PlayerType.GROUP }),
      room("a", "A", { active_group: "g" }),
    ];
    expect(boundLeaders(players).get("a")).toBe("g");
  });
});

describe("top rows", () => {
  it("lists only rooms that are playing and not bound elsewhere", () => {
    const players = [
      room("k", "Kitchen", {
        playback_state: PlaybackState.PLAYING,
        group_members: ["k", "d"],
      }),
      room("d", "Dining", {
        playback_state: PlaybackState.PLAYING,
        synced_to: "k",
      }),
      room("m", "Master", { playback_state: PlaybackState.PAUSED }),
    ];
    expect(playingRoomIds(players, boundLeaders(players))).toEqual(["k"]);
  });
  it("keeps the order when the active room changes", () => {
    expect(nextTopOrder(["k", "p"], ["k", "p"], "p")).toEqual(["k", "p"]);
  });
  it("appends new rooms and the active one at the end", () => {
    expect(nextTopOrder(["k"], ["k", "p"], "g")).toEqual(["k", "p", "g"]);
  });
  it("drops a room once it stops playing and is not active", () => {
    expect(nextTopOrder(["k", "p"], ["p"], "p")).toEqual(["p"]);
  });
  it("sorts a group's members by name", () => {
    const players = [
      room("k", "Kitchen", { group_members: ["k", "z", "a"] }),
      room("z", "Zen"),
      room("a", "Attic"),
    ];
    expect(
      membersOf("k", players, boundLeaders(players)).map((p) => p.player_id),
    ).toEqual(["a", "z"]);
  });
});

describe("speakerSections", () => {
  const rooms = [
    room("k", "Kitchen"),
    room("g", "Garage bay"),
    room("b", "Bedroom"),
    room("o", "Office"),
    room("x", "Screen"),
    room("n", "No floor"),
  ];
  const locations = {
    k: at("Kitchen", "Main", 1, ["Party", "Downstairs"]),
    o: at("Office", "Main", 1, ["Party"]),
    g: at("Garage", "Garage", 1),
    b: at("Bedroom", "Basement", -1),
    n: at("Hall", null, null),
  };

  it("sorts floors by level, then more rooms, then name; Other last", () => {
    expect(ids(speakerSections(rooms, locations, "floor"))).toEqual([
      ["Main", ["k", "o"]],
      ["Garage", ["g"]],
      ["Basement", ["b"]],
      ["Other", ["n", "x"]],
    ]);
  });

  it("puts a floor without a level after floors that have one", () => {
    const sections = speakerSections(
      [room("a", "A"), room("b", "B")],
      { a: at("A", "Loft", null), b: at("B", "Deep", -5) },
      "floor",
    );
    expect(ids(sections)).toEqual([
      ["Deep", ["b"]],
      ["Loft", ["a"]],
    ]);
  });

  it("puts a room with a floor but no area under Other", () => {
    const sections = speakerSections(
      [room("a", "A")],
      { a: at(null, "Main", 1) },
      "floor",
    );
    expect(ids(sections)).toEqual([["Other", ["a"]]]);
  });

  it("sorts areas A to Z", () => {
    expect(ids(speakerSections(rooms, locations, "area"))).toEqual([
      ["Bedroom", ["b"]],
      ["Garage", ["g"]],
      ["Hall", ["n"]],
      ["Kitchen", ["k"]],
      ["Office", ["o"]],
      ["Other", ["x"]],
    ]);
  });

  it("repeats a room under each of its labels", () => {
    expect(ids(speakerSections(rooms, locations, "label"))).toEqual([
      ["Downstairs", ["k"]],
      ["Party", ["k", "o"]],
      ["Other", ["b", "g", "n", "x"]],
    ]);
  });

  it("shows one block for none, or without locations", () => {
    expect(ids(speakerSections(rooms, locations, "none"))).toEqual([
      [null, ["b", "g", "k", "n", "o", "x"]],
    ]);
    expect(ids(speakerSections(rooms, undefined, "floor"))).toEqual([
      [null, ["b", "g", "k", "n", "o", "x"]],
    ]);
  });
});

describe("group editor", () => {
  const leader = room("k", "Kitchen", {
    group_members: ["k", "d"],
    static_group_members: [],
  });
  const players = [
    leader,
    room("d", "Dining"),
    room("p", "Patio", { playback_state: PlaybackState.PLAYING }),
    room("l", "Living", { synced_to: "p" }),
    room("u", "Unplugged", { available: false }),
    room("i", "Idle"),
  ];
  const bound = boundLeaders(players);
  const section = (list: string[], isOther = false) => ({
    key: "s",
    title: isOther ? null : "Main",
    isOther,
    rooms: players.filter((p) => list.includes(p.player_id)),
  });

  it("adds the rooms not yet in, never an unavailable one", () => {
    expect(sectionGroupAction(section(["d", "i", "u"]), leader, bound)).toEqual(
      { kind: "add", ids: ["i"] },
    );
  });

  it("removes them once all are in, never a permanent member", () => {
    const locked = {
      ...leader,
      group_members: ["k", "d", "i"],
      static_group_members: ["i"],
    };
    const lockedPlayers = players.map((p) =>
      p.player_id === "k" ? locked : p,
    );
    const action = sectionGroupAction(
      section(["d", "i"]),
      locked,
      boundLeaders(lockedPlayers),
    );
    expect(action).toEqual({ kind: "remove", ids: ["d"] });
  });

  it("sends a room listed twice only once", () => {
    const twice = { ...section(["i"]), rooms: [players[5], players[5]] };
    expect(sectionGroupAction(twice, leader, bound)).toEqual({
      kind: "add",
      ids: ["i"],
    });
  });

  it("gives Other no button", () => {
    expect(sectionGroupAction(section(["i"], true), leader, bound)).toEqual({
      kind: "none",
    });
  });

  it("lets a sync leader leave its own group, not a group player", () => {
    expect(canLeaveOwnGroup(leader)).toBe(true);
    expect(canLeaveOwnGroup({ ...leader, type: PlayerType.GROUP })).toBe(false);
    expect(canLeaveOwnGroup(room("i", "Idle"))).toBe(false);
  });
});

describe("permanentGroupRooms", () => {
  it("lists the rooms of permanent group players only", () => {
    const players = [
      room("g", "Master Bedroom", {
        type: PlayerType.GROUP,
        static_group_members: ["mb1"],
        // a sync group holds its rooms as members
        group_members: ["mb2"],
      }),
      room("k", "Kitchen", { group_members: ["k", "d"] }),
    ];
    expect([...permanentGroupRooms(players)]).toEqual(["mb1", "mb2"]);
  });
});
