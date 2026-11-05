// Groups in the speaker list are named and marked by a colour rather than by
// their leading room, so a group keeps its name when the leader leaves. The
// palette avoids the app's own blue accent, and the colour word is always shown
// next to the colour for people who cannot tell the colours apart.

export const GROUP_COLOURS = [
  { key: "orange", hex: "#fb923c" },
  { key: "purple", hex: "#a855f7" },
  { key: "green", hex: "#22c55e" },
  { key: "pink", hex: "#ec4899" },
  { key: "yellow", hex: "#facc15" },
  { key: "teal", hex: "#14b8a6" },
] as const;

export type GroupColourKey = (typeof GROUP_COLOURS)[number]["key"];

/** A group's colour (an index into GROUP_COLOURS) and the rooms in it. */
export interface TrackedGroup {
  colour: number;
  members: string[];
}

export interface GroupColourUpdate {
  groups: Map<string, TrackedGroup>;
  /** Leaders that left their group, mapped to the room that now leads it. */
  handovers: Map<string, string>;
}

/**
 * Works out the colour of every current group, keyed by leader id.
 *
 * A group keeps its colour while its leader stays. When a leader goes, the
 * colour passes to the new leader whose group was part of the old one: the
 * server hands a group over to one of its members when the leader leaves. A
 * new group takes the lowest colour not in use; past the palette's end the
 * colours repeat.
 */
export function assignGroupColours(
  previous: Map<string, TrackedGroup>,
  current: Map<string, string[]>,
): GroupColourUpdate {
  const groups = new Map<string, TrackedGroup>();
  const handovers = new Map<string, string>();
  for (const [leader, members] of current) {
    const kept = previous.get(leader);
    if (kept) groups.set(leader, { colour: kept.colour, members });
  }
  for (const [oldLeader, old] of previous) {
    if (current.has(oldLeader)) continue;
    const successor = [...current.keys()].find(
      (leader) =>
        !groups.has(leader) &&
        old.members.includes(leader) &&
        current
          .get(leader)!
          .some((m) => m !== leader && old.members.includes(m)),
    );
    if (!successor) continue;
    groups.set(successor, {
      colour: old.colour,
      members: current.get(successor)!,
    });
    handovers.set(oldLeader, successor);
  }
  for (const [leader, members] of current) {
    if (groups.has(leader)) continue;
    groups.set(leader, { colour: lowestFreeColour(groups), members });
  }
  return { groups, handovers };
}

function lowestFreeColour(groups: Map<string, TrackedGroup>): number {
  const used = new Set([...groups.values()].map((group) => group.colour));
  let colour = 0;
  while (
    used.has(colour % GROUP_COLOURS.length) &&
    colour < GROUP_COLOURS.length
  ) {
    colour++;
  }
  return colour % GROUP_COLOURS.length;
}

/**
 * The groups among the players: each leader with the rooms bound to it (the
 * leader first). A room on its own is not a group.
 */
export function currentGroups(
  bound: Map<string, string>,
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const [member, leader] of bound) {
    groups.set(leader, [...(groups.get(leader) ?? [leader]), member]);
  }
  return groups;
}
