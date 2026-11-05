<template>
  <section
    v-for="section in sections"
    :key="section.key"
    :aria-label="headingOf(section)"
    data-room-section
  >
    <div
      v-if="section.title !== null || section.isOther"
      class="flex min-h-8 items-center gap-2 pt-1 pr-2 pl-5"
    >
      <h3 class="text-primary flex-1 text-sm leading-5 font-medium">
        {{ headingOf(section) }}
      </h3>
      <slot name="action" :section="section"></slot>
    </div>
    <TransitionGroup
      tag="div"
      class="relative flex flex-wrap gap-1.5 px-4 py-1"
      move-class="transition-transform duration-300"
      enter-active-class="transition-[opacity,transform] duration-200"
      leave-active-class="absolute transition-[opacity,transform] duration-150"
      enter-from-class="scale-90 opacity-0"
      leave-to-class="scale-90 opacity-0"
    >
      <div v-for="room in section.rooms" :key="room.player_id">
        <slot name="card" :room="room"></slot>
      </div>
    </TransitionGroup>
  </section>
</template>

<script setup lang="ts">
import type { SpeakerSection } from "@/helpers/speaker_sections";
import type { Player } from "@/plugins/api/interfaces";
import { $t } from "@/plugins/i18n";

/** Room cards under their floor, area or label headings, "Other" last. */
defineProps<{
  sections: SpeakerSection[];
}>();

defineSlots<{
  action?(props: { section: SpeakerSection }): unknown;
  card(props: { room: Player }): unknown;
}>();

function headingOf(section: SpeakerSection): string | undefined {
  if (section.isOther) return $t("player_select.other");
  return section.title ?? undefined;
}
</script>
