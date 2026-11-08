import PlayerRoomButton from "@/views/settings/PlayerRoomButton.vue";
import type { AreasReply } from "@/helpers/areas";
import type { SpeakerListReply } from "@/helpers/speaker_list";
import { api } from "@/plugins/api";
import type { Player } from "@/plugins/api/interfaces";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import type { ShallowRef } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { player } from "../fixtures/player";

const holder = vi.hoisted(() => ({
  list: undefined as unknown as ShallowRef<SpeakerListReply | undefined>,
  canWrite: true,
}));

vi.mock("@/plugins/api", async () => {
  const { reactive } = await vi.importActual<typeof import("vue")>("vue");
  const api = reactive({
    players: {} as Record<string, Player>,
    sendCommand: vi.fn(),
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

vi.mock("@/helpers/players", () => ({
  getPlayerDisplayName: (p: Player) => p.name,
}));

vi.mock("@/plugins/store", () => ({ store: { dialogActive: false } }));

const translate = (key: string, args?: Record<string, string>) =>
  args ? `${key}:${Object.values(args).join(",")}` : key;
vi.mock("@/plugins/i18n", () => ({
  $t: (key: string, args?: Record<string, string>) =>
    args ? `${key}:${Object.values(args).join(",")}` : key,
}));

vi.mock("vue-sonner", () => ({ toast: { success: vi.fn() } }));

enableAutoUnmount(afterEach);

const AREAS = "hass/areas";
const SET = "hass/areas/set_player";
const CREATE = "hass/areas/create";

function areas(): AreasReply {
  return {
    floors: [{ floor_id: "main", name: "Main", level: 0 }],
    areas: [
      { area_id: "kitchen", name: "Kitchen", floor_id: "main" },
      { area_id: "garage", name: "Garage", floor_id: null },
    ],
    player_areas: { k: "kitchen" },
  };
}

function speakerList(): SpeakerListReply {
  return {
    revision: 1,
    grouping: "floor",
    sections: [],
    rooms: {
      k: {
        name: "",
        area: "Kitchen",
        floor: null,
        floor_level: null,
        labels: [],
        available: true,
        group_leader: null,
        is_permanent_group: false,
        group_with: [],
      },
    },
    groups: [],
    permanent_groups: [],
  };
}

function mountButton() {
  return mount(PlayerRoomButton, {
    props: { playerId: "k" },
    attachTo: document.body,
    global: { mocks: { $t: translate } },
  });
}

async function openPicker() {
  const wrapper = mountButton();
  await wrapper.get("[data-room-button]").trigger("click");
  await flushPromises();
  return wrapper;
}

const choices = () => [
  ...document.querySelectorAll<HTMLButtonElement>("[data-room-choice]"),
];
const choice = (label: string) =>
  choices().find((c) => c.textContent?.includes(label))!;

beforeEach(() => {
  holder.canWrite = true;
  holder.list.value = speakerList();
  api.players = { k: player({ player_id: "k", name: "Kitchen speaker" }) };
  vi.mocked(api.sendCommand).mockReset();
  vi.mocked(api.sendCommand).mockImplementation(((command: string) =>
    Promise.resolve(
      command === AREAS
        ? areas()
        : command === CREATE
          ? { area_id: "den", floor_id: "main" }
          : null,
    )) as never);
  document.body.innerHTML = "";
});

describe("PlayerRoomButton", () => {
  it("names the player's room on the button", () => {
    expect(mountButton().get("[data-room-button]").text()).toContain(
      "settings.room_button:Kitchen",
    );
  });

  it("is hidden from users who may not change player settings", () => {
    holder.canWrite = false;
    expect(mountButton().find("[data-room-button]").exists()).toBe(false);
  });

  it("lists None, then the rooms under their floors, the current one ticked", async () => {
    await openPicker();

    expect(choices().map((c) => c.textContent?.trim())).toEqual([
      "settings.room_none",
      "Kitchen",
      "Garage",
    ]);
    expect(choice("Kitchen").getAttribute("aria-pressed")).toBe("true");
    expect(document.body.textContent).toContain("Main");
    expect(document.body.textContent).toContain("settings.room_no_floor");
  });

  it("moves the player to the room picked", async () => {
    await openPicker();
    choice("Garage").click();
    await flushPromises();

    expect(api.sendCommand).toHaveBeenCalledWith(SET, {
      player_id: "k",
      area_id: "garage",
    });
  });

  it("takes the player out of every room with None", async () => {
    await openPicker();
    choice("settings.room_none").click();
    await flushPromises();

    expect(api.sendCommand).toHaveBeenCalledWith(SET, {
      player_id: "k",
      area_id: null,
    });
  });

  it("adds a room on a new floor, then puts the player in it", async () => {
    await openPicker();
    document.querySelector<HTMLButtonElement>("[data-room-add-open]")!.click();
    await flushPromises();

    const type = (selector: string, value: string) => {
      const input = document.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event("input"));
    };
    type("input[data-room-name]", "Den");
    const floor = document.querySelector<HTMLSelectElement>("select")!;
    floor.value = "__new__";
    floor.dispatchEvent(new Event("change"));
    await flushPromises();
    type("input[data-room-new-floor]", "Basement");
    await flushPromises();
    document
      .querySelector<HTMLFormElement>("[data-room-add]")!
      .dispatchEvent(new Event("submit"));
    await flushPromises();

    expect(api.sendCommand).toHaveBeenCalledWith(CREATE, {
      name: "Den",
      new_floor_name: "Basement",
    });
    expect(api.sendCommand).toHaveBeenCalledWith(SET, {
      player_id: "k",
      area_id: "den",
    });
  });
});
