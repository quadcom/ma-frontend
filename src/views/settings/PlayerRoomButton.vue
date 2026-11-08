<template>
  <template v-if="canPick">
    <Button variant="outline" data-room-button @click="open">
      <MapPin class="size-4" />
      {{ $t("settings.room_button", { name: currentName }) }}
    </Button>
    <Dialog :open="show" @update:open="setOpen">
      <DialogContent class="flex max-h-[80vh] flex-col gap-0 p-0">
        <DialogHeader class="border-b px-5 py-4 pr-12">
          <DialogTitle>
            {{ $t("settings.room_title", { name: playerName }) }}
          </DialogTitle>
        </DialogHeader>
        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <RoomAddForm
            v-if="adding && areas"
            :floors="areas.floors"
            @created="onCreated"
            @cancel="adding = false"
          />
          <div v-else-if="areas" class="space-y-4" data-room-list>
            <RoomChoice
              :label="$t('settings.room_none')"
              :selected="currentId === null"
              :disabled="busy"
              @pick="pick(null)"
            />
            <section v-for="group in groups" :key="group.floor?.floor_id ?? ''">
              <h3 class="text-muted-foreground pb-1 text-xs font-medium">
                {{ group.floor?.name ?? $t("settings.room_no_floor") }}
              </h3>
              <div class="space-y-1">
                <RoomChoice
                  v-for="room in group.rooms"
                  :key="room.area_id"
                  :label="room.name"
                  :selected="currentId === room.area_id"
                  :disabled="busy"
                  @pick="pick(room.area_id, room.name)"
                />
              </div>
            </section>
            <Button
              variant="ghost"
              class="text-primary w-full justify-start"
              data-room-add-open
              @click="adding = true"
            >
              <Plus class="size-4" />
              {{ $t("settings.room_add") }}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </template>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSpeakerList } from "@/composables/useSpeakerList";
import {
  AREAS_COMMAND,
  AREAS_SET_PLAYER_COMMAND,
  type AreasReply,
  type CreatedArea,
  roomsByFloor,
} from "@/helpers/areas";
import { getPlayerDisplayName } from "@/helpers/players";
import { api } from "@/plugins/api";
import { Scope } from "@/plugins/api/interfaces";
import { authManager } from "@/plugins/auth";
import { $t } from "@/plugins/i18n";
import { store } from "@/plugins/store";
import { MapPin, Plus } from "@lucide/vue";
import { computed, ref } from "vue";
import { toast } from "vue-sonner";
import RoomAddForm from "./RoomAddForm.vue";
import RoomChoice from "./RoomChoice.vue";

/**
 * The "Room" button on a player's settings page: picks the Home Assistant
 * room the player is in, from the rooms under their floors, or none, or a
 * new room. The speaker list follows by itself once the server has it.
 */
const props = defineProps<{
  playerId: string;
}>();

const { list } = useSpeakerList();

const show = ref(false);
const adding = ref(false);
const busy = ref(false);
const areas = ref<AreasReply>();

// rooms come from the server's hass provider, the same one that builds the
// speaker list; changing one takes the right to change player settings
const canPick = computed(
  () => !!list.value && authManager.hasScope(Scope.CONFIG_PLAYERS_WRITE),
);
const currentName = computed(
  () => list.value?.rooms[props.playerId]?.area ?? $t("settings.room_none"),
);
const currentId = computed(() => areas.value?.player_areas[props.playerId]);
const groups = computed(() => (areas.value ? roomsByFloor(areas.value) : []));
const playerName = computed(() => {
  const player = api.players[props.playerId];
  return player ? getPlayerDisplayName(player) : props.playerId;
});

async function open() {
  adding.value = false;
  setOpen(true);
  try {
    areas.value = await api.sendCommand<AreasReply>(AREAS_COMMAND);
  } catch {
    // the API shows the error; the dialog stays empty
  }
}

function setOpen(isOpen: boolean) {
  store.dialogActive = isOpen;
  show.value = isOpen;
}

async function pick(areaId: string | null, roomName?: string) {
  busy.value = true;
  try {
    await api.sendCommand(AREAS_SET_PLAYER_COMMAND, {
      player_id: props.playerId,
      area_id: areaId,
    });
    toast.success(
      roomName
        ? $t("settings.room_saved", { name: playerName.value, room: roomName })
        : $t("settings.room_cleared", { name: playerName.value }),
    );
    setOpen(false);
  } catch {
    // the API shows the server's message
  } finally {
    busy.value = false;
  }
}

function onCreated(area: CreatedArea, roomName: string) {
  void pick(area.area_id, roomName);
}
</script>
