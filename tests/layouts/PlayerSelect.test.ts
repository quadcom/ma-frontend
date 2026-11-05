import PlayerSelect from "@/layouts/default/PlayerSelect.vue";
import {
  fullscreenPlayerSelectAnchor,
  playerBarEndAnchor,
} from "@/helpers/player_bar";
import { api } from "@/plugins/api";
import {
  IdentifierType,
  PlaybackState,
  type Player,
  PlayerType,
  Scope,
} from "@/plugins/api/interfaces";
import { store as storeModule } from "@/plugins/store";
import { webPlayer } from "@/plugins/web_player";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  emitEvent,
  getPreference,
  hasScope,
  preferenceState,
  refreshLocations,
  setPreference,
} = vi.hoisted(() => ({
  emitEvent: vi.fn(),
  refreshLocations: vi.fn(),
  getPreference: vi.fn(),
  hasScope: vi.fn((_scope: Scope) => true),
  preferenceState: {
    values: {} as Record<string, unknown>,
    reactiveValues: undefined as Record<string, unknown> | undefined,
  },
  setPreference: vi.fn(),
}));

vi.mock("@/plugins/api", async () => {
  const { reactive } = await vi.importActual<typeof import("vue")>("vue");
  const api = reactive({
    players: {} as Record<string, Player>,
    // the menu's ai dj entry derives availability from the provider list
    providers: {},
  });
  return { api, default: api };
});

vi.mock("@/plugins/store", async () => {
  const { computed, reactive } =
    await vi.importActual<typeof import("vue")>("vue");
  const { api } = await import("@/plugins/api");
  return {
    store: reactive({
      // resolved from the player list like the real store, so the guard against
      // overriding an existing selection behaves the same
      activePlayer: computed(() =>
        storeModule.activePlayerId
          ? api.players[storeModule.activePlayerId]
          : undefined,
      ),
      activePlayerId: undefined as string | undefined,
      companionPlayerId: undefined as string | undefined,
      dialogActive: false,
      isTouchscreen: false,
      mobileLayout: false,
      showFullscreenPlayer: false,
      showPlayersMenu: true,
      enabledPlugins: new Set<string>(),
    }),
  };
});

vi.mock("@/plugins/web_player", async () => {
  const { reactive } = await vi.importActual<typeof import("vue")>("vue");
  return {
    webPlayer: reactive({
      player_id: null as string | null,
    }),
  };
});

vi.mock("@/plugins/eventbus", () => ({
  eventbus: {
    emit: emitEvent,
  },
}));

// plain let read lazily by the mock, so tests can flip it per case
let isDashboardViewer = false;

vi.mock("@/plugins/auth", () => ({
  authManager: {
    hasScope,
    isDashboardViewer: () => isDashboardViewer,
  },
}));

vi.mock("@/plugins/i18n", () => ({
  $t: (key: string) => key,
}));

vi.mock("vue-sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/composables/userPreferences", async () => {
  const { computed, reactive } =
    await vi.importActual<typeof import("vue")>("vue");
  const reactiveValues = reactive(preferenceState.values);
  preferenceState.reactiveValues = reactiveValues;
  getPreference.mockImplementation((key: string, defaultValue?: unknown) =>
    computed(() =>
      key in reactiveValues ? reactiveValues[key] : defaultValue,
    ),
  );
  setPreference.mockImplementation(async (key: string, value: unknown) => {
    reactiveValues[key] = value;
  });
  return {
    useUserPreferences: () => ({
      getPreference,
      setPreference,
    }),
  };
});

vi.mock("@/composables/useSpeakerLocations", () => ({
  useSpeakerLocations: () => ({ refresh: refreshLocations }),
}));

vi.mock("@/helpers/players", () => ({
  canEditPlayerGroup: (player: Player) => player.can_group_with.length > 0,
  getPlayerDisplayName: (player: Player) =>
    player.player_id === "builtin" ? "This device" : player.name,
  groupMemberPickerVisible: () => true,
  isBuiltinPlayer: (player: Player) => player.player_id === "builtin",
  isPlayerActive: (player: Player) =>
    player.playback_state === PlaybackState.PLAYING ||
    player.playback_state === PlaybackState.PAUSED,
  isSelectablePlayer: (player?: Player) =>
    Boolean(
      player?.enabled &&
      player.available &&
      !player.needs_setup &&
      player.type !== PlayerType.SOURCE,
    ),
  playerVisible: (
    player: Player,
    _allowGroupChilds: boolean,
    allowNeedsSetup: boolean,
  ) => !player.needs_setup || allowNeedsSetup,
}));

