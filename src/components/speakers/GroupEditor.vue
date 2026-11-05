<template>
  <div class="pb-6" data-group-editor>
    <p class="text-muted-foreground px-4 pb-2 text-xs leading-4">
      {{ $t("player_select.group_hint") }}
    </p>
    <RoomSections :sections="sections">
      <template #action="{ section }">
        <Button
          v-if="actionOf(section).kind !== 'none'"
          variant="ghost"
          size="sm"
          class="text-primary"
          @click="applyAction(section)"
        >
          {{
            actionOf(section).kind === "add"
              ? $t("player_select.add_all")
              : $t("player_select.remove_all")
          }}
        </Button>
      </template>
      <template #card="{ room }">
        <RoomCard v-bind="cardProps(room)" @click="toggle" />
      </template>
    </RoomSections>
  </div>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import RoomCard from "@/components/speakers/RoomCard.vue";
import RoomSections from "@/components/speakers/RoomSections.vue";
import { useSpeakerList } from "@/composables/useSpeakerList";
import { canBeGroupMember, groupMemberPickerVisible } from "@/helpers/players";
import { groupLeaderOf, toSections } from "@/helpers/speaker_list";
import {
  boundLeaders,
  canLeaveOwnGroup,
  isLockedMember,
  plainSection,
  type SectionGroupAction,
  sectionGroupAction,
  type SpeakerSection,
} from "@/helpers/speaker_sections";
import { api } from "@/plugins/api";
import {
  PlaybackState,
  type Player,
  PlayerType,
} from "@/plugins/api/interfaces";
import { $t } from "@/plugins/i18n";
import { computed } from "vue";

/**
 * Picks the rooms in the leader's group. A click on a card adds or removes
 * that room at once and the editor stays open, so several rooms can be picked;
 * the buttons on the headings add or remove a whole heading in one go. The
 * leader is a card like the others: taking it out hands the group to one of
 * the rooms left, which keeps playing under the same colour.
 */
const props = defineProps<{
  leader: Player;
}>();

const { list, groupColour } = useSpeakerList();

const allPlayers = computed(() => Object.values(api.players));
const bound = computed(() => boundLeaders(allPlayers.value));
const leaderId = computed(() => props.leader.player_id);
const ownColour = computed(() => groupColour(leaderId.value));

const isMember = (room: Player) =>
  bound.value.get(room.player_id) === leaderId.value;

// The rooms the leader can group with, as the server works them out, plus the
// leader itself and the rooms already in its group (so they can be taken out).
const offeredIds = computed(() => {
  const server = list.value;
  const ids = new Set<string>();
  if (props.leader.type !== PlayerType.GROUP) ids.add(leaderId.value);
  for (const player of allPlayers.value) {
    if (isMember(player)) ids.add(player.player_id);
  }
  if (server) {
    for (const id of server.rooms[leaderId.value]?.group_with ?? [])
      ids.add(id);
    return ids;
  }
  // a server that does not build the list: the stock rules
  for (const player of allPlayers.value) {
    if (
      props.leader.can_group_with.includes(player.player_id) &&
      player.enabled &&
      player.available &&
      groupMemberPickerVisible(player) &&
      canBeGroupMember(player) &&
      player.type !== PlayerType.GROUP &&
      (!player.active_group || player.active_group === leaderId.value)
    ) {
      ids.add(player.player_id);
    }
  }
  return ids;
});

// The server's sections narrowed to those rooms, or one plain block.
const sections = computed(() => {
  const offered = offeredIds.value;
  if (list.value) {
    const skip = new Set(
      Object.keys(api.players).filter((id) => !offered.has(id)),
    );
    return toSections(list.value.sections, api.players, skip);
  }
  return plainSection(allPlayers.value.filter((p) => offered.has(p.player_id)));
});

function cardProps(room: Player) {
  if (room.player_id === leaderId.value) {
    return {
      player: room,
      group: ownColour.value,
      // on its own it is not a group yet, so it says which room it is
      tag: ownColour.value ? undefined : $t("player_select.this_room"),
      inert: !canLeaveOwnGroup(room),
    };
  }
  if (isMember(room)) {
    return {
      player: room,
      group: ownColour.value,
      inert: isLockedMember(room, props.leader),
    };
  }
  const otherLeader = list.value
    ? groupLeaderOf(list.value, room.player_id)
    : bound.value.get(room.player_id);
  return {
    player: room,
    group: groupColour(otherLeader),
    tag:
      room.playback_state === PlaybackState.PLAYING
        ? $t("player_select.playing")
        : undefined,
  };
}

function actionOf(section: SpeakerSection): SectionGroupAction {
  return sectionGroupAction(section, props.leader, bound.value);
}

function toggle(room: Player) {
  if (room.player_id === leaderId.value) {
    // `ungroup` lets the server hand the group and its playback to a member
    void api.playerCommandUnGroup(leaderId.value);
  } else if (isMember(room)) {
    sendMembers(undefined, [room.player_id]);
  } else {
    sendMembers([room.player_id], undefined);
  }
}

function applyAction(section: SpeakerSection) {
  const action = actionOf(section);
  if (action.kind === "add") sendMembers(action.ids, undefined);
  if (action.kind === "remove") sendMembers(undefined, action.ids);
}

function sendMembers(add: string[] | undefined, remove: string[] | undefined) {
  const id = leaderId.value;
  // A failure shows the API's error toast; the leader is read again so the
  // cards show what the server actually holds.
  api.playerCommandSetMembers(id, add, remove).catch(async () => {
    api.players[id] = await api.getPlayer(id);
  });
}
</script>
