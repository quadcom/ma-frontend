// The speaker list as the server builds it (`hass/speaker_list`): the sections
// in order, the rooms in them, and the groups with their colours. The app only
// draws it; these helpers turn the reply into what the components need and
// never sort or filter what the server decided.
import type { SpeakerSection } from "@/helpers/speaker_sections";
import { PlaybackState, type Player } from "@/plugins/api/interfaces";

export const SPEAKER_LIST_COMMAND = "hass/speaker_list";
/** Adds or removes rooms; a permanent group goes in or out as one speaker. */
export const SET_MEMBERS_COMMAND = "hass/speaker_list/set_members";
/** Plays a short ding on one speaker, to tell left from right. */
export const STEREO_IDENTIFY_COMMAND = "hass/stereo_pair/identify";
/** Saves which speaker of a pair is left; null turns the pair off. */
export const STEREO_SET_COMMAND = "hass/stereo_pair/set";
/** Makes a permanent group of two speakers, ready to become a stereo pair. */
export const STEREO_CREATE_COMMAND = "hass/stereo_pair/create";
export const SPEAKER_LIST_EVENT_SUFFIX = "/speaker_list";

/**
 * The colour words groups are named by, with the colour drawn for each. The
 * server picks the colour; the app only knows how to draw it.
 */
export const GROUP_COLOURS = {
  orange: "#fb923c",
  purple: "#a855f7",
  green: "#22c55e",
  pink: "#ec4899",
  yellow: "#facc15",
  teal: "#14b8a6",
} as const;

export type GroupColourKey = keyof typeof GROUP_COLOURS;

export interface SpeakerListRoom {
  name: string;
  area: string | null;
  floor: string | null;
  floor_level: number | null;
  labels: string[];
  available: boolean;
  /** The leader of the group this room is in, or null. */
  group_leader: string | null;
  is_permanent_group: boolean;
  /** The rooms this one can be grouped with. */
  group_with: string[];
  /** A permanent group of two speakers playing left and right. */
  is_stereo_pair?: boolean;
}

export interface SpeakerListSection {
  key: string;
  kind: "floor" | "area" | "label" | "other" | "all";
  title: string | null;
  rooms: string[];
}

export interface SpeakerListGroup {
  leader: string;
  colour: string;
  members: string[];
}

export interface PermanentGroup {
  player: string;
  name: string;
  members: string[];
  is_stereo_pair?: boolean;
  /** The member playing the left channel, null when not a pair. */
  stereo_left?: string | null;
}

export interface SpeakerListReply {
  revision: number;
  grouping: string;
  sections: SpeakerListSection[];
  rooms: Record<string, SpeakerListRoom>;
  groups: SpeakerListGroup[];
  permanent_groups: PermanentGroup[];
}

/** Whether a reply has the shape the list is drawn from. */
export function isSpeakerListReply(value: unknown): value is SpeakerListReply {
  const reply = value as Partial<SpeakerListReply> | null;
  return (
    !!reply &&
    typeof reply.revision === "number" &&
    Array.isArray(reply.sections) &&
    typeof reply.rooms === "object" &&
    reply.rooms !== null &&
    Array.isArray(reply.groups)
  );
}

/** The colour drawn for a group's colour word, or undefined for an unknown one. */
export function groupColourHex(key: string): string | undefined {
  return key in GROUP_COLOURS
    ? GROUP_COLOURS[key as GroupColourKey]
    : undefined;
}

/**
 * The server's sections with each room id turned into its player, in the
 * server's order. A room the app does not know (yet) is skipped, and a
 * section left empty is dropped.
 */
export function toSections(
  sections: SpeakerListSection[],
  players: Record<string, Player>,
  skip: Set<string> = new Set(),
): SpeakerSection[] {
  return sections.flatMap((section) => {
    const rooms = section.rooms
      .filter((id) => !skip.has(id))
      .map((id) => players[id])
      .filter((player): player is Player => !!player);
    if (rooms.length === 0) return [];
    return [
      {
        key: section.key,
        title: section.kind === "all" ? null : section.title,
        isOther: section.kind === "other",
        rooms,
      },
    ];
  });
}

/** The leader of the group a room is in, itself when it leads one. */
export function groupLeaderOf(
  reply: SpeakerListReply,
  roomId: string,
): string | undefined {
  const leader = reply.rooms[roomId]?.group_leader;
  if (leader) return leader;
  return reply.groups.some((group) => group.leader === roomId)
    ? roomId
    : undefined;
}

/** A group's speakers, the leader first, then its members as the server sent them. */
export function groupSpeakers(group: SpeakerListGroup): string[] {
  return [group.leader, ...group.members.filter((id) => id !== group.leader)];
}

/**
 * Leaders that left their group, mapped to the room that now leads it. The
 * server keeps a group's colour when another room takes it over, so a colour
 * that moves from one leader to a new one is the same group.
 */
export function findHandovers(
  previous: SpeakerListGroup[],
  current: SpeakerListGroup[],
): Map<string, string> {
  const handovers = new Map<string, string>();
  const before = new Set(previous.map((group) => group.leader));
  const now = new Set(current.map((group) => group.leader));
  for (const old of previous) {
    if (now.has(old.leader)) continue;
    const next = current.find(
      (group) => group.colour === old.colour && !before.has(group.leader),
    );
    if (next) handovers.set(old.leader, next.leader);
  }
  return handovers;
}

/**
 * Each room in a group mapped to its group's leader, as the server sees it.
 * A permanent group inside a group is one room here, though the players
 * themselves name its hidden speakers.
 */
export function listLeaders(reply: SpeakerListReply): Map<string, string> {
  const leaders = new Map<string, string>();
  for (const [id, room] of Object.entries(reply.rooms)) {
    if (room.group_leader && room.group_leader !== id) {
      leaders.set(id, room.group_leader);
    }
  }
  return leaders;
}

/**
 * The rooms playing on their own or leading a group, out of the rooms shown.
 * A permanent group plays when any of its speakers does: the server may hand
 * its lead to one of them.
 */
export function listPlayingRoomIds(
  reply: SpeakerListReply,
  rooms: Player[],
  players: Record<string, Player>,
): string[] {
  const playing = (id: string) =>
    players[id]?.playback_state === PlaybackState.PLAYING;
  const leaders = listLeaders(reply);
  return rooms
    .map((room) => room.player_id)
    .filter((id) => {
      if (leaders.has(id)) return false;
      const permanent = permanentGroupOf(reply, id);
      return playing(id) || !!permanent?.members.some(playing);
    });
}

/** The permanent group a room stands for, when it is one. */
export function permanentGroupOf(
  reply: SpeakerListReply,
  roomId: string,
): PermanentGroup | undefined {
  return reply.permanent_groups.find((group) => group.player === roomId);
}
