<template>
  <Dialog :open="show" @update:open="handleOpenChange">
    <DialogContent
      class="flex max-h-[80vh] max-w-[800px] flex-col gap-0 p-0"
      data-testid="stereo-pair-dialog"
    >
      <DialogHeader class="border-b px-5 py-4 pr-12">
        <DialogTitle>{{ $t("settings.create_stereo_pair") }}</DialogTitle>
      </DialogHeader>
      <div class="min-h-0 flex-1 overflow-y-auto pt-4">
        <StereoPairCreate />
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import StereoPairCreate from "@/components/speakers/StereoPairCreate.vue";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { store } from "@/plugins/store";

/** Makes a new stereo pair from Settings > Players. */
const { show = false } = defineProps<{
  show?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
}>();

const handleOpenChange = (open: boolean) => {
  store.dialogActive = open;
  emit("update:show", open);
};
</script>
