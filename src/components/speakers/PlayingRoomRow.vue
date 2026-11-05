<template>
  <div
    data-playing-room-row
    :data-player-id="player.player_id"
    class="relative min-h-[84px] overflow-hidden rounded-xl border"
    :class="
      active
        ? 'border-primary bg-[color-mix(in_oklab,var(--primary)_20%,var(--popover))]'
        : 'bg-secondary border-transparent'
    "
  >
    <button
      type="button"
      class="focus-visible:ring-ring absolute inset-0 z-0 rounded-xl outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-inset"
      :aria-label="`${$t('tooltip.select_player')}: ${name}`"
      :aria-current="active ? 'true' : undefined"
      @click="emit('select', player)"
    ></button>
    <PlayerIcon
      :icon="player.icon"
      :size="58"
      aria-hidden="true"
      class="text-muted-foreground pointer-events-none absolute -top-2 -left-2.5 opacity-[0.08]"
    />
    <div
      class="pointer-events-none relative z-[1] flex flex-col py-2.5 pr-[52px] pb-3 pl-4"
    >
      <p class="text-base leading-[22px] font-medium">{{ name }}</p>
      <template v-if="media">
        <p v-if="mediaLine" class="text-muted-foreground text-sm leading-5">
          {{ mediaLine }}
        </p>
        <p
          class="text-muted-foreground/80 mt-0.5 flex items-center gap-1.5 text-xs leading-4"
        >
          <AudioLines v-if="isPlaying" class="text-primary size-3" />
          {{ details }}
        </p>
      </template>
      <p v-else class="text-muted-foreground text-sm leading-5">
        {{ $t("player_select.nothing_playing") }}
      </p>
    </div>
    <span
      v-if="active"
      class="text-primary pointer-events-none absolute top-1.5 right-3.5 z-[1] text-xs leading-4 font-medium"
    >
      {{ $t("player_select.active") }}
    </span>
    <Button
      v-if="canGroup"
      variant="ghost"
      size="icon"
      class="absolute top-1/2 right-1.5 z-[2] size-9 -translate-y-1/2"
      :aria-label="$t('player_select.group_with', { name })"
      @click="emit('openGroupEditor', player)"
    >
      <Link class="size-[26px]" />
    </Button>
    <div
      class="bg-primary/20 pointer-events-none absolute inset-x-0 bottom-0 h-[3px]"
    >
      <div
        class="bg-primary h-full transition-[width] duration-1000 ease-linear"
        :style="{ width: `${progress * 100}%` }"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import PlayerIcon from "@/components/PlayerIcon.vue";
import { Button } from "@/components/ui/button";
import { resolveActiveElapsedTime } from "@/helpers/activeElapsedTime";
import { canEditPlayerGroup, getPlayerDisplayName } from "@/helpers/players";
import { formatDuration } from "@/helpers/utils";
import { resolvePlayerQueue } from "@/plugins/api/helpers";
import { PlaybackState, type Player } from "@/plugins/api/interfaces";
import { $t } from "@/plugins/i18n";
import { AudioLines, Link } from "@lucide/vue";
import { useIntervalFn } from "@vueuse/core";
import { computed, ref } from "vue";

const TICK_MS = 1000;
const KHZ = 1000;

/**
 * A room that is playing, or the active room. A click makes it the active
 * room; the link button opens the group editor for this room without changing
 * the active room.
 */
const props = defineProps<{
  player: Player;
  active: boolean;
}>();

const emit = defineEmits<{
  select: [player: Player];
  openGroupEditor: [player: Player];
}>();

// moves the position on while the list is open; stops with the component
const tick = ref(0);
useIntervalFn(() => tick.value++, TICK_MS);

const name = computed(() => getPlayerDisplayName(props.player));
const media = computed(() => props.player.current_media);
const isPlaying = computed(
  () => props.player.playback_state === PlaybackState.PLAYING,
);
const canGroup = computed(() => canEditPlayerGroup(props.player));

const mediaLine = computed(() =>
  [media.value?.title, media.value?.artist?.trim()].filter(Boolean).join(" · "),
);

const duration = computed(() => {
  const value = media.value?.duration;
  return value && value > 0 ? value : undefined;
});

const elapsed = computed(() => {
  void tick.value;
  return resolveActiveElapsedTime(props.player.player_id);
});

const progress = computed(() => {
  if (duration.value === undefined || elapsed.value === undefined) return 0;
  return Math.min(1, Math.max(0, elapsed.value / duration.value));
});

const quality = computed(() => {
  const format = resolvePlayerQueue(props.player)?.current_item?.streamdetails
    ?.audio_format;
  if (!format?.content_type || !format.sample_rate) return undefined;
  return `${format.content_type.toUpperCase()} ${format.sample_rate / KHZ} kHz`;
});

const details = computed(() => {
  const state = $t(
    isPlaying.value ? "player_select.playing" : "player_select.paused",
  );
  const time =
    duration.value !== undefined && elapsed.value !== undefined
      ? `${formatDuration(Math.min(elapsed.value, duration.value))} / ${formatDuration(duration.value)}`
      : undefined;
  return [state, time, quality.value].filter(Boolean).join(" · ");
});
</script>
