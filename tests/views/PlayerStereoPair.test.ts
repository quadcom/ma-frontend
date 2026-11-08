import PlayerStereoPair from "@/views/settings/PlayerStereoPair.vue";
import type { SpeakerListReply } from "@/helpers/speaker_list";
import { api } from "@/plugins/api";
import type { Player } from "@/plugins/api/interfaces";
import { mount } from "@vue/test-utils";
import type { ShallowRef } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { player } from "../fixtures/player";

const holder = vi.hoisted(() => ({
  list: undefined as unknown as ShallowRef<SpeakerListReply | undefined>,
  canWrite: true,
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

vi.mock("@/plugins/auth", () => ({
  authManager: { hasScope: () => holder.canWrite },
}));

vi.mock("@/plugins/i18n", () => ({ $t: (key: string) => key }));
vi.mock("vue-sonner", () => ({ toast: { success: vi.fn() } }));

function reply(members: string[]): SpeakerListReply {
  return {
    revision: 1,
    grouping: "floor",
    sections: [],
    rooms: {},
    groups: [],
    permanent_groups: [
      {
        player: "mb",
        name: "Master Bedroom",
        members,
        is_stereo_pair: true,
        stereo_left: members[0],
      },
    ],
  };
}

function mountPair(playerId = "mb") {
  return mount(PlayerStereoPair, {
    props: { playerId },
    global: { mocks: { $t: (key: string) => key } },
  });
}

beforeEach(() => {
  holder.canWrite = true;
  api.players = {
    m1: player({ player_id: "m1", name: "MB One" }),
    m2: player({ player_id: "m2", name: "MB Two" }),
  };
  holder.list.value = reply(["m1", "m2"]);
});

describe("PlayerStereoPair", () => {
  it("shows left and right on a pair's page", () => {
    expect(mountPair().find("[data-stereo-pair]").exists()).toBe(true);
  });

  it("stays away from other players and bigger groups", () => {
    expect(mountPair("m1").find("[data-stereo-pair]").exists()).toBe(false);
    holder.list.value = reply(["m1", "m2", "m3"]);
    expect(mountPair().find("[data-stereo-pair]").exists()).toBe(false);
  });

  it("is hidden from users who may not change player settings", () => {
    holder.canWrite = false;
    expect(mountPair().find("[data-stereo-pair]").exists()).toBe(false);
  });
});
