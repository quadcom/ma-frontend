import type { SpeakerListReply } from "@/helpers/speaker_list";
import { shallowRef } from "vue";

/**
 * The last speaker list the server sent, shared module-wide. `useSpeakerList`
 * keeps it up to date; code that only reads it (player visibility, the volume
 * rows) imports it from here, so it never starts a subscription of its own.
 * Undefined on a server that does not build the list.
 */
export const speakerList = shallowRef<SpeakerListReply>();
