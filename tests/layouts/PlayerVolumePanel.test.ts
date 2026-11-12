import { speakerList } from "@/composables/speakerListState";
import PlayerVolume from "@/layouts/default/PlayerOSD/PlayerVolume.vue";
import PlayerVolumePanel from "@/layouts/default/PlayerOSD/PlayerVolumePanel.vue";
import { type Player, PlayerType } from "@/plugins/api/interfaces";
import { store } from "@/plugins/store";
import { shallowMount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isPlayerGrouped } = vi.hoisted(() => ({
  isPlayerGrouped: vi.fn(() => true),
}));

vi.mock("@/plugins/api", async () => {
  const { reactive } = await vi.importActual<typeof import("vue")>("vue");
  const api = reactive({ players: {} as Record<string, Player> });
  return { api, default: api };
});

vi.mock("@/plugins/store", async () => {
  const { reactive } = await vi.importActual<typeof import("vue")>("vue");
  return { store: reactive({ mobileLayout: false }) };
});

vi.mock("@/helpers/players", () => ({
  getPlayerDisplayName: (player: Player) => player.name,
  getPlayerName: (player: Player) => player.name,
  isPlayerGrouped,
}));

const mockStore = store as unknown as { mobileLayout: boolean };

function createPlayer(overrides: Partial<Player> = {}): Player {
  return {
    player_id: "parent",
    name: "Kitchen",
    available: true,
    volume_control: "volume",
    group_members: ["parent", "child"],
    ...overrides,
  } as Player;
}

let wrapper: VueWrapper | undefined;

async function mountPanel(mobileLayout: boolean) {
  const { api } = await import("@/plugins/api");
  const parent = createPlayer();
  api.players = {
    parent,
    child: createPlayer({ player_id: "child", name: "Office" }),
  };
  mockStore.mobileLayout = mobileLayout;
  wrapper = shallowMount(PlayerVolumePanel, {
    props: { player: parent },
    global: { mocks: { $t: (key: string) => key } },
  });
  return wrapper;
}

describe("PlayerVolumePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isPlayerGrouped.mockReturnValue(true);
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    speakerList.value = undefined;
  });

  it.each([
    { mobileLayout: true, expandOnTouch: true },
    { mobileLayout: false, expandOnTouch: false },
  ])(
    "grows its rows on touch when mobileLayout is $mobileLayout",
    async ({ mobileLayout, expandOnTouch }) => {
      // the same panel backs the desktop volume popout, where a pointer has no
      // trouble with the resting rail
      const panel = await mountPanel(mobileLayout);
      const sliders = panel.findAllComponents(PlayerVolume);

      expect(sliders.length).toBeGreaterThan(1);
      for (const slider of sliders) {
        expect(slider.props("expandOnTouch")).toBe(expandOnTouch);
      }
    },
  );

  it("covers the child rows as well as the grouped row", async () => {
    const panel = await mountPanel(true);
    const sliders = panel.findAllComponents(PlayerVolume);

    // the last slider is the grouped one; everything before it is a child
    expect(sliders).toHaveLength(3);
    expect(sliders.at(-1)!.props("preferGroupVolume")).toBe(true);
    expect(sliders.at(0)!.props("preferGroupVolume")).toBe(false);
  });

  describe("with the server's speaker list", () => {
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

    // Master bath (b) leads with the Master Bedroom pair (mb), whose own
    // speakers m1 and m2 are hidden and synced to b.
    async function mountGroup(activeId: string, grouped = true) {
      const { api } = await import("@/plugins/api");
      api.players = {
        b: createPlayer({
          player_id: "b",
          name: "Master bath",
          group_members: ["b", "m2", "m1"],
        }),
        mb: createPlayer({
          player_id: "mb",
          name: "Master Bedroom",
          type: PlayerType.GROUP,
          group_members: ["m1", "m2"],
        }),
        m1: createPlayer({ player_id: "m1", name: "MB 1", group_members: [] }),
        m2: createPlayer({ player_id: "m2", name: "MB 2", group_members: [] }),
      };
      speakerList.value = {
        revision: 1,
        grouping: "floor",
        sections: [],
        rooms: { b: entry(null), mb: entry(grouped ? "b" : null) },
        groups: grouped
          ? [{ leader: "b", colour: "orange", members: ["mb"] }]
          : [],
        permanent_groups: [],
      };
      wrapper = shallowMount(PlayerVolumePanel, {
        props: { player: api.players[activeId] },
        global: { mocks: { $t: (key: string) => key } },
      });
      return wrapper;
    }

    it("gives each room a slider, the pair as one, never its speakers", async () => {
      const sliders = (await mountGroup("b")).findAllComponents(PlayerVolume);
      const rows = sliders.slice(0, -1);

      expect(rows.map((s) => s.props("player").player_id)).toEqual(["b", "mb"]);
      // the pair has no volume of its own: its row is its group volume
      expect(rows.map((s) => s.props("preferGroupVolume"))).toEqual([
        false,
        true,
      ]);
      expect(sliders.at(-1)!.props("player").player_id).toBe("b");
    });

    it("puts the group slider on the leader when a member is shown", async () => {
      const sliders = (await mountGroup("mb")).findAllComponents(PlayerVolume);

      expect(sliders).toHaveLength(3);
      expect(sliders.at(-1)!.props("player").player_id).toBe("b");
    });

    it("shows a pair on its own as one speaker, with no list", async () => {
      const panel = await mountGroup("mb", false);
      const sliders = panel.findAllComponents(PlayerVolume);

      expect(sliders).toHaveLength(1);
      expect(panel.text()).not.toContain("grouped_volume");
    });
  });
});
