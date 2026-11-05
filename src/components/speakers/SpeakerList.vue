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
      move-class="transition-transform duration-500"
      enter-active-class="transition-[opacity,transform] duration-1500 ease-out"
      leave-active-class="absolute inset-x-4 transition-[opacity,transform] duration-1500 ease-in"
      enter-from-class="-translate-y-2 opacity-0"
      leave-to-class="-translate-y-2 opacity-0"
    >
      <div
        v-for="row in topRows"
        :key="row.player.player_id"
        class="space-y-1.5"
      >
        <PlayingRoomRow
          :player="row.player"
          :active="row.player.player_id === activeId"
          :group="row.group"
          @select="emit('select', $event)"
          @open-group-editor="emit('openGroupEditor', $event)"
        />
        <div v-if="row.speakers.length > 0" class="grid grid-cols-4 gap-2 pl-4">
          <RoomCard
            v-for="speaker in row.speakers"
            :key="speaker.player_id"
            :player="speaker"
            :group="row.group"
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
        <RoomCard v-bind="cardProps(room)" @click="selectRoom" />
      </template>
    </RoomSections>
    <RoomSections v-if="builtinRoom" :sections="builtinSections">
      <template #card="{ room }">
        <RoomCard v-bind="cardProps(room)" @click="selectRoom" />
      </template>
    </RoomSections>
  </div>
</template>

<script setup lang="ts">
import { Separator } from "@/components/ui/separator";
import PlayingRoomRow from "@/components/speakers/PlayingRoomRow.vue";
import RoomCard from "@/components/speakers/RoomCard.vue";
import RoomSections from "@/components/speakers/RoomSections.vue";
import { useGroupColours } from "@/composables/useGroupColours";
import { useSpeakerLocations } from "@/composables/useSpeakerLocations";
import { isBuiltinPlayer, isPlayerUnavailable } from "@/helpers/players";
import {
  boundLeaders,
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
 * The speaker list: a row per playing room or group (plus the active one) on
 * top, a group's speakers as cards under its row, then every room as a square
 * card under the household's headings, and this device last. A group's
 * speakers stay greyed under their headings, marked with the group's colour;
 * a click on one selects its group.
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
const { groupColour } = useGroupColours();

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

const topRows = computed(() =>
  order.value.flatMap((id) => {
    const player = props.players.find((p) => p.player_id === id);
    if (!player) return [];
    const group = groupColour(id);
    const members = membersOf(id, props.players, bound.value);
    // a group player is not a room of its own, so only its members are cards
    const speakers = !group
      ? []
      : player.type === PlayerType.GROUP
        ? members
        : [player, ...members];
    return [{ player, group, speakers }];
  }),
);

// A room on its own in the top rows leaves its heading; a group's speakers stay.
const loneTopIds = computed(
  () =>
    new Set(
      topRows.value
        .filter((row) => !row.group)
        .map((row) => row.player.player_id),
    ),
);

const builtinRoom = computed(() =>
  props.players.find(
    (p) => isBuiltinPlayer(p) && !loneTopIds.value.has(p.player_id),
  ),
);

const sections = computed(() =>
  speakerSections(
    props.players.filter(
      (p) =>
        !loneTopIds.value.has(p.player_id) &&
        p !== builtinRoom.value &&
        p.type !== PlayerType.GROUP,
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

/** The leader of the group this room is in (itself when it leads one). */
function leaderOf(room: Player): string | undefined {
  const leader = bound.value.get(room.player_id);
  if (leader) return leader;
  return groupColour(room.player_id) ? room.player_id : undefined;
}

function cardProps(room: Player) {
  const leader = leaderOf(room);
  const unavailable = isPlayerUnavailable(room);
  return {
    player: room,
    group: groupColour(leader),
    tag: room.needs_setup
      ? $t("settings.setup_required")
      : unavailable
        ? $t("player_select.unavailable")
        : undefined,
    dimmed: leader !== undefined || unavailable,
    inert: unavailable || room.type === PlayerType.SOURCE,
  };
}

// A room in a group stands for its group: a click selects the group.
function selectRoom(room: Player) {
  const leader = leaderOf(room);
  const target = leader ? api.players[leader] : room;
  if (target) emit("select", target);
}
</script>
