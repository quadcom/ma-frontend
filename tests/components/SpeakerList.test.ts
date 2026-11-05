import GroupEditor from "@/components/speakers/GroupEditor.vue";
import SpeakerList from "@/components/speakers/SpeakerList.vue";
import type { SpeakerListReply, SpeakerListRoom } from "@/helpers/speaker_list";
import { api, type MusicAssistantApi } from "@/plugins/api";
import { PlaybackState, type Player } from "@/plugins/api/interfaces";
import { mount } from "@vue/test-utils";
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
    queues: {},
    queueElapsedTime: {},
    providers: {},
    getPlayer: vi.fn<MusicAssistantApi["getPlayer"]>(),
    playerCommandSetMembers: vi.fn<
      MusicAssistantApi["playerCommandSetMembers"]
    >(() => Promise.resolve()),
    playerCommandUnGroup: vi.fn<MusicAssistantApi["playerCommandUnGroup"]>(() =>
      Promise.resolve(),
    ),
    playerCommandPlayPause: vi.fn<MusicAssistantApi["playerCommandPlayPause"]>(
      () => Promise.resolve(),
    ),
    playerCommandStop: vi.fn<MusicAssistantApi["playerCommandStop"]>(() =>
      Promise.resolve(),
    ),
  });
  return { api, default: api };
});

// The server's list stands in for hass/speaker_list; colours as the composable
// derives them from it.
vi.mock("@/composables/useSpeakerList", async () => {
  const { shallowRef } = await vi.importActual<typeof import("vue")>("vue");
  holder.list = shallowRef<SpeakerListReply>();
  return {
    useSpeakerList: () => ({
      list: holder.list,
      refresh: vi.fn(),
      onHandover: () => () => {},
      groupColour: (id: string | undefined) => {
        const group = holder.list.value?.groups.find((g) => g.leader === id);
        return group
          ? { name: `player_select.colours.${group.colour}`, hex: "#000" }
          : undefined;
      },
    }),
  };
});

vi.mock("@/helpers/players", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/helpers/players")>()),
  groupMemberPickerVisible: () => true,
  isBuiltinPlayer: (p: Player) => p.player_id === "builtin",
  getPlayerDisplayName: (p: Player) =>
    p.player_id === "builtin" ? "This device" : p.name,
}));

vi.mock("@/plugins/i18n", () => ({
  $t: (key: string, args?: Record<string, string>) =>
    args?.name ? `${key}:${args.name}` : key,
}));

const translate = (key: string, args?: Record<string, string>) =>
  args?.name ? `${key}:${args.name}` : key;
const mountOptions = { global: { mocks: { $t: translate } } };

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

function setPlayers(...players: Player[]) {
  api.players = Object.fromEntries(players.map((p) => [p.player_id, p]));
}

function mountList(activeId?: string) {
  return mount(SpeakerList, {
    ...mountOptions,
    props: { players: Object.values(api.players), activeId, topOrder: [] },
  });
}

const card = (wrapper: ReturnType<typeof mount>, id: string) =>
  wrapper.get(`[data-room-card][data-player-id="${id}"]`);

// Kitchen leads Orange with Dining; Gym and Office are free; Basement holds Gym.
function kitchenGroup(): SpeakerListReply {
  return {
    revision: 1,
    grouping: "floor",
    sections: [
      {
        key: "floor:main",
        kind: "floor",
        title: "Main",
        rooms: ["k", "d", "o"],
      },
      { key: "floor:basement", kind: "floor", title: "Basement", rooms: ["g"] },
      { key: "other", kind: "other", title: null, rooms: ["builtin"] },
    ],
    rooms: {
      k: room({ group_with: ["d", "g", "o"] }),
      d: room({ group_leader: "k" }),
      g: room(),
      o: room(),
      builtin: room(),
    },
    groups: [{ leader: "k", colour: "orange", members: ["d"] }],
    permanent_groups: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  holder.list.value = undefined;
  setPlayers(
    player({
      player_id: "k",
      name: "Kitchen",
      playback_state: PlaybackState.PLAYING,
      group_members: ["k", "d"],
      can_group_with: ["d", "g", "o"],
    }),
    player({ player_id: "d", name: "Dining", synced_to: "k" }),
    player({ player_id: "g", name: "Gym" }),
    player({ player_id: "o", name: "Office" }),
    player({ player_id: "builtin", name: "Browser" }),
  );
});

