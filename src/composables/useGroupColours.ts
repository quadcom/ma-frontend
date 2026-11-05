import { useSpeakerLocations } from "@/composables/useSpeakerLocations";
import {
  assignGroupColours,
  currentGroups,
  GROUP_COLOURS,
  type TrackedGroup,
} from "@/helpers/group_colours";
import { boundLeaders } from "@/helpers/speaker_sections";
import { api } from "@/plugins/api";
import { PlayerType } from "@/plugins/api/interfaces";
import { $t } from "@/plugins/i18n";
import { shallowRef, watch } from "vue";

export interface GroupColour {
  /** The colour word, which is also the group's name: "Orange". */
  name: string;
  hex: string;
}

type HandoverListener = (oldLeader: string, newLeader: string) => void;

// Module-wide, so the speaker list, the group editor and the player bar agree.
const tracked = shallowRef(new Map<string, TrackedGroup>());
const listeners = new Set<HandoverListener>();
let watching = false;

// Only groups made on the fly get a colour: a permanent group player has a
// name of its own (Adrian, 2026-11-05).
const readGroups = () => {
  const groups = currentGroups(boundLeaders(Object.values(api.players ?? {})));
  for (const leader of groups.keys()) {
    if (api.players?.[leader]?.type === PlayerType.GROUP) {
      groups.delete(leader);
    }
  }
  return groups;
};

// Only a change in who is grouped with whom counts, not every volume or
// progress update a player sends.
const groupsKey = () =>
  [...readGroups()]
    .map(([leader, members]) => `${leader}:${members.join(",")}`)
    .join("|");

// Runs for the app's lifetime, like the player list it follows, so it is
// never stopped.
function startWatching() {
  if (watching) return;
  watching = true;
  const { serverGroupColours, refresh } = useSpeakerLocations();
  watch(
    groupsKey,
    () => {
      const update = assignGroupColours(tracked.value, readGroups());
      tracked.value = update.groups;
      for (const [oldLeader, newLeader] of update.handovers) {
        listeners.forEach((listener) => listener(oldLeader, newLeader));
      }
      // the server decides colours when it keeps them: ask again for the new ones
      if (serverGroupColours.value) void refresh();
    },
    { immediate: true },
  );
}

/**
 * The colour, and colour name, of each group of rooms. The server's colour
 * wins when it keeps group colours, so every app shows the same one; otherwise
 * it is worked out here: a group keeps its colour while it lasts, also when its
 * leader leaves and another room takes over.
 */
export function useGroupColours() {
  startWatching();
  const { serverGroupColours } = useSpeakerLocations();

  /** The colour of the group this leader leads, or undefined for a lone room. */
  function groupColour(leaderId: string | undefined): GroupColour | undefined {
    if (!leaderId) return undefined;
    const group = tracked.value.get(leaderId);
    if (!group) return undefined;
    const serverKey = serverGroupColours.value?.[leaderId];
    const colour =
      GROUP_COLOURS.find((c) => c.key === serverKey) ??
      GROUP_COLOURS[group.colour];
    return {
      name: $t(`player_select.colours.${colour.key}`),
      hex: colour.hex,
    };
  }

  /** Calls back when a leader leaves and another room takes its group over. */
  function onHandover(listener: HandoverListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { groupColour, onHandover };
}
