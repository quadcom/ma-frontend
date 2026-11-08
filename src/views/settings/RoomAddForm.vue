<template>
  <form class="space-y-3" data-room-add @submit.prevent="create">
    <label class="block space-y-1 text-sm">
      <span>{{ $t("settings.room_name") }}</span>
      <Input v-model="name" :disabled="busy" data-room-name />
    </label>
    <label class="block space-y-1 text-sm">
      <span>{{ $t("settings.room_floor") }}</span>
      <NativeSelect
        v-model="floorChoice"
        :disabled="busy"
        class="w-full"
        data-room-floor
      >
        <NativeSelectOption :value="NO_FLOOR">
          {{ $t("settings.room_no_floor") }}
        </NativeSelectOption>
        <NativeSelectOption
          v-for="floor in floors"
          :key="floor.floor_id"
          :value="floor.floor_id"
        >
          {{ floor.name }}
        </NativeSelectOption>
        <NativeSelectOption :value="NEW_FLOOR">
          {{ $t("settings.room_new_floor") }}
        </NativeSelectOption>
      </NativeSelect>
    </label>
    <label v-if="floorChoice === NEW_FLOOR" class="block space-y-1 text-sm">
      <span>{{ $t("settings.room_new_floor_name") }}</span>
      <Input v-model="newFloorName" :disabled="busy" data-room-new-floor />
    </label>
    <div class="flex gap-2">
      <Button type="submit" :disabled="!canCreate">
        {{ $t("settings.room_create") }}
      </Button>
      <Button
        type="button"
        variant="ghost"
        :disabled="busy"
        @click="emit('cancel')"
      >
        {{ $t("cancel") }}
      </Button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  AREAS_CREATE_COMMAND,
  type CreatedArea,
  type HassFloor,
} from "@/helpers/areas";
import { api } from "@/plugins/api";
import { computed, ref } from "vue";

/**
 * Adds a room to Home Assistant: a name, on an existing floor, a new floor
 * or none. The server refuses a name already in use and says why.
 */
const NO_FLOOR = "";
const NEW_FLOOR = "__new__";

defineProps<{
  floors: HassFloor[];
}>();

const emit = defineEmits<{
  created: [area: CreatedArea, name: string];
  cancel: [];
}>();

const name = ref("");
const floorChoice = ref<string>(NO_FLOOR);
const newFloorName = ref("");
const busy = ref(false);

const canCreate = computed(
  () =>
    !busy.value &&
    !!name.value.trim() &&
    (floorChoice.value !== NEW_FLOOR || !!newFloorName.value.trim()),
);

async function create() {
  if (!canCreate.value) return;
  const roomName = name.value.trim();
  busy.value = true;
  try {
    const area = await api.sendCommand<CreatedArea>(AREAS_CREATE_COMMAND, {
      name: roomName,
      ...(floorChoice.value === NEW_FLOOR
        ? { new_floor_name: newFloorName.value.trim() }
        : floorChoice.value
          ? { floor_id: floorChoice.value }
          : {}),
    });
    emit("created", area, roomName);
  } catch {
    // the API shows the server's message; nothing was made
  } finally {
    busy.value = false;
  }
}
</script>
