// Rules the speaker list and the group editor still apply in the app: which
// rooms get a top row and in what order, and the group editor's buttons. The
// sections themselves come finished from the server (see speaker_list.ts);
// these helpers never sort or filter them. Kept free of Vue so they can be
// tested without a UI.
import {
  PlaybackState,
  type Player,
  PlayerType,
} from "@/plugins/api/interfaces";

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

/**
 * The list on a server that does not build it (no Home Assistant provider, or
 * a stock server): one block of the players as the server holds them, with no
 * headings and no sorting (Adrian, 2026-11-05).
 */
export function plainSection(players: Player[]): SpeakerSection[] {
  return players.length === 0
    ? []
    : [{ key: "all", title: null, isOther: false, rooms: players }];
}

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
 * Order of the top rows. A room keeps its place until it stops playing and is
 * not the active room. A new room takes the place of one that just left (a
 * newly picked room replaces the one picked before, in its slot), and any
 * others go to the end, so switching the active room never reshuffles or
 * resizes the rows (Adrian, 2026-11-13).
 */
export function nextTopOrder(
  previous: string[],
  playingIds: string[],
  activeId: string | undefined,
): string[] {
  const wanted = new Set(activeId ? [...playingIds, activeId] : playingIds);
  const incoming = [...wanted].filter((id) => !previous.includes(id));
  const order = previous.flatMap((id) => {
    if (wanted.has(id)) return [id];
    const next = incoming.shift();
    return next ? [next] : [];
  });
  return [...order, ...incoming];
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
