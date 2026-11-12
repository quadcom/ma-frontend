import { speakerList as list } from "@/composables/speakerListState";
import { getHassProviderInstance } from "@/helpers/hass_controls";
import {
  findHandovers,
  groupColourHex,
  isSpeakerListReply,
  memberLeader,
  SPEAKER_LIST_COMMAND,
  SPEAKER_LIST_EVENT_SUFFIX,
} from "@/helpers/speaker_list";
import { api } from "@/plugins/api";
import { EventType, type EventMessage } from "@/plugins/api/interfaces";
import { $t } from "@/plugins/i18n";
import { store } from "@/plugins/store";
import { watch } from "vue";

export interface GroupColour {
  /** The colour word, which is also the group's name: "Orange". */
  name: string;
  hex: string;
}

type HandoverListener = (oldLeader: string, newLeader: string) => void;

// The list is module-wide (speakerListState), so the speaker list, the group
// editor and the player bar agree, and the last good list survives closing the
// panel.
const listeners = new Set<HandoverListener>();
let started = false;
let reading: Promise<void> | undefined;

async function read() {
  if (!getHassProviderInstance()) {
    list.value = undefined;
    return;
  }
  try {
    const reply = await api.sendCommand<unknown>(
      SPEAKER_LIST_COMMAND,
      undefined,
      { suppressGlobalError: true },
    );
    // an unknown shape, or an older answer arriving late: keep what we have
    if (!isSpeakerListReply(reply)) return;
    if (list.value && reply.revision < list.value.revision) return;
    const handovers = findHandovers(list.value?.groups ?? [], reply.groups);
    list.value = reply;
    for (const [oldLeader, newLeader] of handovers) {
      listeners.forEach((listener) => listener(oldLeader, newLeader));
    }
  } catch {
    // A server without the command shows the plain list; a failed read keeps
    // the last good list. Nothing the user did failed, so there is no toast.
  }
}

let readAgain = false;

function refresh(): Promise<void> {
  // one read at a time; asks that come in meanwhile end in one more read
  if (reading) {
    readAgain = true;
    return reading;
  }
  reading = read().finally(() => {
    reading = undefined;
    if (readAgain) {
      readAgain = false;
      void refresh();
    }
  });
  return reading;
}

function onProviderEvent(event: EventMessage) {
  const hass = getHassProviderInstance();
  if (
    !hass ||
    event.object_id !== `${hass.instance_id}${SPEAKER_LIST_EVENT_SUFFIX}`
  ) {
    return;
  }
  const revision = (event.data as { revision?: unknown } | null)?.revision;
  if (
    typeof revision === "number" &&
    list.value &&
    revision <= list.value.revision
  ) {
    return;
  }
  void refresh();
}

// A member room is never controlled alone: whichever way it became the active
// player (a home card, a "Play on" menu, a dashboard, or it was active before
// it joined), the group's leader takes over. "A group is a group" (Adrian,
// 2026-11-11).
function followGroupLeader() {
  const reply = list.value;
  const active = store.activePlayerId;
  if (!reply || !active) return;
  const leader = memberLeader(reply, active);
  if (leader && api.players[leader]) store.activePlayerId = leader;
}

// Listens for the app's lifetime, like the player list it follows, so it is
// never unsubscribed.
function start() {
  if (started) return;
  started = true;
  api.subscribe(EventType.PROVIDER_EVENT, onProviderEvent);
  watch([list, () => store.activePlayerId], followGroupLeader, {
    immediate: true,
  });
  void refresh();
}

/**
 * The speaker list as the server builds it: sections, rooms and groups with
 * their colours. Read when first used, when the panel opens, and whenever the
 * server says it changed. `list` stays undefined on a server that does not
 * build it, where the app shows one plain block instead.
 */
export function useSpeakerList() {
  start();

  /** The colour of the group this leader leads, or undefined for a lone room. */
  function groupColour(leaderId: string | undefined): GroupColour | undefined {
    if (!leaderId) return undefined;
    const group = list.value?.groups.find((g) => g.leader === leaderId);
    const hex = group ? groupColourHex(group.colour) : undefined;
    if (!group || !hex) return undefined;
    return { name: $t(`player_select.colours.${group.colour}`), hex };
  }

  /** Calls back when a leader leaves and another room takes its group over. */
  function onHandover(listener: HandoverListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { list, refresh, groupColour, onHandover };
}