describe("SpeakerList", () => {
  it("gives a group a row named by its colour, its speakers under it", () => {
    holder.list.value = kitchenGroup();
    const wrapper = mountList("k");

    const row = wrapper.get("[data-playing-room-row]");
    expect(row.text()).toContain("player_select.colours.orange");
    expect(row.find("[data-group-corner]").exists()).toBe(true);
    // under the row, and greyed under its heading
    for (const id of ["k", "d"]) {
      const cards = wrapper.findAll(`[data-room-card][data-player-id="${id}"]`);
      expect(cards).toHaveLength(2);
      expect(cards[1].attributes("data-group")).toBe(
        "player_select.colours.orange",
      );
    }
  });

  it("draws the server's sections in order, this device last", () => {
    holder.list.value = kitchenGroup();
    const wrapper = mountList();

    expect(wrapper.findAll("h3").map((h) => h.text())).toEqual([
      "Main",
      "Basement",
      "this_device",
    ]);
  });

  it("shows this device even when the server leaves it out", () => {
    const list = kitchenGroup();
    list.sections = list.sections.filter((s) => s.key !== "other");
    delete list.rooms.builtin;
    holder.list.value = list;
    const wrapper = mountList();

    expect(wrapper.findAll("h3").map((h) => h.text())).toEqual([
      "Main",
      "Basement",
      "this_device",
    ]);
    expect(
      wrapper.findAll('[data-room-card][data-player-id="builtin"]'),
    ).toHaveLength(1);
  });

  it("shows this device once when the server lists it", () => {
    holder.list.value = kitchenGroup();
    const wrapper = mountList();

    expect(
      wrapper.findAll('[data-room-card][data-player-id="builtin"]'),
    ).toHaveLength(1);
  });

  it("selects a group from any of its greyed speakers", async () => {
    holder.list.value = kitchenGroup();
    api.players.k.playback_state = PlaybackState.IDLE;
    const wrapper = mountList();

    await card(wrapper, "d").trigger("click");
    await card(wrapper, "g").trigger("click");

    expect(wrapper.emitted("select")).toEqual([
      [api.players.k],
      [api.players.g],
    ]);
  });

  it("shows one plain block when the server sends no list", () => {
    const wrapper = mountList();

    expect(wrapper.findAll("h3").map((h) => h.text())).toEqual(["this_device"]);
    expect(wrapper.find("[data-group-corner]").exists()).toBe(false);
  });

  it("plays and pauses a row's room, and opens its group editor", async () => {
    holder.list.value = kitchenGroup();
    api.players.k.current_media = {
      uri: "x",
      media_type: "track",
      title: "Song",
      artist: "Band",
      album: null,
      image_url: null,
      palette: null,
      duration: 100,
      source_id: null,
      elapsed_time: null,
      elapsed_time_last_updated: null,
      queue_item_id: null,
    } as Player["current_media"];
    const wrapper = mountList("k");

    await wrapper.get('[aria-label="pause"]').trigger("click");
    await wrapper
      .get(
        '[aria-label="player_select.edit_group:player_select.colours.orange"]',
      )
      .trigger("click");

    expect(api.playerCommandPlayPause).toHaveBeenCalledWith("k");
    expect(wrapper.emitted("openGroupEditor")).toEqual([[api.players.k]]);
  });

  it("gives a row with nothing loaded no play button", () => {
    const wrapper = mountList("o");

    expect(wrapper.find('[aria-label="play"]').exists()).toBe(false);
  });
});

describe("GroupEditor", () => {
  function mountEditor() {
    return mount(GroupEditor, {
      ...mountOptions,
      props: { leader: api.players.k },
    });
  }

  it("offers only the rooms the server says can join", () => {
    const list = kitchenGroup();
    list.rooms.k.group_with = ["d", "g"];
    holder.list.value = list;
    const wrapper = mountEditor();

    expect(wrapper.find('[data-room-card][data-player-id="o"]').exists()).toBe(
      false,
    );
    expect(card(wrapper, "g").attributes("data-player-id")).toBe("g");
  });

  it("adds a room on one click and takes a member out on another", async () => {
    holder.list.value = kitchenGroup();
    const wrapper = mountEditor();

    await card(wrapper, "g").trigger("click");
    await card(wrapper, "d").trigger("click");

    expect(api.playerCommandSetMembers).toHaveBeenNthCalledWith(
      1,
      "k",
      ["g"],
      undefined,
    );
    expect(api.playerCommandSetMembers).toHaveBeenNthCalledWith(
      2,
      "k",
      undefined,
      ["d"],
    );
  });

  it("adds every room under a heading that is not in yet", async () => {
    holder.list.value = kitchenGroup();
    const wrapper = mountEditor();
    const main = wrapper
      .findAll("[data-room-section]")
      .find((section) => section.find("h3").text() === "Main");

    await main!.get("button.text-primary").trigger("click");

    expect(api.playerCommandSetMembers).toHaveBeenCalledWith(
      "k",
      ["o"],
      undefined,
    );
  });

  it("takes the leader out like any other room", async () => {
    holder.list.value = kitchenGroup();
    const wrapper = mountEditor();

    await card(wrapper, "k").trigger("click");

    expect(api.playerCommandUnGroup).toHaveBeenCalledWith("k");
    expect(api.playerCommandSetMembers).not.toHaveBeenCalled();
  });
});
