<template>
  <component
    :is="inert ? 'div' : 'button'"
    :type="inert ? undefined : 'button'"
    :aria-label="inert ? undefined : accessibleLabel"
    data-room-card
    :data-player-id="player.player_id"
    :data-group="group?.name"
    class="bg-muted relative flex aspect-square w-full flex-col items-center overflow-hidden rounded-[8px] border p-1 text-center transition-[filter,border-color] duration-200 max-[500px]:rounded-[4px]"
    :class="[
      dimmed ? 'border-border/50' : 'border-border',
      inert
        ? 'cursor-default'
        : 'focus-visible:ring-ring cursor-pointer outline-none hover:brightness-125 focus-visible:ring-2',
    ]"
    @click="!inert && emit('click', player)"
  >
    <span
      v-if="group"
      data-group-line
      class="absolute inset-x-0 top-0 z-[1] h-[3px]"
      :style="{ backgroundColor: group.hex }"
    ></span>
    <PlayerIcon
      :icon="player.icon"
      :size="58"
      aria-hidden="true"
      class="text-foreground pointer-events-none absolute -top-2 -left-2.5"
      :class="dimmed ? 'opacity-[0.03]' : 'opacity-[0.07]'"
    />
    <span
      v-if="label"
      class="relative h-3.5 w-full truncate text-[11px] leading-[14px] font-medium"
      :class="dimmed ? 'text-foreground/60' : 'text-foreground/80'"
    >
      {{ label }}
    </span>
    <span
      class="relative flex w-full flex-1 flex-col items-center justify-center leading-[1.2] [overflow-wrap:anywhere] transition-opacity duration-200"
      :class="[hasLongWord ? 'text-xs' : 'text-sm', { 'opacity-40': dimmed }]"
      aria-hidden="true"
    >
      <span v-for="(word, index) in nameWords" :key="index" class="block">
        {{ word }}
      </span>
    </span>
  </component>
</template>

<script setup lang="ts">
import PlayerIcon from "@/components/PlayerIcon.vue";
import type { GroupColour } from "@/composables/useSpeakerList";
import { getPlayerDisplayName } from "@/helpers/players";
import type { Player } from "@/plugins/api/interfaces";
import { computed } from "vue";

// A word longer than this does not fit the card at the normal size.
const LONG_WORD = 8;

// Corners: 8px, 4px below 500px, the same as the Discover page's media cards
// (`--ed-card-pad` in EditorialMediaCard.vue); change both together.

/**
 * A square room card. `group` marks a room that is in a group: a line in the
 * group's colour along the top edge and the colour word above the name, so the
 * group can be told apart without seeing the colour. `dimmed` greys a room
 * that belongs to a group shown elsewhere; an `inert` card ignores clicks.
 */
const props = withDefaults(
  defineProps<{
    player: Player;
    group?: GroupColour;
    dimmed?: boolean;
    tag?: string;
    inert?: boolean;
  }>(),
  {
    group: undefined,
    dimmed: false,
    tag: undefined,
    inert: false,
  },
);

const emit = defineEmits<{
  click: [player: Player];
}>();

const name = computed(() => getPlayerDisplayName(props.player));
// Names break at every space, so "Dining room" is always two lines.
const nameWords = computed(() => name.value.split(/\s+/).filter(Boolean));
const hasLongWord = computed(() =>
  nameWords.value.some((word) => word.length > LONG_WORD),
);
const label = computed(() => props.group?.name ?? props.tag);
const accessibleLabel = computed(() =>
  label.value ? `${name.value}, ${label.value}` : name.value,
);
</script>
