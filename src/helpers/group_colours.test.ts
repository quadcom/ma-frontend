import { describe, expect, it } from "vitest";
import {
  assignGroupColours,
  currentGroups,
  GROUP_COLOURS,
  type TrackedGroup,
} from "./group_colours";

const groups = (entries: [string, string[]][]) => new Map(entries);
const colours = (result: Map<string, TrackedGroup>) =>
  Object.fromEntries([...result].map(([leader, g]) => [leader, g.colour]));

describe("currentGroups", () => {
  it("lists each leader first with the rooms bound to it", () => {
    const bound = new Map([
      ["d", "k"],
      ["l", "k"],
      ["b", "g"],
    ]);
    expect([...currentGroups(bound)]).toEqual([
      ["k", ["k", "d", "l"]],
      ["g", ["g", "b"]],
    ]);
  });
});

describe("assignGroupColours", () => {
  it("gives new groups the lowest free colours", () => {
    const { groups: result } = assignGroupColours(
      new Map(),
      groups([
        ["k", ["k", "d"]],
        ["g", ["g", "b"]],
      ]),
    );
    expect(colours(result)).toEqual({ k: 0, g: 1 });
  });

  it("keeps a group's colour while its leader stays", () => {
    const first = assignGroupColours(
      new Map(),
      groups([
        ["k", ["k", "d"]],
        ["g", ["g", "b"]],
      ]),
    ).groups;
    // Kitchen's group ends; Gym stays purple, a new group takes orange
    const next = assignGroupColours(
      first,
      groups([
        ["g", ["g", "b", "x"]],
        ["p", ["p", "q"]],
      ]),
    ).groups;
    expect(colours(next)).toEqual({ g: 1, p: 0 });
  });

  it("passes the colour on when the leader leaves", () => {
    const first = assignGroupColours(
      new Map(),
      groups([
        ["g", ["g", "b"]],
        ["k", ["k", "d", "l"]],
      ]),
    ).groups;
    const { groups: next, handovers } = assignGroupColours(
      first,
      groups([
        ["g", ["g", "b"]],
        ["d", ["d", "l"]],
      ]),
    );
    expect(colours(next)).toEqual({ g: 0, d: 1 });
    expect([...handovers]).toEqual([["k", "d"]]);
  });

  it("frees the colour when a group ends with nobody left to lead", () => {
    const first = assignGroupColours(
      new Map(),
      groups([["k", ["k", "d"]]]),
    ).groups;
    const { groups: next, handovers } = assignGroupColours(first, new Map());
    expect(next.size).toBe(0);
    expect(handovers.size).toBe(0);
  });

  it("repeats the palette once every colour is in use", () => {
    const many = groups(
      Array.from({ length: GROUP_COLOURS.length + 1 }, (_, i) => [
        `l${i}`,
        [`l${i}`, `m${i}`],
      ]),
    );
    const result = assignGroupColours(new Map(), many).groups;
    expect(result.get(`l${GROUP_COLOURS.length}`)?.colour).toBe(0);
  });
});
