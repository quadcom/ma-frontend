import StereoPairCreate from "@/components/speakers/StereoPairCreate.vue";
import type { SpeakerListReply, SpeakerListRoom } from "@/helpers/speaker_list";
import { api } from "@/plugins/api";
import { type Player, PlayerType } from "@/plugins/api/interfaces";
import { flushPromises, mount } from "@vue/test-utils";
import type { ShallowRef } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { player } from "../fixtures/player";

const holder = vi.hoisted(() => ({
  list: undefined as unknown as ShallowRef<SpeakerListReply | undefined>,
}));

vi.mock("@/plugins/api", async () => {
  const { reactive } = await vi.importActual<typeof import("vue")>("vue");
  const api = reactive({
    players: {} as Record<string, Player>,
    sendCommand: vi.fn(() => Promise.resolve()),
  });
  return { api, default: api };
});

vi.mock("@/composables/useSpeakerList", async () => {
  const { shallowRef } = await vi.importActual<typeof import("vue")>("vue");
  holder.list = shallowRef<SpeakerListReply>();
  return { useSpeakerList: () => ({ list: holder.list }) };
});

vi.mock("@/helpers/players", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/helpers/players")>()),
  isBuiltinPlayer: (p: Player) => p.player_id === "builtin",
  getPlayerDisplayName: (p: Player) => p.name,
}));

vi.mock("@/plugins/i18n", () => ({
  $t: (key: string) => key,
}));

vi.mock("vue-sonner", () => ({ toast: { success: vi.fn() } }));

const CREATE = "hass/stereo_pair/create";
const IDENTIFY = "hass/stereo_pair/identify";

const room = (extra: Partial<SpeakerListRoom> = {}): SpeakerListRoom => ({
  name: "",
  area: null,
  floor: null,
  floor_level: null,
  labels: [],
  available: true,
  group_leader: null,
  is_permanent_group: false,
  group_with: [],
  ...extra,
});

// a and b can play together in the Bedroom; c can't pair with a; g is a
// permanent group, u is offline, builtin is this device.
function reply(): SpeakerListReply {
  return {
    revision: 1,
    grouping: "floor",
    sections: [
      {
        key: "floor:main",
        kind: "floor",
        title: "Main",
        rooms: ["a", "b", "c", "g", "u", "builtin"],
      },
    ],
    rooms: {
      a: room({ area: "Bedroom", group_with: ["b", "g", "builtin"] }),
      b: room({ area: "Bedroom", group_with: ["a"] }),
      c: room(),
      g: room({ is_permanent_group: true }),
      u: room({ available: false }),
      builtin: room(),
    },
    groups: [],
    permanent_groups: [
      { player: "g", name: "Kitchen pair", members: ["k1", "k2"] },
    ],
  };
}

function mountCreate() {
  return mount(StereoPairCreate, {
    global: { mocks: { $t: (key: string) => key } },
  });
}

const cardIds = (wrapper: ReturnType<typeof mountCreate>) =>
  wrapper
    .findAll("[data-room-card]")
    .map((c) => c.attributes("data-player-id"));

const buttonNamed = (wrapper: ReturnType<typeof mountCreate>, text: string) =>
  wrapper.findAll("button").find((b) => b.text().includes(text))!;

beforeEach(() => {
  vi.clearAllMocks();
  api.players = Object.fromEntries(
    ["a", "b", "c", "u", "builtin", "k1", "k2"]
      .map((id) => player({ player_id: id, name: id.toUpperCase() }))
      .concat(player({ player_id: "g", name: "G", type: PlayerType.GROUP }))
      .map((p) => [p.player_id, p]),
  );
  holder.list.value = reply();
});

describe("StereoPairCreate", () => {
  it("offers only single online speakers, then those that play with the first", async () => {
    const wrapper = mountCreate();

    expect(cardIds(wrapper)).toEqual(["a", "b", "c"]);

    await wrapper.get('[data-player-id="a"]').trigger("click");
    expect(cardIds(wrapper)).toEqual(["b"]);
  });

  it("creates the pair named after the room, then dings its first speaker", async () => {
    vi.mocked(api.sendCommand).mockImplementation(((command: string) =>
      Promise.resolve(
        command === CREATE ? { group_id: "new" } : undefined,
      )) as never);
    const wrapper = mountCreate();

    await wrapper.get('[data-player-id="a"]').trigger("click");
    await wrapper.get('[data-player-id="b"]').trigger("click");
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe(
      "Bedroom",
    );
    await buttonNamed(wrapper, "player_select.stereo_create").trigger("click");
    await flushPromises();

    expect(api.sendCommand).toHaveBeenCalledWith(CREATE, {
      name: "Bedroom",
      player_ids: ["a", "b"],
    });
    expect(api.sendCommand).toHaveBeenCalledWith(IDENTIFY, { player_id: "a" });
  });

  it("stays on the name step when the server refuses", async () => {
    vi.mocked(api.sendCommand).mockRejectedValueOnce(new Error("no"));
    const wrapper = mountCreate();

    await wrapper.get('[data-player-id="a"]').trigger("click");
    await wrapper.get('[data-player-id="b"]').trigger("click");
    await buttonNamed(wrapper, "player_select.stereo_create").trigger("click");
    await flushPromises();

    expect(wrapper.find("input").exists()).toBe(true);
    expect(api.sendCommand).not.toHaveBeenCalledWith(
      IDENTIFY,
      expect.anything(),
    );
  });
});
