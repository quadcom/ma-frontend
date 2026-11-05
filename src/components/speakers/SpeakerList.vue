<template>
  <div class="pb-6" data-speaker-list>
    <p
      v-if="players.length === 0"
      class="text-muted-foreground px-3 py-8 text-center text-sm"
    >
      {{ $t("no_content") }}
    </p>
    <TransitionGroup
      tag="div"
      class="relative space-y-2 px-4 pt-1"
      move-class="transition-transform duration-300"
      enter-active-class="transition-opacity duration-200"
      leave-active-class="absolute inset-x-4 transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-for="row in topRows"
        :key="row.player.player_id"
        class="space-y-1.5"
      >
        <PlayingRoomRow
          :player="row.player"
          :active="row.player.player_id === activeId"
          @select="emit('select', $event)"
          @open-group-editor="emit('openGroupEditor', $event)"
        />
        <div v-if="row.members.length > 0" class="flex flex-wrap gap-1.5 pl-4">
          <RoomCard
            v-for="member in row.members"
            :key="member.player_id"
            :player="member"
            inert
          />
        </div>
      </div>
    </TransitionGroup>
    <Separator
      v-if="topRows.length > 0 && (sections.length > 0 || builtinRoom)"
      class="mt-4 mb-3"
    />
    <RoomSections :sections="sections">
      <template #card="{ room }">
        <RoomCard v-bind="cardProps(room)" @click="emit('select', $event)" />
      </template>
    </RoomSections>
    <RoomSections v-if="builtinRoom" :sections="builtinSections">
      <template #card="{ room }">
        <RoomCard v-bind="cardProps(room)" @click="emit('select', $event)" />
      </template>
    </RoomSections>
  </div>
</template>

<script setup lang="ts">
import { Separator } from "@/components/ui/separator";
import PlayingRoomRow from "@/components/speakers/PlayingRoomRow.vue";
import RoomCard from "@/components/speakers/RoomCard.vue";
import RoomSections from "@/components/speakers/RoomSections.vue";
import { useSpeakerLocations } from "@/composables/useSpeakerLocations";
import { isBuiltinPlayer, isPlayerUnavailable } from "@/helpers/players";
import {
  boundLeaders,
  groupLeaderName,
  membersOf,
  nextTopOrder,
  playingRoomIds,
  type SpeakerSection,
  speakerSections,
} from "@/helpers/speaker_sections";
import { api } from "@/plugins/api";
import { type Player, PlayerType } from "@/plugins/api/interfaces";
import { $t } from "@/plugins/i18n";
import { computed, watch } from "vue";

/**
 * The speaker list: a row per playing room (plus the active one) on top with
 * its group members under it, then every other room as a square card under
 * the household's headings, and this device last. Rooms in a group ignore
 * clicks: adding and removing happens in the group editor.
 */
const props = defineProps<{
  players: Player[];
  activeId: string | undefined;
  topOrder: string[];
}>();

const emit = defineEmits<{
  select: [player: Player];
  openGroupEditor: [player: Player];
  "update:topOrder": [order: string[]];
}>();

const { locations, grouping } = useSpeakerLocations();

const bound = computed(() => boundLeaders(Object.values(api.players)));

const order = computed(() => {
  const visibleIds = new Set(props.players.map((p) => p.player_id));
  return nextTopOrder(
    props.topOrder,
    playingRoomIds(props.players, bound.value),
    props.activeId,
  ).filter((id) => visibleIds.has(id));
});

watch(
  order,
  (value) => {
    if (value.join() !== props.topOrder.join()) emit("update:topOrder", value);
  },
  { immediate: true },
);

const topIds = computed(() => new Set(order.value));

const topRows = computed(() =>
  order.value.flatMap((id) => {
    const player = props.players.find((p) => p.player_id === id);
    if (!player) return [];
    const members = membersOf(id, props.players, bound.value).filter(
      (member) => !topIds.value.has(member.player_id),
    );
    return [{ player, members }];
  }),
);

const builtinRoom = computed(() =>
  props.players.find(
    (p) => isBuiltinPlayer(p) && !topIds.value.has(p.player_id),
  ),
);

const sections = computed(() =>
  speakerSections(
    props.players.filter(
      (p) => !topIds.value.has(p.player_id) && p !== builtinRoom.value,
    ),
    locations.value,
    grouping.value,
  ),
);

const builtinSections = computed<SpeakerSection[]>(() =>
  builtinRoom.value
    ? [
        {
          key: "this-device",
          title: $t("this_device"),
          isOther: false,
          rooms: [builtinRoom.value],
        },
      ]
    : [],
);

function cardProps(room: Player) {
  const leaderName = groupLeaderName(
    room,
    Object.values(api.players),
    bound.value,
  );
  const unavailable = isPlayerUnavailable(room);
  const tag =
    leaderName ??
    (room.needs_setup
      ? $t("settings.setup_required")
      : unavailable
        ? $t("player_select.unavailable")
        : undefined);
  return {
    player: room,
    tag,
    dimmed: leaderName !== undefined || unavailable,
    inert:
      leaderName !== undefined ||
      unavailable ||
      room.type === PlayerType.SOURCE,
  };
}
</script>