// the real store computes these; on the mock they are plain writable state
const store = storeModule as typeof storeModule & { mobileLayout: boolean };

// the list and the editor have their own tests; here they only report which
// players they were given and pass clicks back up
const SpeakerListStub = {
  name: "SpeakerList",
  props: ["players", "activeId", "topOrder"],
  emits: ["select", "openGroupEditor", "update:topOrder"],
  template: `
    <div class="speaker-list">
      <article
        v-for="player in players"
        :key="player.player_id"
        class="player-card"
        :data-player-id="player.player_id"
      >
        <button class="select-player" @click="$emit('select', player)">
          {{ player.name }}
        </button>
        <button
          class="open-group-editor"
          @click="$emit('openGroupEditor', player)"
        />
      </article>
    </div>
  `,
};

const GroupEditorStub = {
  name: "GroupEditor",
  props: ["leader"],
  emits: ["close"],
  template: `
    <div class="group-editor" :data-leader-id="leader.player_id">
      <button class="close-editor" @click="$emit('close')" />
    </div>
  `,
};

const passthroughStub = { template: "<div><slot /></div>" };
const PopoverAnchorStub = {
  name: "PopoverAnchor",
  props: ["reference"],
  template: `<div><slot /></div>`,
};
// deliberately not focusable: where the panel puts its opening focus depends on
// the markup reka renders around it, so those tests mount the real popover
const PopoverContentStub = {
  name: "PopoverContent",
  emits: ["interact-outside"],
  template: `<div><slot /></div>`,
};

function createPlayer(
  playerId: string,
  name: string,
  playbackState = PlaybackState.IDLE,
): Player {
  return {
    player_id: playerId,
    provider: "test",
    type: PlayerType.PLAYER,
    name,
    available: true,
    device_info: {
      model: "Test",
      manufacturer: "Test",
      software_version: null,
      model_id: null,
      manufacturer_id: null,
      identifiers: {
        [IdentifierType.MAC_ADDRESS]: "",
        [IdentifierType.SERIAL_NUMBER]: "",
        [IdentifierType.UUID]: "",
        [IdentifierType.IP_ADDRESS]: "",
        [IdentifierType.UNKNOWN]: "",
      },
    },
    supported_features: [],
    can_group_with: [],
    enabled: true,
    playback_state: playbackState,
    powered: true,
    volume_level: 25,
    volume_muted: false,
    group_members: [],
    static_group_members: [],
    source_list: [],
    sound_mode_list: [],
    options: [],
    group_volume: null,
    group_volume_muted: null,
    hide_in_ui: false,
    private: false,
    icon: "speaker",
    power_control: "power",
    volume_control: "volume",
    mute_control: "mute",
    needs_setup: false,
    has_setup_flow: false,
    output_protocols: [],
    active_output_protocol: null,
    elapsed_time: null,
    elapsed_time_last_updated: null,
    current_media: null,
    active_source: null,
    active_sound_mode: null,
    active_group: null,
    synced_to: null,
    sleep_timer_expires_at: null,
    active_source_audio: null,
  };
}

// enough players for the panel to show its search field
function manyPlayers(): Record<string, Player> {
  return Object.fromEntries(
    Array.from({ length: 11 }, (_, index) => {
      const player = createPlayer(`player-${index}`, `Player ${index}`);
      return [player.player_id, player];
    }),
  );
}

// resolves with the panel once reka has mounted it and settled its focus
function findOpenPanel() {
  return vi.waitFor(() => {
    const panel = document.body.querySelector(
      '[data-testid="player-select-sheet"]',
    );
    expect(panel).not.toBeNull();
    expect(panel!.contains(document.activeElement)).toBe(true);
    return panel!;
  });
}

function setPlayerSelectPreference(key: string, value: boolean | string) {
  if (!preferenceState.reactiveValues) {
    throw new Error("Preference mock is not initialized");
  }
  preferenceState.reactiveValues[key] = value;
}

function setActivePlayerPreference(value: string) {
  setPlayerSelectPreference("activePlayerId", value);
}

