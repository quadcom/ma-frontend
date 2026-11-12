<template>
  <div class="flex min-h-0 flex-col">
    <div data-panel-drag-region class="border-b px-4 pt-1 pb-3">
      <div class="min-w-0 ml-1">
        <p class="text-base font-semibold">{{ $t("volume") }}</p>
        <p class="text-muted-foreground truncate text-xs">
          {{ playerDisplayName }}
        </p>
      </div>
    </div>

    <div
      class="player-volume-scroller min-h-0 space-y-3 overflow-y-auto px-4 pt-3 pb-4"
    >
      <template v-if="volumePlayers.length > 0">
        <div
          v-for="volumePlayer in volumePlayers"
          :key="volumePlayer.player_id"
          class="space-y-1"
        >
          <div class="flex min-w-0 items-center gap-2 px-1">
            <PlayerIcon
              :icon="volumePlayer.icon"
              :size="18"
              class="text-muted-foreground"
            />
            <span class="truncate text-xs font-medium">
              {{ getPlayerDisplayName(volumePlayer) }}
            </span>
          </div>
          <!-- a pair or permanent group is one room on its group volume -->
          <PlayerVolume
            :player="volumePlayer"
            :allow-wheel="allowWheel"
            :prefer-group-volume="volumePlayer.type === PlayerType.GROUP"
            :enable-popout="false"
            :expand-on-touch="expandOnTouch"
            width="100%"
          />
        </div>
        <Separator />
      </template>

      <div class="space-y-1">
        <p
          v-if="grouped"
          class="text-muted-foreground px-1 text-xs font-medium"
        >
          {{ $t("grouped_volume") }}
        </p>
        <PlayerVolume
          :player="groupPlayer"
          :allow-wheel="allowWheel"
          :prefer-group-volume="true"
          :enable-popout="false"
          :expand-on-touch="expandOnTouch"
          width="100%"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import PlayerIcon from "@/components/PlayerIcon.vue";
import { Separator } from "@/components/ui/separator";
import { speakerList } from "@/composables/speakerListState";
import { groupVolumeIds } from "@/helpers/group_volume";
import {
  getPlayerDisplayName,
  getPlayerName,
  isPlayerGrouped,
} from "@/helpers/players";
import { memberLeader } from "@/helpers/speaker_list";
import { api } from "@/plugins/api";
import {
  type Player,
  PLAYER_CONTROL_NONE,
  PlayerType,
} from "@/plugins/api/interfaces";
import { store } from "@/plugins/store";
import { computed } from "vue";
import PlayerVolume from "./PlayerVolume.vue";

const props = withDefaults(
  defineProps<{
    player: Player;
    allowWheel?: boolean;
  }>(),
  {
    allowWheel: false,
  },
);

// With the server's list, a group is its rooms: a pair or permanent group on
// its own is one speaker, not a group
const grouped = computed(() =>
  speakerList.value
    ? volumePlayers.value.length > 0
    : isPlayerGrouped(props.player),
);
// the group slider moves the whole group, so it is the leader's, should a
// member room be the one shown
const groupPlayer = computed(() => {
  const list = speakerList.value;
  const leader = list ? memberLeader(list, props.player.player_id) : undefined;
  return (leader && api.players[leader]) || props.player;
});
const playerDisplayName = computed(() => getPlayerName(props.player, 36));

// the same panel backs the desktop volume popout, where a pointer has no
// trouble with the resting rail
const expandOnTouch = computed(() => store.mobileLayout);

const volumePlayers = computed(() => {
  if (!speakerList.value && !isPlayerGrouped(props.player)) return [];
  return [...groupVolumeIds(props.player)]
    .map((playerId) => api.players[playerId])
    .filter(
      (player): player is Player =>
        player?.available === true &&
        player.volume_control !== PLAYER_CONTROL_NONE,
    )
    .sort((left, right) =>
      getPlayerDisplayName(left).localeCompare(
        getPlayerDisplayName(right),
        undefined,
        { sensitivity: "base" },
      ),
    );
});
</script>
