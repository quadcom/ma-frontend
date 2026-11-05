import { HASS_DOMAIN, getHassProviderInstance } from "@/helpers/hass_controls";
import {
  type PlayerGrouping,
  type PlayerLocation,
  type PlayerLocationsReply,
  parseGrouping,
} from "@/helpers/speaker_sections";
import { api } from "@/plugins/api";
import { ref } from "vue";

const PLAYER_LOCATIONS_COMMAND = `${HASS_DOMAIN}/player_locations`;

// Shared by every caller, so the last good reply survives closing the list.
const locations = ref<Record<string, PlayerLocation>>();
const grouping = ref<PlayerGrouping>("none");
// undefined when the server does not keep group colours
const serverGroupColours = ref<Record<string, string>>();

/**
 * Where Home Assistant places each player, and how the household wants the
 * speaker list grouped. Read again each time the list opens, so a speaker moved
 * in Home Assistant shows up in its new place. Without the Home Assistant
 * provider, or when the read fails, the list shows one block: nothing the user
 * did failed, so there is no error toast, and the last good reply is kept.
 */
export function useSpeakerLocations() {
  async function refresh() {
    if (!getHassProviderInstance()) {
      locations.value = undefined;
      return;
    }
    try {
      const reply = await api.sendCommand<PlayerLocationsReply>(
        PLAYER_LOCATIONS_COMMAND,
        undefined,
        { suppressGlobalError: true },
      );
      if (!reply || typeof reply.players !== "object") return;
      locations.value = reply.players;
      grouping.value = parseGrouping(reply.grouping);
      serverGroupColours.value = reply.group_colours;
    } catch {
      // Keep the last good reply; a server without the command has none.
    }
  }

  return { locations, grouping, serverGroupColours, refresh };
}
