<template>
  <div
    data-playing-room-row
    :data-player-id="player.player_id"
    class="bg-muted relative min-h-[84px] overflow-hidden rounded-[8px] border max-[500px]:rounded-[4px]"
    :class="active ? 'border-primary' : 'border-transparent'"
  >
    <button
      type="button"
      class="focus-visible:ring-ring absolute inset-0 z-[2] rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-inset max-[500px]:rounded-[4px]"
      :aria-label="`${$t('tooltip.select_player')}: ${title}`"
      :aria-current="active ? 'true' : undefined"
      @click="emit('select', player)"
    ></button>
    <template v-if="artUrl">
      <img
        :src="artUrl"
        alt=""
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 size-full scale-[1.04] object-cover opacity-55"
        @error="artFailed = true"
      />
      <!-- dark at the bottom, fading out upward, so the text stays readable -->
      <span
        class="pointer-events-none absolute inset-0 bg-linear-to-t from-black/85 to-black/15"
      ></span>
    </template>
    <PlayerIcon
      v-else
      :icon="player.icon"
      :size="58"
      aria-hidden="true"
      class="text-foreground pointer-events-none absolute -top-2 -left-2.5 opacity-[0.07]"
    />
    <span
      v-if="group"
      data-group-corner
      aria-hidden="true"
      class="pointer-events-none absolute top-0 right-0 z-[1] size-[30px] [clip-path:polygon(0_0,100%_0,100%_100%)]"
      :style="{ backgroundColor: group.hex }"
    ></span>
    <div
      class="pointer-events-none relative z-[1] flex flex-col py-2.5 pb-3 pl-4"
      :class="media && canGroup ? 'pr-[92px]' : 'pr-[52px]'"
    >
      <p
        class="text-base leading-[22px]"
        :class="group ? 'font-semibold' : 'font-medium'"
      >
        {{ title }}
      </p>
      <template v-if="media">
        <p
          v-if="mediaLine"
          class="text-sm leading-5"
          :class="artUrl ? 'text-foreground/85' : 'text-muted-foreground'"
        >
          {{ mediaLine }}
        </p>
        <p
          class="mt-0.5 flex items-center gap-1.5 text-xs leading-4"
          :class="artUrl ? 'text-foreground/75' : 'text-muted-foreground/80'"
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
      class="text-primary pointer-events-none absolute right-3.5 bottom-2 z-[1] text-xs leading-4 font-medium"
    >
      {{ $t("player_select.active") }}
    </span>
    <div
      class="absolute top-1/2 right-1.5 z-[3] flex -translate-y-1/2 items-center gap-1"
    >
      <Button
        v-if="media"
        variant="ghost"
        size="icon"
        class="size-9 rounded-full"
        :disabled="playDisabled"
        :aria-label="playLabel"
        @click="playPause"
      >
        <Spinner v-if="playLoading" class="size-5" />
        <Square v-else-if="isPlaying && showStop" class="size-5 fill-current" />
        <Pause v-else-if="isPlaying" class="size-6 fill-current" />
        <Play v-else class="size-6 fill-current" />
      </Button>
      <Button
        v-if="canGroup"
        variant="ghost"
        size="icon"
        class="size-9"
        :aria-label="$t('player_select.edit_group', { name: title })"
        @click="emit('openGroupEditor', player)"
      >
        <Link class="size-6" />
      </Button>
    </div>
    <div
      class="bg-primary/20 pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[3px]"
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
import { Spinner } from "@/components/ui/spinner";
import { usePlayPauseCommand } from "@/composables/usePlayPauseCommand";
import type { GroupColour } from "@/composables/useSpeakerList";
import { resolveActiveElapsedTime } from "@/helpers/activeElapsedTime";
import { canEditPlayerGroup, getPlayerDisplayName } from "@/helpers/players";
import {
  formatDuration,
  getImageThumbForItem,
  getMediaImageUrl,
} from "@/helpers/utils";
import { resolvePlayerQueue } from "@/plugins/api/helpers";
import {
  ImageType,
  PlaybackState,
  type Player,
  PlayerType,
} from "@/plugins/api/interfaces";
import { $t } from "@/plugins/i18n";
import { AudioLines, Link, Pause, Play, Square } from "@lucide/vue";
import { useIntervalFn } from "@vueuse/core";
import { computed, ref, watch } from "vue";

const TICK_MS = 1000;
const KHZ = 1000;
const ART_SIZE = 600;

/**
 * A room that is playing, or the active room. A group is titled by its colour
 * word and marked by an angled corner in its colour. A click makes it the active
 * room; the link button opens the group editor without changing the active room.
 */
const props = defineProps<{
  player: Player;
  active: boolean;
  group?: GroupColour;
}>();

const emit = defineEmits<{
  select: [player: Player];
  openGroupEditor: [player: Player];
}>();

// moves the position on while the list is open; stops with the component
const tick = ref(0);
useIntervalFn(() => tick.value++, TICK_MS);

const artFailed = ref(false);
// A group player keeps the name it was given; a group of rooms is its colour.
const title = computed(() =>
  props.group && props.player.type !== PlayerType.GROUP
    ? props.group.name
    : getPlayerDisplayName(props.player),
);
const media = computed(() => props.player.current_media);
const queueItem = computed(
  () => resolvePlayerQueue(props.player)?.current_item ?? undefined,
);
const isPlaying = computed(
  () => props.player.playback_state === PlaybackState.PLAYING,
);
const canGroup = computed(() => canEditPlayerGroup(props.player));

// The same command as the player bar's play button and the space bar.
const {
  showStop,
  isLoading: playLoading,
  isDisabled: playDisabled,
  playPause,
} = usePlayPauseCommand(
  computed(() => props.player),
  computed(() => resolvePlayerQueue(props.player)),
);
// worded as the player bar's play button words it
const playLabel = computed(() => {
  if (isPlaying.value && showStop.value) return $t("stop_playback");
  return isPlaying.value ? $t("pause") : $t("play");
});

// Fan art when the item has it, else the cover.
const artUrl = computed(() => {
  if (artFailed.value || !media.value) return undefined;
  const item = queueItem.value?.media_item ?? undefined;
  return (
    getImageThumbForItem(item, ImageType.FANART, ART_SIZE) ||
    getImageThumbForItem(queueItem.value, ImageType.THUMB, ART_SIZE) ||
    getMediaImageUrl(media.value.image_url) ||
    undefined
  );
});
watch(
  () => media.value?.uri,
  () => (artFailed.value = false),
);

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
  const format = queueItem.value?.streamdetails?.audio_format;
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
