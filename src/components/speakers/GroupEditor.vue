<template>
  <div class="pb-6" data-group-editor>
    <p class="text-muted-foreground px-4 pb-2 text-xs leading-4">
      {{ $t("player_select.group_hint") }}
    </p>
    <div class="flex items-center gap-4 px-4 py-1">
      <RoomCard
        :player="leader"
        :tag="$t('player_select.this_room')"
        strong-tag
        :highlighted="true"
        inert
      />
      <Button v-if="canLeave" variant="outline" @click="leaveGroup">
        {{ $t("player_select.leave_group") }}
      </Button>
    </div>
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
        <RoomCard
          :player="room"
          :highlighted="isMember(room)"
          :tag="tagOf(room)"
          strong-tag
          :inert="isMember(room) && isLockedMember(room, leader)"
          @click="toggle"
        />
      </template>
    </RoomSections>
  </div>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import RoomCard from "@/components/speakers/RoomCard.vue";
import RoomSections from "@/components/speakers/RoomSections.vue";
import { useSpeakerLocations } from "@/composables/useSpeakerLocations";
import { canBeGroupMember, groupMemberPickerVisible } from "@/helpers/players";
import {
  boundLeaders,
  canLeaveOwnGroup,
  editorTag,
  isLockedMember,
  type SectionGroupAction,
  sectionGroupAction,
  type SpeakerSection,
  speakerSections,
} from "@/helpers/speaker_sections";
import { api } from "@/plugins/api";
import { type Player, PlayerType } from "@/plugins/api/interfaces";
import { $t } from "@/plugins/i18n";
import { computed } from "vue";

/**
 * Picks the rooms grouped with the leader. A click on a card adds or removes
 * that room at once and the editor stays open, so several rooms can be picked;
 * the buttons on the headings add or remove a whole heading in one go.
 */
const props = defineProps<{
  leader: Player;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { locations, grouping } = useSpeakerLocations();

const allPlayers = computed(() => Object.values(api.players));
const bound = computed(() => boundLeaders(allPlayers.value));

const isMember = (room: Player) =>
  bound.value.get(room.player_id) === props.leader.player_id;

// The rooms the leader can group with; an unreachable room is only offered
// while it is in this group, so it can be taken out.
const offered = computed(() =>
  allPlayers.value.filter((player) => {
    if (player.player_id === props.leader.player_id) return false;
    if (isMember(player)) return true;
    return (
      props.leader.can_group_with.includes(player.player_id) &&
      player.enabled &&
      player.available &&
      groupMemberPickerVisible(player) &&
      canBeGroupMember(player) &&
      player.type !== PlayerType.GROUP &&
      (!player.active_group || player.active_group === props.leader.player_id)
    );
  }),
);

const sections = computed(() =>
  speakerSections(offered.value, locations.value, grouping.value),
);

const canLeave = computed(() => canLeaveOwnGroup(props.leader));

function tagOf(room: Player): string | undefined {
  const tag = editorTag(room, props.leader, allPlayers.value, bound.value);
  if (tag.kind === "named") return tag.name;
  if (tag.kind === "playing") return $t("player_select.playing");
  if (tag.kind === "this_room") return $t("player_select.this_room");
  return undefined;
}

function actionOf(section: SpeakerSection): SectionGroupAction {
  return sectionGroupAction(section, props.leader, bound.value);
}

function toggle(room: Player) {
  if (isMember(room)) {
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
  const leaderId = props.leader.player_id;
  // A failure shows the API's error toast; the leader is read again so the
  // cards show what the server actually holds.
  api.playerCommandSetMembers(leaderId, add, remove).catch(async () => {
    api.players[leaderId] = await api.getPlayer(leaderId);
  });
}

function leaveGroup() {
  // `ungroup` lets the server hand the playback to a remaining member.
  void api.playerCommandUnGroup(props.leader.player_id);
  emit("close");
}
</script>
