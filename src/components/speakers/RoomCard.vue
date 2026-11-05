<template>
  <component
    :is="inert ? 'div' : 'button'"
    :type="inert ? undefined : 'button'"
    :aria-label="inert ? undefined : accessibleLabel"
    :aria-pressed="
      !inert && highlighted !== undefined ? highlighted : undefined
    "
    data-room-card
    :data-player-id="player.player_id"
    class="relative flex size-[78px] shrink-0 flex-col items-center overflow-hidden rounded-xl border p-[3px] text-center transition-colors duration-200"
    :class="[
      highlighted
        ? 'border-primary bg-[color-mix(in_oklab,var(--primary)_20%,var(--popover))]'
        : 'bg-secondary',
      !highlighted && (dimmed ? 'border-border/50' : 'border-border'),
      inert
        ? 'cursor-default'
        : 'focus-visible:ring-ring hover:brightness-125 cursor-pointer outline-none focus-visible:ring-2',
    ]"
    @click="!inert && emit('click', player)"
  >
    <PlayerIcon
      :icon="player.icon"
      :size="58"
      aria-hidden="true"
      class="text-muted-foreground pointer-events-none absolute -top-2 -left-2.5 opacity-[0.08] transition-opacity duration-200"
      :class="{ 'opacity-[0.03]': dimmed }"
    />
    <span
      v-if="tag"
      class="relative h-3.5 w-full truncate text-[11px] leading-[14px] font-medium"
      :class="strongTag ? 'text-foreground/60' : 'text-foreground/40'"
    >
      {{ tag }}
    </span>
    <span
      class="relative flex w-full flex-1 flex-col items-center justify-center text-sm leading-[1.2] [overflow-wrap:anywhere] transition-opacity duration-200"
      :class="{ 'opacity-40': dimmed }"
      aria-hidden="true"
    >
      <span v-for="(word, index) in nameWords" :key="index" class="block">
        {{ word }}
      </span>
    </span>
    <CircleCheck
      aria-hidden="true"
      class="text-primary absolute right-1 bottom-1 size-4 transition-opacity duration-200"
      :class="highlighted ? 'opacity-100' : 'opacity-0'"
    />
  </component>
</template>

<script setup lang="ts">
import PlayerIcon from "@/components/PlayerIcon.vue";
import { getPlayerDisplayName } from "@/helpers/players";
import type { Player } from "@/plugins/api/interfaces";
import { CircleCheck } from "@lucide/vue";
import { computed } from "vue";

/**
 * A 78px square room card. `highlighted` is the group editor's "in this group"
 * look, `dimmed` a room grouped elsewhere, `tag` the line on the top edge. An
 * `inert` card ignores clicks.
 */
const props = withDefaults(
  defineProps<{
    player: Player;
    highlighted?: boolean;
    dimmed?: boolean;
    tag?: string;
    strongTag?: boolean;
    inert?: boolean;
  }>(),
  {
    highlighted: undefined,
    dimmed: false,
    tag: undefined,
    strongTag: false,
    inert: false,
  },
);

const emit = defineEmits<{
  click: [player: Player];
}>();

const name = computed(() => getPlayerDisplayName(props.player));
// Names break at every space, so "Dining room" is always two lines.
const nameWords = computed(() => name.value.split(/\s+/).filter(Boolean));
const accessibleLabel = computed(() =>
  props.tag ? `${name.value}, ${props.tag}` : name.value,
);
</script>
