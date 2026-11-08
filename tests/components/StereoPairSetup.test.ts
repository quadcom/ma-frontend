import StereoPairSetup from "@/components/speakers/StereoPairSetup.vue";
import type { PermanentGroup } from "@/helpers/speaker_list";
import { api } from "@/plugins/api";
import type { Player } from "@/plugins/api/interfaces";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { player } from "../fixtures/player";

vi.mock("@/plugins/api", async () => {
  const { reactive } = await vi.importActual<typeof import("vue")>("vue");
  const api = reactive({
    players: {} as Record<string, Player>,
    sendCommand: vi.fn(() => Promise.resolve()),
  });
  return { api, default: api };
});

vi.mock("@/plugins/i18n", () => ({
  $t: (key: string, args?: Record<string, string>) =>
    args?.name ? `${key}:${args.name}` : key,
}));

vi.mock("vue-sonner", () => ({ toast: { success: vi.fn() } }));

const IDENTIFY = "hass/stereo_pair/identify";
const SET = "hass/stereo_pair/set";
const translate = (key: string, args?: Record<string, string>) =>
  args?.name ? `${key}:${args.name}` : key;

function group(left: string | null = null): PermanentGroup {
  return {
    player: "mb",
    name: "Master Bedroom",
    // the second one sorts first by name, so it dings first
    members: ["m2", "m1"],
    is_stereo_pair: left !== null,
    stereo_left: left,
  };
}

function mountSetup(left: string | null = null) {
  return mount(StereoPairSetup, {
    props: { group: group(left) },
    global: { mocks: { $t: translate } },
  });
}

const button = (wrapper: ReturnType<typeof mountSetup>, key: string) =>
  wrapper.findAll("button").find((b) => b.text() === key)!;

beforeEach(() => {
  vi.clearAllMocks();
  api.players = {
    m1: player({ player_id: "m1", name: "MB One" }),
    m2: player({ player_id: "m2", name: "MB Two" }),
  };
});

describe("StereoPairSetup", () => {
  it("dings the first speaker by name and keeps it left on yes", async () => {
    const wrapper = mountSetup();

    await button(wrapper, "player_select.stereo_set_up").trigger("click");
    await flushPromises();
    expect(api.sendCommand).toHaveBeenCalledWith(IDENTIFY, { player_id: "m1" });
    expect(wrapper.text()).toContain("player_select.stereo_listen:MB One");

    await button(wrapper, "player_select.stereo_yes").trigger("click");
    await flushPromises();
    expect(api.sendCommand).toHaveBeenLastCalledWith(SET, {
      group_id: "mb",
      left_player_id: "m1",
    });
  });

  it("makes the other speaker left on no", async () => {
    const wrapper = mountSetup();

    await button(wrapper, "player_select.stereo_set_up").trigger("click");
    await flushPromises();
    await button(wrapper, "player_select.stereo_no").trigger("click");
    await flushPromises();

    expect(api.sendCommand).toHaveBeenLastCalledWith(SET, {
      group_id: "mb",
      left_player_id: "m2",
    });
  });

  it("says which side is left and can turn the pair off", async () => {
    const wrapper = mountSetup("m2");

    expect(wrapper.text()).toContain("player_select.stereo_left_is:MB Two");
    await button(wrapper, "player_select.stereo_off").trigger("click");
    await flushPromises();

    expect(api.sendCommand).toHaveBeenCalledWith(SET, {
      group_id: "mb",
      left_player_id: null,
    });
  });

  it("does not ask when the ding fails", async () => {
    vi.mocked(api.sendCommand).mockRejectedValueOnce(new Error("offline"));
    const wrapper = mountSetup();

    await button(wrapper, "player_select.stereo_set_up").trigger("click");
    await flushPromises();

    expect(wrapper.text()).not.toContain("player_select.stereo_question");
  });
});
