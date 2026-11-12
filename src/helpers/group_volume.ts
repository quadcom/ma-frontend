import { speakerList } from "@/composables/speakerListState";
import {
  groupVolumeRoomIds,
  type SpeakerListReply,
} from "@/helpers/speaker_list";
import { type Player, PlayerType } from "@/plugins/api/interfaces";

/**
 * The players that get their own slider in a group's volume list. With the
 * server's speaker list, the group's rooms: a pair or permanent group is one
 * room and its own speakers (hidden) never get a slider, and a room on its
 * own gets no list. Without it, the player's group members plus the player
 * itself unless it is a group player, as upstream does.
 */
export function groupVolumeIds(
  player: Player,
  list: SpeakerListReply | undefined = speakerList.value,
): Set<string> {
  if (list) return new Set(groupVolumeRoomIds(list, player.player_id));
  const ids = new Set(player.group_members);
  if (player.type !== PlayerType.GROUP) ids.add(player.player_id);
  return ids;
}
