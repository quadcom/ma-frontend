<template>
  <div class="pb-6" data-stereo-create>
    <template v-if="groupId">
      <StereoPairSetup :group="pairGroup" auto-start />
    </template>

    <template v-else-if="step === 'choose'">
      <p class="text-muted-foreground px-4 pb-2 text-xs leading-4">
        {{ $t("player_select.stereo_choose_hint") }}
      </p>
      <div class="space-y-1.5 px-4">
        <Button
          v-for="group in existingPairs"
          :key="group.player"
          variant="outline"
          class="w-full justify-between"
          @click="groupId = group.player"
        >
          <span class="truncate">{{ group.name }}</span>
          <span v-if="group.is_stereo_pair" class="text-muted-foreground">
            {{ $t("player_select.stereo") }}
          </span>
        </Button>
        <Button variant="outline" class="w-full" @click="step = 'first'">
          {{ $t("player_select.stereo_new") }}
        </Button>
      </div>
    </template>

    <template v-else-if="step === 'name'">
      <div class="space-y-3 px-4">
        <p class="text-muted-foreground text-xs leading-4">
          {{
            $t("player_select.stereo_picked", {
              first: nameOf(first),
              second: nameOf(second),
            })
          }}
        </p>
        <label class="block space-y-1 text-sm">
          <span>{{ $t("player_select.stereo_name") }}</span>
          <Input v-model="pairName" :disabled="busy" />
        </label>
        <Button :disabled="busy || !pairName.trim()" @click="create">
          {{ $t("player_select.stereo_create") }}
        </Button>
      </div>
    </template>

    <template v-else>
      <p class="text-muted-foreground px-4 pb-2 text-xs leading-4">
        {{
          step === "first"
            ? $t("player_select.stereo_pick_first")
            : $t("player_select.stereo_pick_second", { name: nameOf(first) })
        }}
      </p>
      <RoomSections :sections="pickSections">
        <template #card="{ room }">
          <RoomCard :player="room" @click="pick" />
        </template>
      </RoomSections>
      <p
        v-if="pickSections.length === 0"
        class="text-muted-foreground px-4 py-6 text-center text-sm"
      >
        {{ $t("player_select.stereo_none") }}
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import RoomCard from "@/components/speakers/RoomCard.vue";
import RoomSections from "@/components/speakers/RoomSections.vue";
import StereoPairSetup from "@/components/speakers/StereoPairSetup.vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSpeakerList } from "@/composables/useSpeakerList";
import { isBuiltinPlayer } from "@/helpers/players";
import {
  type PermanentGroup,
  STEREO_CREATE_COMMAND,
  toSections,
} from "@/helpers/speaker_list";
import { api } from "@/plugins/api";
import { type Player, PlayerType } from "@/plugins/api/interfaces";
import { $t } from "@/plugins/i18n";
import { computed, ref } from "vue";
import { toast } from "vue-sonner";

/**
 * Makes a stereo pair from the speaker panel: pick a group of two speakers
 * that already exists, or two speakers to make a new one, then the ding asks
 * which one is on the left. The server makes the group in one call.
 */
const PAIR_SIZE = 2;

type Step = "choose" | "first" | "second" | "name";

const { list } = useSpeakerList();

const step = ref<Step>("choose");
const first = ref("");
const second = ref("");
const pairName = ref("");
const busy = ref(false);
// the pair being set up, once chosen or made
const groupId = ref<string>();

const existingPairs = computed(
  () =>
    list.value?.permanent_groups.filter(
      (group) => group.members.length === PAIR_SIZE,
    ) ?? [],
);

// A room that can be half of a pair: a single speaker, online, not this device.
function canPair(id: string): boolean {
  const room = list.value?.rooms[id];
  const player = api.players[id];
  return (
    !!room &&
    !!player &&
    room.available &&
    !room.is_permanent_group &&
    player.type !== PlayerType.GROUP &&
    !isBuiltinPlayer(player)
  );
}

// The server's sections narrowed to the speakers that can be picked now:
// any for the first, those that can play with it for the second.
const pickSections = computed(() => {
  const server = list.value;
  if (!server) return [];
  const allowed = new Set(
    step.value === "second"
      ? (server.rooms[first.value]?.group_with ?? []).filter(canPair)
      : Object.keys(server.rooms).filter(canPair),
  );
  const skip = new Set(
    Object.keys(api.players).filter((id) => !allowed.has(id)),
  );
  return toSections(server.sections, api.players, skip);
});

const pairGroup = computed<PermanentGroup>(
  () =>
    list.value?.permanent_groups.find((g) => g.player === groupId.value) ?? {
      player: groupId.value ?? "",
      name: pairName.value,
      members: [first.value, second.value],
      is_stereo_pair: false,
      stereo_left: null,
    },
);

function nameOf(id: string): string {
  return api.players[id]?.name ?? id;
}

function pick(room: Player) {
  if (step.value === "first") {
    first.value = room.player_id;
    step.value = "second";
    return;
  }
  second.value = room.player_id;
  pairName.value =
    list.value?.rooms[first.value]?.area ??
    `${nameOf(first.value)} & ${nameOf(second.value)}`;
  step.value = "name";
}

async function create() {
  busy.value = true;
  try {
    const result = await api.sendCommand<{ group_id: string }>(
      STEREO_CREATE_COMMAND,
      { name: pairName.value.trim(), player_ids: [first.value, second.value] },
    );
    toast.success($t("player_select.stereo_created", { name: pairName.value }));
    groupId.value = result.group_id;
  } catch {
    // the API shows the server's message; nothing was made
  } finally {
    busy.value = false;
  }
}
</script>
