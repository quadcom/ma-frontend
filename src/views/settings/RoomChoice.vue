<template>
  <button
    type="button"
    class="hover:bg-accent/50 flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm disabled:opacity-50"
    :aria-pressed="selected"
    :disabled="disabled"
    data-room-choice
    @click="emit('pick')"
  >
    <span class="truncate">{{ label }}</span>
    <Check v-if="selected" class="text-primary size-4 shrink-0" />
  </button>
</template>

<script setup lang="ts">
import { Check } from "@lucide/vue";

/** One room in the room picker, ticked when the player is in it. */
defineProps<{
  label: string;
  selected: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  pick: [];
}>();
</script>
