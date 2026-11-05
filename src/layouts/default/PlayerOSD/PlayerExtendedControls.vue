<template>
  <div class="player-bar-action-row flex min-w-0 items-center">
    <PlayerBarVolumeControl
      v-if="volume?.isVisible && store.activePlayer"
      :player="store.activePlayer"
    />
    <PlayerBarPlayerButton v-if="player?.isVisible" />
  </div>
</template>

<script setup lang="ts">
import { store } from "@/plugins/store";
import PlayerBarPlayerButton from "./PlayerBarPlayerButton.vue";
import PlayerBarVolumeControl from "./PlayerBarVolumeControl.vue";

export interface Props {
  player?: {
    isVisible?: boolean;
  };
  volume?: {
    isVisible?: boolean;
  };
}

withDefaults(defineProps<Props>(), {
  player: () => ({ isVisible: true }),
  volume: () => ({ isVisible: true }),
});
</script>