function mountPlayerSelect() {
  return mount(PlayerSelect, {
    global: {
      mocks: {
        $t: (key: string) => key,
      },
      stubs: {
        SpeakerList: SpeakerListStub,
        GroupEditor: GroupEditorStub,
        Popover: passthroughStub,
        PopoverAnchor: PopoverAnchorStub,
        PopoverContent: PopoverContentStub,
        Teleport: true,
      },
    },
  });
}

// the popover components render for real here, so the panel goes through
// reka-ui's own labelling rather than a stub that echoes whatever it is passed
function mountPlayerSelectWithPopover() {
  return mount(PlayerSelect, {
    global: {
      mocks: {
        $t: (key: string) => key,
      },
      stubs: {
        SpeakerList: SpeakerListStub,
        GroupEditor: GroupEditorStub,
      },
    },
  });
}

describe("PlayerSelect", () => {
  // the store and api mocks are module singletons, so a component left mounted
  // keeps reacting to the next test's state
  enableAutoUnmount(afterEach);

  beforeEach(() => {
    vi.clearAllMocks();
    hasScope.mockImplementation(() => true);
    isDashboardViewer = false;
    const preferenceValues = preferenceState.reactiveValues;
    if (preferenceValues) {
      for (const key of Object.keys(preferenceValues)) {
        delete preferenceValues[key];
      }
    }
    api.players = {};
    store.activePlayerId = undefined;
    store.companionPlayerId = undefined;
    store.dialogActive = false;
    store.isTouchscreen = false;
    store.mobileLayout = false;
    store.showFullscreenPlayer = false;
    store.showPlayersMenu = true;
    webPlayer.player_id = null;
  });

  it("waits for a remembered player instead of selecting the web player", async () => {
    const web = createPlayer("web", "This device");
    const remembered = createPlayer("remembered", "Living room");
    setActivePlayerPreference(remembered.player_id);
    webPlayer.player_id = web.player_id;
    api.players = {
      [web.player_id]: web,
    };

    mountPlayerSelect();
    expect(store.activePlayerId).toBeUndefined();

    api.players[remembered.player_id] = remembered;
    await nextTick();

    expect(store.activePlayerId).toBe(remembered.player_id);
  });

  it("waits for the built-in player when it is the remembered one", async () => {
    const builtin = createPlayer("builtin", "This device");
    const kitchen = createPlayer("kitchen", "Kitchen", PlaybackState.PLAYING);
    setActivePlayerPreference("<builtinplayer>");
    api.players = { [kitchen.player_id]: kitchen };

    mountPlayerSelect();
    expect(store.activePlayerId).toBeUndefined();

    api.players[builtin.player_id] = builtin;
    webPlayer.player_id = builtin.player_id;
    await nextTick();

    expect(store.activePlayerId).toBe(builtin.player_id);
  });

  it("falls back to the built-in player, then a playing one, then any", async () => {
    const attic = createPlayer("attic", "Attic");
    const kitchen = createPlayer("kitchen", "Kitchen", PlaybackState.PLAYING);
    const builtin = createPlayer("builtin", "This device");
    api.players = { [attic.player_id]: attic };

    mountPlayerSelect();
    expect(store.activePlayerId).toBe(attic.player_id);

    api.players[kitchen.player_id] = kitchen;
    store.activePlayerId = undefined;
    await nextTick();
    expect(store.activePlayerId).toBe(kitchen.player_id);

    api.players[builtin.player_id] = builtin;
    webPlayer.player_id = builtin.player_id;
    store.activePlayerId = undefined;
    await nextTick();
    expect(store.activePlayerId).toBe(builtin.player_id);
  });

  it("remembers a selected player but not an automatic one", async () => {
    const kitchen = createPlayer("kitchen", "Kitchen");
    const office = createPlayer("office", "Office");
    api.players = {
      [kitchen.player_id]: kitchen,
      [office.player_id]: office,
    };

    const wrapper = mountPlayerSelect();
    expect(store.activePlayerId).toBe(kitchen.player_id);
    expect(setPreference).not.toHaveBeenCalled();

    await wrapper
      .get('[data-player-id="office"] .select-player')
      .trigger("click");

    expect(setPreference).toHaveBeenCalledWith(
      "activePlayerId",
      office.player_id,
    );
  });

  it("remembers the built-in player as a device independent placeholder", async () => {
    const builtin = createPlayer("builtin", "This device");
    const kitchen = createPlayer("kitchen", "Kitchen");
    setActivePlayerPreference(kitchen.player_id);
    api.players = {
      [builtin.player_id]: builtin,
      [kitchen.player_id]: kitchen,
    };
    const wrapper = mountPlayerSelect();

    await wrapper
      .get('[data-player-id="builtin"] .select-player')
      .trigger("click");

    expect(setPreference).toHaveBeenCalledWith(
      "activePlayerId",
      "<builtinplayer>",
    );
  });

  it("remembers the player that was already selected automatically", async () => {
    const kitchen = createPlayer("kitchen", "Kitchen");
    api.players = { [kitchen.player_id]: kitchen };
    const wrapper = mountPlayerSelect();
    expect(store.activePlayerId).toBe(kitchen.player_id);

    await wrapper
      .get('[data-player-id="kitchen"] .select-player')
      .trigger("click");

    expect(setPreference).toHaveBeenCalledWith(
      "activePlayerId",
      kitchen.player_id,
    );
  });

  it("replaces a remembered built-in player id with the placeholder", async () => {
    const builtin = createPlayer("builtin", "This device");
    setActivePlayerPreference(builtin.player_id);
    api.players = { [builtin.player_id]: builtin };

    mountPlayerSelect();

    expect(store.activePlayerId).toBe(builtin.player_id);
    expect(setPreference).toHaveBeenCalledWith(
      "activePlayerId",
      "<builtinplayer>",
    );
  });

  it("hands an automatic pick over to the built-in player registering late", async () => {
    const attic = createPlayer("attic", "Attic");
    const builtin = createPlayer("builtin", "This device");
    api.players = { [attic.player_id]: attic };

    mountPlayerSelect();
    expect(store.activePlayerId).toBe(attic.player_id);

    api.players[builtin.player_id] = builtin;
    store.companionPlayerId = builtin.player_id;
    await nextTick();

    expect(store.activePlayerId).toBe(builtin.player_id);
    expect(setPreference).not.toHaveBeenCalled();
  });

  it("never auto-selects for a dashboard viewer", async () => {
    isDashboardViewer = true;
    const attic = createPlayer("attic", "Attic");
    const builtin = createPlayer("builtin", "This device");
    api.players = { [attic.player_id]: attic };

    mountPlayerSelect();
    // no automatic default: the hosting dashboard view pins the player
    expect(store.activePlayerId).toBeUndefined();

    // the display's own built-in player registering late is not picked either
    api.players[builtin.player_id] = builtin;
    store.companionPlayerId = builtin.player_id;
    await nextTick();
    expect(store.activePlayerId).toBeUndefined();

    // a view's pin is not persisted as the shared viewer user's choice
    store.activePlayerId = attic.player_id;
    await nextTick();
    expect(store.activePlayerId).toBe(attic.player_id);
    expect(setPreference).not.toHaveBeenCalled();
  });

  it("keeps the remembered player when it is unavailable at startup", () => {
    const kitchen = createPlayer("kitchen", "Kitchen");
    kitchen.available = false;
    const attic = createPlayer("attic", "Attic");
    setActivePlayerPreference(kitchen.player_id);
    api.players = {
      [kitchen.player_id]: kitchen,
      [attic.player_id]: attic,
    };

    mountPlayerSelect();

    expect(store.activePlayerId).toBe(attic.player_id);
    expect(setPreference).not.toHaveBeenCalled();
  });

  it("keeps a remembered player when the built-in one registers late", async () => {
    const kitchen = createPlayer("kitchen", "Kitchen");
    const builtin = createPlayer("builtin", "This device");
    setActivePlayerPreference(kitchen.player_id);
    api.players = { [kitchen.player_id]: kitchen };

    mountPlayerSelect();
    expect(store.activePlayerId).toBe(kitchen.player_id);

    api.players[builtin.player_id] = builtin;
    webPlayer.player_id = builtin.player_id;
    await nextTick();

    expect(store.activePlayerId).toBe(kitchen.player_id);
    expect(setPreference).not.toHaveBeenCalled();
  });

  it("selects a player and keeps the list open", async () => {
    const player = createPlayer("kitchen", "Kitchen");
    const other = createPlayer("attic", "Attic");
    api.players = { [player.player_id]: player, [other.player_id]: other };
    const wrapper = mountPlayerSelect();
    expect(store.activePlayerId).toBe(other.player_id);

    await wrapper
      .get('[data-player-id="kitchen"] .select-player')
      .trigger("click");

    expect(store.activePlayerId).toBe(player.player_id);
    // the "Active" label moves to the chosen room; the list stays
    expect(store.showPlayersMenu).toBe(true);
  });

  it("lists an audio input without ever selecting it", async () => {
    const source = createPlayer("turntable", "Turntable");
    source.type = PlayerType.SOURCE;
    api.players = { [source.player_id]: source };
    const wrapper = mountPlayerSelect();

    // listed for discoverability, but never auto-picked as the default player
    expect(wrapper.find('[data-player-id="turntable"]').exists()).toBe(true);
    expect(store.activePlayerId).toBeUndefined();

    await wrapper.find(".select-player").trigger("click");

    expect(store.activePlayerId).toBeUndefined();
  });

  it("starts setup instead of selecting a setup-required player", async () => {
    const player = createPlayer("kitchen", "Kitchen");
    player.available = false;
    player.needs_setup = true;
    api.players = { [player.player_id]: player };
    const wrapper = mountPlayerSelect();

    await wrapper.find(".select-player").trigger("click");

    expect(store.activePlayerId).toBeUndefined();
    expect(store.showPlayersMenu).toBe(false);
    expect(emitEvent).toHaveBeenCalledWith("setupFlowDialog", {
      kind: "player",
      playerId: player.player_id,
      onFlowEnded: expect.any(Function),
    });
  });

  it("leaves setup-required players out for a role that may not set them up", () => {
    hasScope.mockImplementation(
      (scope: Scope) => scope !== Scope.CONFIG_PLAYERS_WRITE,
    );
    const setupRequired = createPlayer("kitchen", "Kitchen");
    setupRequired.available = false;
    setupRequired.needs_setup = true;
    api.players = {
      kitchen: setupRequired,
      office: createPlayer("office", "Office"),
    };

    const wrapper = mountPlayerSelect();

    expect(
      wrapper
        .findAll(".player-card")
        .map((card) => card.attributes("data-player-id")),
    ).toEqual(["office"]);
  });

  it.each([
    { finished: true, selected: "kitchen" },
    { finished: false, selected: undefined },
  ])(
    "selects $selected when its setup flow reports finished=$finished",
    async ({ finished, selected }) => {
      const player = createPlayer("kitchen", "Kitchen");
      player.available = false;
      player.needs_setup = true;
      api.players = { [player.player_id]: player };
      const wrapper = mountPlayerSelect();

      await wrapper.find(".select-player").trigger("click");
      const event = emitEvent.mock.calls.at(-1)?.[1] as {
        onFlowEnded: (finished: boolean) => void;
      };
      event.onFlowEnded(finished);

      expect(store.activePlayerId).toBe(selected);
    },
  );

  it("remembers the player its setup flow finished on", async () => {
    const player = createPlayer("kitchen", "Kitchen");
    player.needs_setup = true;
    api.players = { [player.player_id]: player };
    const wrapper = mountPlayerSelect();

    await wrapper.find(".select-player").trigger("click");
    const event = emitEvent.mock.calls.at(-1)?.[1] as {
      onFlowEnded: (finished: boolean) => void;
    };
    event.onFlowEnded(true);

    expect(setPreference).toHaveBeenCalledWith(
      "activePlayerId",
      player.player_id,
    );
  });

  it("keeps the cards inside the list that scrolls", () => {
    api.players = {
      kitchen: createPlayer("kitchen", "Kitchen"),
      office: createPlayer("office", "Office"),
    };

    const scroller = mountPlayerSelect().get(".player-volume-scroller");

    expect(scroller.classes()).toContain("overflow-y-auto");
    expect(scroller.findAll(".player-card")).toHaveLength(2);
  });

  it("closes from the blurred backdrop", async () => {
    const player = createPlayer("kitchen", "Kitchen");
    api.players = { [player.player_id]: player };
    const wrapper = mountPlayerSelect();

    await wrapper.find(".player-select-backdrop").trigger("click");

    expect(store.showPlayersMenu).toBe(false);
  });

  it("names the panel for assistive tech", async () => {
    // reka-ui names a panel after its PopoverTrigger, and this popout is
    // anchored instead of triggered, so only a real mount shows the name lands
    const wrapper = mountPlayerSelectWithPopover();
    await nextTick();

    const panel = document.body.querySelector(
      '[data-testid="player-select-sheet"]',
    );
    expect(panel?.getAttribute("role")).toBe("dialog");
    expect(panel?.getAttribute("aria-label")).toBe("players");

    wrapper.unmount();
  });

  it("stops above the bottom navigation in mobile layout", () => {
    store.mobileLayout = true;

    const wrapper = mountPlayerSelect();

    expect(wrapper.find(".player-select-backdrop").classes()).toContain(
      "player-select-mobile-offset",
    );
    const sheet = wrapper.find('[data-testid="player-select-sheet"]');
    expect(sheet.classes()).toContain("player-select-popover");
    expect(sheet.attributes("align")).toBe("end");
    expect(wrapper.findComponent(PopoverAnchorStub).props("reference")).toBe(
      playerBarEndAnchor,
    );
  });

  it("pops out of the fullscreen player instead of behind it", () => {
    store.mobileLayout = true;
    store.showFullscreenPlayer = true;

    const wrapper = mountPlayerSelect();

    const backdrop = wrapper.find(".player-select-backdrop");
    expect(backdrop.classes()).toContain("player-select-fullscreen-backdrop");
    // the fullscreen offset replaces the layout ones instead of stacking on them
    expect(backdrop.classes()).not.toContain("player-select-mobile-offset");
    const sheet = wrapper.find('[data-testid="player-select-sheet"]');
    expect(sheet.classes()).toContain("player-select-popover-fullscreen");
    expect(sheet.attributes("align")).toBe("center");
    expect(wrapper.findComponent(PopoverAnchorStub).props("reference")).toBe(
      fullscreenPlayerSelectAnchor,
    );
  });

  // reka reports the opening focus on the wrapper it positions the panel with,
  // and that wrapper cannot hold focus, so only a real mount shows where focus
  // ends up. A touchscreen is the gate either way: a phone held sideways gets
  // the desktop layout and still raises a keyboard.
  it.each([true, false])(
    "focuses the panel instead of a control on touch (mobile layout: %s)",
    async (mobileLayout) => {
      store.isTouchscreen = true;
      store.mobileLayout = mobileLayout;
      api.players = manyPlayers();
      const wrapper = mountPlayerSelectWithPopover();

      const panel = await findOpenPanel();
      expect(document.activeElement).toBe(panel);

      wrapper.unmount();
    },
  );

  it("leaves the opening focus alone without a touchscreen", async () => {
    store.mobileLayout = true;
    api.players = manyPlayers();
    const wrapper = mountPlayerSelectWithPopover();

    const panel = await findOpenPanel();
    expect(document.activeElement).not.toBe(panel);
    expect(panel.contains(document.activeElement)).toBe(true);

    wrapper.unmount();
  });

  it("restores focus to the menu trigger after closing", async () => {
    store.showPlayersMenu = false;
    const wrapper = mountPlayerSelect();
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    trigger.focus();

    store.showPlayersMenu = true;
    await nextTick();
    await wrapper.find(".player-select-backdrop").trigger("click");
    await nextTick();

    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("uses a stable focus fallback when the trigger was removed", async () => {
    store.showPlayersMenu = false;
    const wrapper = mountPlayerSelect();
    const trigger = document.createElement("button");
    const fallback = document.createElement("button");
    fallback.id = "player-select-button";
    document.body.append(trigger, fallback);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    trigger.focus();

    store.showPlayersMenu = true;
    await nextTick();
    trigger.remove();
    await wrapper.find(".player-select-backdrop").trigger("click");
    await nextTick();

    expect(document.activeElement).toBe(fallback);
    fallback.remove();
  });

  it("does not restore focus after pointer interaction", async () => {
    store.showPlayersMenu = false;
    const wrapper = mountPlayerSelect();
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    trigger.focus();

    store.showPlayersMenu = true;
    await nextTick();
    await wrapper.find(".player-select-backdrop").trigger("click");
    await nextTick();

    expect(document.activeElement).not.toBe(trigger);
    trigger.remove();
  });

  it("handles Escape inside the sheet without reaching the page", async () => {
    const player = createPlayer("kitchen", "Kitchen");
    api.players = { [player.player_id]: player };
    const wrapper = mountPlayerSelect();

    await wrapper
      .find('[data-testid="player-select-sheet"]')
      .trigger("keydown", { key: "Escape" });

    expect(store.showPlayersMenu).toBe(false);
  });

  it("stays open while the context menu is active", () => {
    const player = createPlayer("kitchen", "Kitchen");
    api.players = { [player.player_id]: player };
    store.dialogActive = true;
    const wrapper = mountPlayerSelect();
    const event = new Event("pointerdown", { cancelable: true });

    wrapper
      .findComponent(PopoverContentStub)
      .vm.$emit("interact-outside", event);

    expect(event.defaultPrevented).toBe(true);
    expect(store.showPlayersMenu).toBe(true);
  });

  it("lets the player button close the open popover", () => {
    const player = createPlayer("kitchen", "Kitchen");
    api.players = { [player.player_id]: player };
    const wrapper = mountPlayerSelect();
    const trigger = document.createElement("button");
    trigger.id = "player-select-button";
    document.body.appendChild(trigger);
    const originalEvent = new Event("pointerdown");
    trigger.dispatchEvent(originalEvent);
    const event = new CustomEvent("interact-outside", {
      cancelable: true,
      detail: { originalEvent },
    });

    wrapper
      .findComponent(PopoverContentStub)
      .vm.$emit("interact-outside", event);

    expect(event.defaultPrevented).toBe(true);
    trigger.remove();
  });

  it("opens the group editor of the active player from the fullscreen player", async () => {
    const kitchen = createPlayer("kitchen", "Kitchen", PlaybackState.PLAYING);
    kitchen.can_group_with = ["attic"];
    api.players = {
      kitchen,
      attic: createPlayer("attic", "Attic"),
    };
    store.activePlayerId = kitchen.player_id;
    store.showFullscreenPlayer = true;
    store.showPlayersMenu = false;
    const wrapper = mountPlayerSelect();

    store.showPlayersMenu = true;
    await nextTick();

    expect(wrapper.get(".group-editor").attributes("data-leader-id")).toBe(
      "kitchen",
    );
    expect(wrapper.find(".speaker-list").exists()).toBe(false);
  });

  it("shows the speaker list when opened from the player bar", async () => {
    const kitchen = createPlayer("kitchen", "Kitchen", PlaybackState.PLAYING);
    kitchen.can_group_with = ["attic"];
    api.players = { kitchen };
    store.activePlayerId = kitchen.player_id;
    store.showPlayersMenu = false;
    const wrapper = mountPlayerSelect();

    store.showPlayersMenu = true;
    await nextTick();

    expect(wrapper.find(".group-editor").exists()).toBe(false);
    expect(wrapper.find(".speaker-list").exists()).toBe(true);
  });

  it("reads where the speakers are each time the list opens", async () => {
    store.showPlayersMenu = false;
    mountPlayerSelect();
    expect(refreshLocations).not.toHaveBeenCalled();

    store.showPlayersMenu = true;
    await nextTick();

    expect(refreshLocations).toHaveBeenCalledTimes(1);
  });

  it("opens a room's group editor in place of the list and steps back", async () => {
    const kitchen = createPlayer("kitchen", "Kitchen", PlaybackState.PLAYING);
    api.players = { kitchen };
    const wrapper = mountPlayerSelect();

    await wrapper.get(".open-group-editor").trigger("click");
    expect(wrapper.get(".group-editor").attributes("data-leader-id")).toBe(
      "kitchen",
    );
    expect(wrapper.text()).toContain("player_select.group_with");

    // Escape steps back to the list before it closes the panel
    await wrapper
      .find('[data-testid="player-select-sheet"]')
      .trigger("keydown", { key: "Escape" });
    expect(wrapper.find(".group-editor").exists()).toBe(false);
    expect(store.showPlayersMenu).toBe(true);

    await wrapper.get(".open-group-editor").trigger("click");
    await wrapper.get(".close-editor").trigger("click");
    expect(wrapper.find(".speaker-list").exists()).toBe(true);
  });

  it("lists grouped rooms too, so they can show greyed under their heading", () => {
    const kitchen = createPlayer("kitchen", "Kitchen");
    kitchen.group_members = ["kitchen", "dining"];
    const dining = createPlayer("dining", "Dining");
    dining.synced_to = "kitchen";
    api.players = { kitchen, dining };
    const wrapper = mountPlayerSelect();

    expect(
      wrapper
        .findAll(".player-card")
        .map((card) => card.attributes("data-player-id")),
    ).toEqual(["kitchen", "dining"]);
  });
});
