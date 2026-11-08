<template>
  <div
    class="bg-muted mx-4 mb-3 rounded-[8px] px-3 py-2.5 max-[500px]:rounded-[4px]"
    data-stereo-pair
  >
    <template v-if="asking">
      <p class="text-sm font-medium">
        {{ $t("player_select.stereo_question") }}
      </p>
      <p class="text-muted-foreground text-xs">
        {{ $t("player_select.stereo_listen", { name: nameOf(asking) }) }}
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        <Button size="sm" :disabled="busy" @click="answer(true)">
          {{ $t("player_select.stereo_yes") }}
        </Button>
        <Button
          size="sm"
          variant="outline"
          :disabled="busy"
          @click="answer(false)"
        >
          {{ $t("player_select.stereo_no") }}
        </Button>
        <Button size="sm" variant="ghost" :disabled="busy" @click="ding">
          {{ $t("player_select.stereo_again") }}
        </Button>
      </div>
    </template>
    <div v-else class="flex flex-wrap items-center gap-2">
      <p class="min-w-0 flex-1 text-sm">
        {{
          left
            ? $t("player_select.stereo_left_is", { name: nameOf(left) })
            : $t("player_select.stereo_pair")
        }}
      </p>
      <Button size="sm" variant="outline" :disabled="busy" @click="start">
        {{
          left
            ? $t("player_select.stereo_check")
            : $t("player_select.stereo_set_up")
        }}
      </Button>
      <Button
        v-if="left"
        size="sm"
        variant="ghost"
        :disabled="busy"
        @click="save(null)"
      >
        {{ $t("player_select.stereo_off") }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  type PermanentGroup,
  STEREO_IDENTIFY_COMMAND,
  STEREO_SET_COMMAND,
} from "@/helpers/speaker_list";
import { api } from "@/plugins/api";
import { $t } from "@/plugins/i18n";
import { computed, ref } from "vue";
import { toast } from "vue-sonner";

/**
 * Makes a permanent group of two speakers a stereo pair, the way Sonos does:
 * one speaker plays a ding and the user says whether it is the left one.
 * Shown in the group's editor to users who may change player settings.
 */
const props = defineProps<{
  group: PermanentGroup;
}>();

// the speaker that just played the ding, while waiting for the answer
const asking = ref<string>();
const busy = ref(false);

const left = computed(() =>
  props.group.is_stereo_pair
    ? (props.group.stereo_left ?? undefined)
    : undefined,
);
// the first speaker by name dings first, so the order is the same every time
const speakers = computed(() =>
  [...props.group.members].sort((a, b) => nameOf(a).localeCompare(nameOf(b))),
);

function nameOf(id: string): string {
  return api.players[id]?.name ?? id;
}

async function run(call: () => Promise<unknown>): Promise<boolean> {
  busy.value = true;
  try {
    await call();
    return true;
  } catch {
    // the API shows the server's error
    return false;
  } finally {
    busy.value = false;
  }
}

async function ding() {
  const speaker = asking.value ?? speakers.value[0];
  if (!speaker) return;
  if (
    await run(() =>
      api.sendCommand(STEREO_IDENTIFY_COMMAND, { player_id: speaker }),
    )
  ) {
    asking.value = speaker;
  }
}

function start() {
  asking.value = undefined;
  void ding();
}

function answer(isLeft: boolean) {
  const heard = asking.value;
  if (!heard) return;
  const other = speakers.value.find((id) => id !== heard);
  if (isLeft) void save(heard);
  else if (other) void save(other);
}

async function save(leftId: string | null) {
  const saved = await run(() =>
    api.sendCommand(STEREO_SET_COMMAND, {
      group_id: props.group.player,
      left_player_id: leftId,
    }),
  );
  if (!saved) return;
  asking.value = undefined;
  toast.success(
    leftId
      ? $t("player_select.stereo_saved")
      : $t("player_select.stereo_turned_off"),
  );
}
</script>
