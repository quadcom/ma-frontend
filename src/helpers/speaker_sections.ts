// Grouping and sorting rules for the speaker list and the group editor, kept
// free of Vue so they can be tested without a UI. They follow the mobile app's
// speaker list rule for rule, so both clients sort and group rooms the same way.
import { getPlayerDisplayName } from "@/helpers/players";
import {
  PlaybackState,
  type Player,
  PlayerType,
} from "@/plugins/api/interfaces";

export type PlayerGrouping = "floor" | "area" | "label" | "none";

const GROUPINGS: readonly PlayerGrouping[] = ["floor", "area", "label", "none"];

/** Where Home Assistant places a player, as `hass/player_locations` reports it. */
export interface PlayerLocation {
  area: string | null;
  floor: string | null;
  floor_level: number | null;
  labels: string[];
}

export interface PlayerLocationsReply {
  grouping?: string;
  players: Record<string, PlayerLocation>;
  /** Colour key per group leader, when the server keeps group colours. */
  group_colours?: Record<string, string>;
}

/** One heading of the list. A null title is the heading-less block. */
export interface SpeakerSection {
  key: string;
  title: string | null;
  isOther: boolean;
  rooms: Player[];
}

export type SectionGroupAction =
  | { kind: "add"; ids: string[] }
  | { kind: "remove"; ids: string[] }
  | { kind: "none" };

const OTHER_KEY = "other";
const ALL_KEY = "all";

/**
 * The household grouping the server asks for. A reply without one (a server
 * that only reports locations) groups by floor; an unknown value shows one block.
 */
export function parseGrouping(value: unknown): PlayerGrouping {
  if (value === undefined || value === null) return "floor";
  return GROUPINGS.find((grouping) => grouping === value) ?? "none";
}

export function compareRooms(left: Player, right: Player): number {
  return (
    getPlayerDisplayName(left).localeCompare(
      getPlayerDisplayName(right),
      undefined,
      { sensitivity: "base" },
    ) || left.player_id.localeCompare(right.player_id)
  );
}

const byName = (rooms: Player[]): Player[] => [...rooms].sort(compareRooms);

const compareTitles = (left: string, right: string): number =>
  left.localeCompare(right, undefined, { sensitivity: "base" });

/** Maps each room bound into another room's group to that group's leader id. */
export function boundLeaders(players: Player[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const player of players) {
    for (const member of player.group_members) {
      if (member !== player.player_id) result.set(member, player.player_id);
    }
  }
  // A member the leader's list did not name still says whom it follows.
  for (const player of players) {
    const leader = player.synced_to ?? player.active_group;
    if (
      leader &&
      leader !== player.player_id &&
      !result.has(player.player_id)
    ) {
      result.set(player.player_id, leader);
    }
  }
  return result;
}

/** Rooms that get a top row: actually playing and not bound into another group. */
export function playingRoomIds(
  players: Player[],
  bound: Map<string, string>,
): string[] {
  return players
    .filter((player) => !bound.has(player.player_id))
    .filter((player) => player.playback_state === PlaybackState.PLAYING)
    .map((player) => player.player_id);
}

/**
 * Append-only order of the top rows. A room keeps its place until it stops
 * playing and is not the active room; new ones go to the end, so switching the
 * active room never reshuffles the rows.
 */
export function nextTopOrder(
  previous: string[],
  playingIds: string[],
  activeId: string | undefined,
): string[] {
  const wanted = activeId ? [...playingIds, activeId] : playingIds;
  const keep = previous.filter((id) => wanted.includes(id));
  return [...keep, ...new Set(wanted.filter((id) => !keep.includes(id)))];
}

/** The rooms bound to the leader, sorted by name. */
export function membersOf(
  leaderId: string,
  players: Player[],
  bound: Map<string, string>,
): Player[] {
  return byName(
    players.filter((player) => bound.get(player.player_id) === leaderId),
  );
}

/** The name of the room this one is bound into, or undefined when it is free. */
export function groupLeaderName(
  room: Player,
  players: Player[],
  bound: Map<string, string>,
): string | undefined {
  const leaderId = bound.get(room.player_id);
  const leader = players.find((player) => player.player_id === leaderId);
  return leader ? getPlayerDisplayName(leader) : undefined;
}

/**
 * Splits rooms into headings for the chosen grouping. With no locations, or
 * grouping "none", there are no headings, just one block.
 */
