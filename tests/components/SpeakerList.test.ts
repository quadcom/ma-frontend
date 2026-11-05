import GroupEditor from "@/components/speakers/GroupEditor.vue";
import SpeakerList from "@/components/speakers/SpeakerList.vue";
import type {
  PlayerGrouping,
  PlayerLocation,
} from "@/helpers/speaker_sections";
import { api, type MusicAssistantApi } from "@/plugins/api";
import { PlaybackState, type Player } from "@/plugins/api/interfaces";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { player } from "../fixtures/player";

const { locations, grouping } = vi.hoisted(() => ({
  locations: { value: undefined as Record<string, PlayerLocation> | undefined },
  grouping: { value: "floor" as PlayerGrouping },
}));

vi.mock("@/plugins/api", async () => {
  const { reactive } = await vi.importActual<typeof import("vue")>("vue");
  const api = reactive({
    players: {} as Record<string, Player>,
    queues: {},
    queueElapsedTime: {},
    getPlayer: vi.fn<MusicAssistantApi["getPlayer"]>(),
    playerCommandSetMembers: vi.fn<
      MusicAssistantApi["playerCommandSetMembers"]
    >(() => Promise.resolve()),
    playerCommandUnGroup: vi.fn<MusicAssistantApi["playerCommandUnGroup"]>(() =>
      Promise.resolve(),
    ),
  });
  return { api, default: api };
});

vi.mock("@/composables/useSpeakerLocations", async () => {
  const { ref } = await vi.importActual<typeof import("vue")>("vue");
  const locationsRef = ref<Record<string, PlayerLocation>>();
  const groupingRef = ref<PlayerGrouping>("floor");
  return {
    useSpeakerLocations: () => {
      locationsRef.value = locations.value;
      groupingRef.value = grouping.value;
      return {
        locations: locationsRef,
        grouping: groupingRef,
        refresh: vi.fn(),
      };
    },
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

const at = (floor: string, level: number): PlayerLocation => ({
  area: floor,
  floor,
  floor_level: level,
  labels: [],
});

function setPlayers(...players: Player[]) {
  api.players = Object.fromEntries(players.map((p) => [p.player_id, p]));
}

const translate = (key: string, args?: Record<string, string>) =>
  args?.name ? `${key}:${args.name}` : key;
const mountOptions = { global: { mocks: { $t: translate } } };

function mountList(activeId?: string) {
  return mount(SpeakerList, {
    ...mountOptions,
    props: {
      players: Object.values(api.players),
      activeId,
      topOrder: [],
    },
  });
}

const card = (wrapper: ReturnType<typeof mount>, id: string) =>
  wrapper.get(`[data-room-card][data-player-id="${id}"]`);

beforeEach(() => {
  vi.clearAllMocks();
  locations.value = undefined;
  grouping.value = "floor";
});

describe("SpeakerList", () => {
  it("gives a playing room a row with its group members under it", () => {
    setPlayers(
      player({
        player_id: "k",
        name: "Kitchen",
        playback_state: PlaybackState.PLAYING,
        group_members: ["k", "d"],
      }),
      player({ player_id: "d", name: "Dining", synced_to: "k" }),
      player({ player_id: "o", name: "Office" }),
    );
    const wrapper = mountList("o");

    const rows = wrapper.findAll("[data-playing-room-row]");
    expect(rows.map((row) => row.attributes("data-player-id"))).toEqual([
      "k",
      "o",
    ]);
    expect(rows[1].text()).toContain("player_select.active");
    // Dining sits under Kitchen's row and greyed in the room cards below
    expect(
      wrapper.findAll('[data-room-card][data-player-id="d"]'),
    ).toHaveLength(2);
  });

  it("ignores clicks on a grouped room and selects a free one", async () => {
    setPlayers(
      player({ player_id: "k", name: "Kitchen", group_members: ["k", "d"] }),
      player({ player_id: "d", name: "Dining", synced_to: "k" }),
      player({ player_id: "g", name: "Gym" }),
    );
    const wrapper = mountList();

    expect(card(wrapper, "d").element.tagName).toBe("DIV");
    expect(card(wrapper, "d").text()).toContain("Kitchen");
    await card(wrapper, "g").trigger("click");

    expect(wrapper.emitted("select")).toEqual([[api.players.g]]);
  });

  it("puts rooms under floor headings, highest first, this device last", () => {
    locations.value = { g: at("Basement", -1), m: at("Main", 1) };
    setPlayers(
      player({ player_id: "g", name: "Gym" }),
      player({ player_id: "m", name: "Office" }),
      player({ player_id: "x", name: "Screen" }),
      player({ player_id: "builtin", name: "Browser" }),
    );
    const wrapper = mountList();

    expect(wrapper.findAll("h3").map((h) => h.text())).toEqual([
      "Main",
      "Basement",
      "player_select.other",
      "this_device",
    ]);
  });

  it("shows one block without headings when nothing is known", () => {
    setPlayers(player({ player_id: "g", name: "Gym" }));
    const wrapper = mountList();

    expect(wrapper.findAll("h3")).toHaveLength(0);
    expect(card(wrapper, "g").attributes("data-player-id")).toBe("g");
  });

  it("asks for the group editor from a row's link button", async () => {
    setPlayers(
      player({
        player_id: "k",
        name: "Kitchen",
        can_group_with: ["g"],
        playback_state: PlaybackState.PLAYING,
      }),
    );
    const wrapper = mountList("k");

    await wrapper
      .get('[aria-label="player_select.group_with:Kitchen"]')
      .trigger("click");

    expect(wrapper.emitted("openGroupEditor")).toEqual([[api.players.k]]);
  });
});

describe("GroupEditor", () => {
  function mountEditor() {
    return mount(GroupEditor, {
      ...mountOptions,
      props: { leader: api.players.k },
    });
  }

  beforeEach(() => {
    locations.value = {
      d: at("Main", 1),
      l: at("Main", 1),
      g: at("Basement", -1),
    };
    setPlayers(
      player({
        player_id: "k",
        name: "Kitchen",
        group_members: ["k", "d"],
        can_group_with: ["d", "l", "g"],
      }),
      player({ player_id: "d", name: "Dining", synced_to: "k" }),
      player({ player_id: "l", name: "Living" }),
      player({ player_id: "g", name: "Gym" }),
    );
  });

  it("adds a room on one click and takes a member out on another", async () => {
    const wrapper = mountEditor();

    await card(wrapper, "l").trigger("click");
    await card(wrapper, "d").trigger("click");

    expect(api.playerCommandSetMembers).toHaveBeenNthCalledWith(
      1,
      "k",
      ["l"],
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
    const wrapper = mountEditor();
    const main = wrapper
      .findAll("[data-room-section]")
      .find((section) => section.find("h3").text() === "Main");

    await main!.get("button.text-primary").trigger("click");

    expect(api.playerCommandSetMembers).toHaveBeenCalledWith(
      "k",
      ["l"],
      undefined,
    );
  });

  it("lets the leader leave its own group", async () => {
    const wrapper = mountEditor();

    const leave = wrapper
      .findAll("button")
      .find((button) => button.text() === "player_select.leave_group");
    await leave!.trigger("click");

    expect(api.playerCommandUnGroup).toHaveBeenCalledWith("k");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
