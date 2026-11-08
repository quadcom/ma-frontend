<template>
  <StereoPairSetup v-if="group" :group="group" data-player-stereo-pair />
</template>

<script setup lang="ts">
import StereoPairSetup from "@/components/speakers/StereoPairSetup.vue";
import { useSpeakerList } from "@/composables/useSpeakerList";
import { permanentGroupOf } from "@/helpers/speaker_list";
import { Scope } from "@/plugins/api/interfaces";
import { authManager } from "@/plugins/auth";
import { computed } from "vue";

/**
 * The left and right of a permanent group of two speakers, on its settings
 * page: which one is left, and a ding to check or set it. Users who may not
 * change player settings don't see it.
 */
const PAIR_SIZE = 2;

const props = defineProps<{
  playerId: string;
}>();

const { list } = useSpeakerList();

const group = computed(() => {
  const found = list.value
    ? permanentGroupOf(list.value, props.playerId)
    : undefined;
  return found?.members.length === PAIR_SIZE &&
    authManager.hasScope(Scope.CONFIG_PLAYERS_WRITE)
    ? found
    : undefined;
});
</script>