export function speakerSections(
  rooms: Player[],
  locations: Record<string, PlayerLocation> | undefined,
  grouping: PlayerGrouping,
): SpeakerSection[] {
  if (rooms.length === 0) return [];
  if (!locations || grouping === "none") {
    return [
      { key: ALL_KEY, title: null, isOther: false, rooms: byName(rooms) },
    ];
  }
  const sections =
    grouping === "floor"
      ? floorSections(rooms, locations)
      : grouping === "area"
        ? areaSections(rooms, locations)
        : labelSections(rooms, locations);
  const placed = new Set(
    sections.flatMap((section) => section.rooms.map((room) => room.player_id)),
  );
  const other = rooms.filter((room) => !placed.has(room.player_id));
  if (other.length === 0) return sections;
  return [
    ...sections,
    { key: OTHER_KEY, title: null, isOther: true, rooms: byName(other) },
  ];
}

/**
 * Highest floor level first; floors on the same level put the one with more
 * rooms first, then the name. A floor without a level comes after every floor
 * that has one. A room with no area or no floor goes under "Other".
 */
function floorSections(
  rooms: Player[],
  locations: Record<string, PlayerLocation>,
): SpeakerSection[] {
  const floors = new Map<string, { level: number | null; rooms: Player[] }>();
  for (const room of rooms) {
    const location = locations[room.player_id];
    if (!location?.area || !location.floor) continue;
    const floor = floors.get(location.floor) ?? { level: null, rooms: [] };
    floor.level ??= location.floor_level;
    floor.rooms.push(room);
    floors.set(location.floor, floor);
  }
  return [...floors.entries()]
    .sort(([leftName, left], [rightName, right]) => {
      if (left.level !== right.level) {
        if (left.level === null) return 1;
        if (right.level === null) return -1;
        return right.level - left.level;
      }
      return (
        right.rooms.length - left.rooms.length ||
        compareTitles(leftName, rightName)
      );
    })
    .map(([name, floor]) => ({
      key: `floor:${name}`,
      title: name,
      isOther: false,
      rooms: byName(floor.rooms),
    }));
}

/** Areas A–Z; a room with no area goes under "Other". */
function areaSections(
  rooms: Player[],
  locations: Record<string, PlayerLocation>,
): SpeakerSection[] {
  return namedSections(rooms, "area", (room) => {
    const area = locations[room.player_id]?.area;
    return area ? [area] : [];
  });
}

/** Labels A–Z; a room is listed under each of its labels, or "Other" if none. */
function labelSections(
  rooms: Player[],
  locations: Record<string, PlayerLocation>,
): SpeakerSection[] {
  return namedSections(
    rooms,
    "label",
    (room) => locations[room.player_id]?.labels ?? [],
  );
}

function namedSections(
  rooms: Player[],
  prefix: string,
  namesOf: (room: Player) => string[],
): SpeakerSection[] {
  const sections = new Map<string, Player[]>();
  for (const room of rooms) {
    for (const name of new Set(namesOf(room))) {
      sections.set(name, [...(sections.get(name) ?? []), room]);
    }
  }
  return [...sections.entries()]
    .sort(([left], [right]) => compareTitles(left, right))
    .map(([name, list]) => ({
      key: `${prefix}:${name}`,
      title: name,
      isOther: false,
      rooms: byName(list),
    }));
}

/** A permanent member of the leader's group, which can never be taken out. */
export function isLockedMember(room: Player, leader: Player): boolean {
  return leader.static_group_members.includes(room.player_id);
}

/**
 * The button on a heading in the group editor: adds the heading's rooms that
 * are not yet in the group, and once all are in, offers to remove them.
 * Unavailable rooms are never added, permanent members never removed, and a
 * room listed twice (under two labels) is sent once. "Other" gets no button.
 */
export function sectionGroupAction(
  section: SpeakerSection,
  leader: Player,
  bound: Map<string, string>,
): SectionGroupAction {
  if (section.isOther || section.title === null) return { kind: "none" };
  const inGroup = (room: Player) =>
    bound.get(room.player_id) === leader.player_id;
  const rooms = section.rooms.filter(
    (room) => room.player_id !== leader.player_id,
  );
  const addable = rooms
    .filter((room) => !inGroup(room) && room.available)
    .map((room) => room.player_id);
  if (addable.length > 0) return { kind: "add", ids: [...new Set(addable)] };
  const removable = rooms
    .filter((room) => inGroup(room) && !isLockedMember(room, leader))
    .map((room) => room.player_id);
  if (removable.length > 0) {
    return { kind: "remove", ids: [...new Set(removable)] };
  }
  return { kind: "none" };
}

/**
 * True when the player leads an ad-hoc sync group it can leave, handing the
 * playback to a remaining member. Group players release the whole session on
 * `ungroup` instead, so they are left out.
 */
export function canLeaveOwnGroup(player: Player): boolean {
  return (
    player.type !== PlayerType.GROUP &&
    player.group_members.some((id) => id !== player.player_id) &&
    !player.active_group &&
    !player.synced_to &&
    !player.static_group_members.includes(player.player_id)
  );
}
