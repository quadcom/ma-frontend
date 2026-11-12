import { speakerList } from "@/composables/speakerListState";
import { groupColourHex, type SpeakerListReply } from "@/helpers/speaker_list";
import { type Player, PlayerType } from "@/plugins/api/interfaces";
import { $t } from "@/plugins/i18n";

/**
 * The colour word a group goes by ("Orange") while this room leads a group in
 * the server's speaker list, whoever leads it (a pair or permanent group too).
 * Undefined for a room on its own, or without the server's list. Where the
 * active player is named during playback, this replaces the leading room's
 * name and its "+N" (Adrian, 2026-11-11).
 */
export function groupColourName(
  playerId: string | undefined,
  list: SpeakerListReply | undefined = speakerList.value,
): string | undefined {
  if (!playerId || !list) return undefined;
  const group = list.groups.find((g) => g.leader === playerId);
  if (!group || !groupColourHex(group.colour)) return undefined;
  return $t(`player_select.colours.${group.colour}`);
}

/**
 * Whether to draw the group speaker icon instead of the room's own: while the
 * room leads a group in the server's list, never for a room, pair or permanent
 * group on its own. Without the server's list, upstream's rule (a player with
 * group members) stays.
 */
export function showsGroupIcon(
  player: Player | undefined,
  list: SpeakerListReply | undefined = speakerList.value,
): boolean {
  if (!player) return false;
  if (list) return list.groups.some((g) => g.leader === player.player_id);
  return (
    player.type === PlayerType.PLAYER &&
    player.group_members.some((id) => id !== player.player_id)
  );
}
