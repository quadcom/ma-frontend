import GroupEditor from "@/components/speakers/GroupEditor.vue";
import SpeakerList from "@/components/speakers/SpeakerList.vue";
import type { SpeakerListReply, SpeakerListRoom } from "@/helpers/speaker_list";
import { api, type MusicAssistantApi } from "@/plugins/api";
import {
  PlaybackState,
  type Player,
  PlayerType,
} from "@/plugins/api/interfaces";
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
    sendCommand: vi.fn(() => Promise.resolve()),
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

vi.mock("@/plugins/auth", () => ({
  authManager: { hasScope: () => true },
}));

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

const SET_MEMBERS = "hass/speaker_list/set_members";

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

    expect(api.sendCommand).toHaveBeenNthCalledWith(1, SET_MEMBERS, {
      target_player: "k",
      player_ids_to_add: ["g"],
      player_ids_to_remove: null,
    });
    expect(api.sendCommand).toHaveBeenNthCalledWith(2, SET_MEMBERS, {
      target_player: "k",
      player_ids_to_add: null,
      player_ids_to_remove: ["d"],
    });
    expect(api.playerCommandSetMembers).not.toHaveBeenCalled();
  });

  it("adds every room under a heading that is not in yet", async () => {
    holder.list.value = kitchenGroup();
    const wrapper = mountEditor();
    const main = wrapper
      .findAll("[data-room-section]")
      .find((section) => section.find("h3").text() === "Main");

    await main!.get("button.text-primary").trigger("click");

    expect(api.sendCommand).toHaveBeenCalledWith(SET_MEMBERS, {
      target_player: "k",
      player_ids_to_add: ["o"],
      player_ids_to_remove: null,
    });
  });

  it("takes the leader out like any other room", async () => {
    holder.list.value = kitchenGroup();
    const wrapper = mountEditor();

    await card(wrapper, "k").trigger("click");

    expect(api.playerCommandUnGroup).toHaveBeenCalledWith("k");
    expect(api.playerCommandSetMembers).not.toHaveBeenCalled();
    expect(api.sendCommand).not.toHaveBeenCalled();
  });

  it("uses the stock command when the server sends no list", async () => {
    const wrapper = mountEditor();

    await card(wrapper, "g").trigger("click");

    expect(api.playerCommandSetMembers).toHaveBeenCalledWith(
      "k",
      ["g"],
      undefined,
    );
    expect(api.sendCommand).not.toHaveBeenCalled();
  });

  it("never retries a failed add with the stock command", async () => {
    holder.list.value = kitchenGroup();
    vi.mocked(api.sendCommand).mockRejectedValueOnce(new Error("no"));
    vi.mocked(api.getPlayer).mockResolvedValue(api.players.k);
    const wrapper = mountEditor();

    await card(wrapper, "g").trigger("click");
    await flushPromises();

    expect(api.playerCommandSetMembers).not.toHaveBeenCalled();
    expect(api.getPlayer).toHaveBeenCalledWith("k");
  });

  it("treats a permanent group in the group as one member", async () => {
    // Master Bedroom (mb) is in Kitchen's group; the players name its hidden
    // speakers, not mb itself.
    const list = kitchenGroup();
    list.sections[0].rooms.push("mb");
    list.rooms.mb = room({ group_leader: "k", is_permanent_group: true });
    list.rooms.k.group_with.push("mb");
    list.groups[0].members.push("mb");
    list.permanent_groups = [
      { player: "mb", name: "Master Bedroom", members: ["m1", "m2"] },
    ];
    holder.list.value = list;
    api.players.mb = player({
      player_id: "mb",
      name: "Master Bedroom",
      type: PlayerType.GROUP,
    });
    const wrapper = mountEditor();

    expect(card(wrapper, "mb").attributes("data-group")).toBe(
      "player_select.colours.orange",
    );
    await card(wrapper, "mb").trigger("click");

    expect(api.sendCommand).toHaveBeenCalledWith(SET_MEMBERS, {
      target_player: "k",
      player_ids_to_add: null,
      player_ids_to_remove: ["mb"],
    });
  });
});

describe("stereo pairs", () => {
  function pairList(stereo: boolean): SpeakerListReply {
    const list = kitchenGroup();
    list.sections[0].rooms.push("mb");
    list.rooms.mb = room({ is_permanent_group: true, is_stereo_pair: stereo });
    list.permanent_groups = [
      {
        player: "mb",
        name: "Master Bedroom",
        members: ["m1", "m2"],
        is_stereo_pair: stereo,
        stereo_left: stereo ? "m1" : null,
      },
    ];
    return list;
  }

  beforeEach(() => {
    api.players.mb = player({
      player_id: "mb",
      name: "Master Bedroom",
      type: PlayerType.GROUP,
    });
    api.players.m1 = player({ player_id: "m1", name: "MB One" });
    api.players.m2 = player({ player_id: "m2", name: "MB Two" });
  });

  it("marks a stereo pair's card", () => {
    holder.list.value = pairList(true);
    const wrapper = mountList();

    expect(card(wrapper, "mb").text()).toContain("player_select.stereo");
  });

  it("offers the set-up in a pair's own editor only", () => {
    holder.list.value = pairList(false);
    const pair = mount(GroupEditor, {
      ...mountOptions,
      props: { leader: api.players.mb },
    });
    const other = mount(GroupEditor, {
      ...mountOptions,
      props: { leader: api.players.k },
    });

    expect(pair.find("[data-stereo-pair]").exists()).toBe(true);
    expect(other.find("[data-stereo-pair]").exists()).toBe(false);
  });
});
