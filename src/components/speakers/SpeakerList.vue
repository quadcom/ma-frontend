<template>
  <div class="pb-6" data-speaker-list>
    <p
      v-if="rooms.length === 0"
      class="text-muted-foreground px-3 py-8 text-center text-sm"
    >
      {{ $t("no_content") }}
    </p>
    <!-- The top rows are slots. A new slot opens and an empty one folds away
         where it stands, fading, so what is below glides instead of jumping
         (0.7 s, ease-out). The open height is set only while it animates: on
         the slot itself it would always beat the closed one (every utility
         is !important), and the slot would jump instead of sliding. -->
    <TransitionGroup
      tag="div"
      class="px-4 pt-1"
      enter-active-class="transition-[grid-template-rows,opacity] duration-700 ease-out"
      leave-active-class="transition-[grid-template-rows,opacity] duration-700 ease-out"
      enter-from-class="grid-rows-[0fr] opacity-0"
      enter-to-class="grid-rows-[1fr]"
      leave-from-class="grid-rows-[1fr]"
      leave-to-class="grid-rows-[0fr] opacity-0"
    >
      <div v-for="(row, slot) in topRows" :key="slot" class="grid">
        <!-- A room that takes over a slot (another room picked) keeps its
             space: the old room fades out, then the new one fades in on the
             same spot (Adrian, 2026-11-13). Both sit in one grid cell. -->
        <div class="grid min-h-0 overflow-hidden">
          <Transition
            leave-active-class="transition-opacity duration-350 ease-in"
            leave-to-class="opacity-0"
            enter-active-class="transition-opacity duration-350 delay-350 ease-out"
            enter-from-class="opacity-0"
          >
            <div
              :key="row.player.player_id"
              class="col-start-1 row-start-1 space-y-1.5 pb-2"
            >
              <PlayingRoomRow
                :player="row.player"
                :active="row.player.player_id === activeId"
                :group="row.group"
                @select="emit('select', $event)"
                @open-group-editor="emit('openGroupEditor', $event)"
              />
              <div
                v-if="row.speakers.length > 0"
                class="grid grid-cols-4 gap-2 pl-4"
              >
                <RoomCard
                  v-for="speaker in row.speakers"
                  :key="speaker.player_id"
                  :player="speaker"
                  :group="row.group"
                  inert
                />
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </TransitionGroup>
    <Separator
      v-if="topRows.length > 0 && (sections.length > 0 || builtinRoom)"
      class="mt-2 mb-3"
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
import { useSpeakerList } from "@/composables/useSpeakerList";
import {
  getPlayerDisplayName,
  isBuiltinPlayer,
  isPlayerUnavailable,
} from "@/helpers/players";
import {
  groupLeaderOf,
  groupSpeakers,
  listPlayingRoomIds,
  toSections,
} from "@/helpers/speaker_list";
import {
  boundLeaders,
  nextTopOrder,
  plainSection,
  playingRoomIds,
  type SpeakerSection,
} from "@/helpers/speaker_sections";
import { api } from "@/plugins/api";
import { type Player, PlayerType } from "@/plugins/api/interfaces";
import { $t } from "@/plugins/i18n";
import { computed, watch } from "vue";

/**
 * The speaker list: a row per playing room or group (plus the active one) on
 * top, a group's speakers as cards under its row, then every room as a square
 * card under the headings the server sends, and this device last. A room with
 * a row keeps its card too, so nothing jumps (Adrian, 2026-11-13). A group's
 * speakers stay greyed under their headings, marked with the group's colour;
 * a click on one selects its group. On a server that does not build the list,
 * the rooms are one plain block.
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

const { list, groupColour } = useSpeakerList();

const bound = computed(() => boundLeaders(Object.values(api.players)));

// The rooms the server lists, or every visible player when it lists none.
// This device's own player is hidden by default, and the server only knows it
// as the caller's when it is bound to this connection (not the companion app's),
// so the app adds it when the server leaves it out, as the stock list does.
const rooms = computed(() => {
  const server = list.value;
  if (!server) return props.players;
  const listed = Object.keys(server.rooms)
    .map((id) => api.players[id])
    .filter((player): player is Player => !!player);
  if (listed.some((player) => isBuiltinPlayer(player))) return listed;
  const own = props.players.find((player) => isBuiltinPlayer(player));
  return own ? [...listed, own] : listed;
});

const order = computed(() => {
  const visibleIds = new Set(rooms.value.map((p) => p.player_id));
  return nextTopOrder(
    props.topOrder,
    list.value
      ? listPlayingRoomIds(list.value, rooms.value, api.players)
      : playingRoomIds(rooms.value, bound.value),
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
    const player = api.players[id];
    if (!player) return [];
    const group = groupColour(id);
    const serverGroup = list.value?.groups.find((g) => g.leader === id);
    const speakers =
      group && serverGroup
        ? groupSpeakers(serverGroup)
            .map((member) => api.players[member])
            .filter((member): member is Player => !!member)
        : [];
    return [{ player, group, speakers }];
  }),
);

const builtinRoom = computed(() => rooms.value.find((p) => isBuiltinPlayer(p)));

// The server's sections as sent; the app only lifts out this device, which
// gets its own heading last.
const sections = computed(() => {
  const skip = new Set<string>();
  if (builtinRoom.value) skip.add(builtinRoom.value.player_id);
  if (list.value) return toSections(list.value.sections, api.players, skip);
  return plainSection(rooms.value.filter((p) => !skip.has(p.player_id)));
});

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
  if (list.value) return groupLeaderOf(list.value, room.player_id);
  return bound.value.get(room.player_id);
}

function cardProps(room: Player) {
  const leader = leaderOf(room);
  const unavailable =
    isPlayerUnavailable(room) ||
    list.value?.rooms[room.player_id]?.available === false;
  const group = groupColour(leader);
  const leaderPlayer = leader ? api.players[leader] : undefined;
  return {
    player: room,
    group,
    // without a colour (a permanent group, or the plain list) the group's name
    // says where the room is
    tag: room.needs_setup
      ? $t("settings.setup_required")
      : unavailable
        ? $t("player_select.unavailable")
        : !group && leaderPlayer && leader !== room.player_id
          ? getPlayerDisplayName(leaderPlayer)
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
