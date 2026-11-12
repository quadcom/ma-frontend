import { speakerList } from "@/composables/speakerListState";
import { useSpeakerList } from "@/composables/useSpeakerList";
import type { SpeakerListReply } from "@/helpers/speaker_list";
import { api } from "@/plugins/api";
import { store } from "@/plugins/store";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

vi.mock("@/plugins/api", () => ({
  api: {
    players: { b: { player_id: "b" }, mb: { player_id: "mb" } },
    subscribe: vi.fn(),
    sendCommand: vi.fn(),
  },
}));

vi.mock("@/plugins/store", async () => {
  const { reactive } = await vi.importActual<typeof import("vue")>("vue");
  return { store: reactive({ activePlayerId: "mb" as string | undefined }) };
});

vi.mock("@/helpers/hass_controls", () => ({
  getHassProviderInstance: () => ({ instance_id: "hass" }),
}));

vi.mock("@/plugins/i18n", () => ({ $t: (key: string) => key }));

const entry = (group_leader: string | null) => ({
  name: "",
  area: null,
  floor: null,
  floor_level: null,
  labels: [],
  available: true,
  group_leader,
  is_permanent_group: false,
  group_with: [],
});

const reply = (revision: number, grouped: boolean): SpeakerListReply => ({
  revision,
  grouping: "floor",
  sections: [],
  rooms: { b: entry(null), mb: entry(grouped ? "b" : null) },
  groups: grouped ? [{ leader: "b", colour: "orange", members: ["mb"] }] : [],
  permanent_groups: [],
});

describe("useSpeakerList", () => {
  it("hands control to the leader when the active room joins a group", async () => {
    vi.mocked(api.sendCommand).mockResolvedValue(reply(1, false));
    const { refresh } = useSpeakerList();
    await refresh();
    // the pair on its own stays in control
    expect(store.activePlayerId).toBe("mb");

    // Master bath takes the pair in: the group is controlled, not the pair
    vi.mocked(api.sendCommand).mockResolvedValue(reply(2, true));
    await refresh();
    await nextTick();
    expect(speakerList.value?.revision).toBe(2);
    expect(store.activePlayerId).toBe("b");

    // picking the pair again while it is grouped still lands on the group
    store.activePlayerId = "mb";
    await nextTick();
    expect(store.activePlayerId).toBe("b");
  });
});
