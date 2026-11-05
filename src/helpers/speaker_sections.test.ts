import { describe, expect, it } from "vitest";
import { PlaybackState, PlayerType } from "@/plugins/api/interfaces";
import { player } from "../../tests/fixtures/player";
import {
  boundLeaders,
  canLeaveOwnGroup,
  nextTopOrder,
  plainSection,
  playingRoomIds,
  sectionGroupAction,
} from "./speaker_sections";

const room = (id: string, name: string, extra = {}) =>
  player({ player_id: id, name, ...extra });

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

describe("plainSection", () => {
  it("is one block in the order given, with no heading", () => {
    const players = [room("z", "Zen"), room("a", "Attic")];
    expect(plainSection(players)).toEqual([
      { key: "all", title: null, isOther: false, rooms: players },
    ]);
  });
  it("is empty without players", () => {
    expect(plainSection([])).toEqual([]);
  });
});
