<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
    >
      <button
        v-if="store.showPlayersMenu"
        type="button"
        :class="[
          'modal-backdrop player-select-backdrop fixed inset-x-0 top-0 z-[997]',
          popoutFromFullscreen
            ? 'player-select-fullscreen-backdrop'
            : store.mobileLayout
              ? 'player-select-mobile-offset'
              : 'player-select-desktop-offset',
        ]"
        :aria-label="$t('close')"
        @click="setMenuOpen(false)"
      ></button>
    </Transition>
  </Teleport>

  <Popover :open="store.showPlayersMenu" @update:open="setMenuOpen">
    <PopoverAnchor :reference="popoutAnchor" />
    <!-- reka-ui generates the panel id and only mounts the panel while it is
         open, so the buttons that open it announce it with
         aria-haspopup/aria-expanded rather than aria-controls. It also names the
         panel after a PopoverTrigger, which this popout has no use for, so the
         panel carries its own label. -->
    <PopoverContent
      data-player-panel
      data-testid="player-select-sheet"
      :aria-label="$t('players')"
      side="top"
      :align="popoutFromFullscreen ? 'center' : 'end'"
      :side-offset="PLAYER_BAR_POPOUT_GAP"
      :collision-padding="PLAYER_BAR_POPOUT_COLLISION_PADDING"
      :class="[
        'player-bar-popout player-select-popover flex flex-col gap-0 overflow-hidden p-0',
        popoutFromFullscreen && 'player-select-popover-fullscreen',
        store.mobileLayout
          ? 'w-[calc(100vw-2*var(--player-bar-popout-inset-x)-var(--device-inset-left)-var(--device-inset-right))]'
          : 'w-[400px] max-w-[calc(100vw-2*var(--player-bar-popout-inset-x)-var(--device-inset-left)-var(--device-inset-right))]',
      ]"
      @keydown="handleSheetKeydown"
      @close-auto-focus="preventAutoFocus"
      @open-auto-focus="preventOnScreenKeyboardOnOpen"
      @interact-outside="handleSheetInteractOutside"
    >
      <PanelDragHandle @dismiss="setMenuOpen(false)" />
      <div
        data-panel-drag-region
        class="flex min-h-10 items-center gap-1 px-4 pt-1 pb-2"
      >
        <Button
          v-if="editorLeader"
          variant="ghost"
          size="icon-sm"
          class="-ml-2"
          :aria-label="$t('player_select.back_to_players')"
          @click="closeGroupEditor"
        >
          <ArrowLeft class="size-5" />
        </Button>
        <h2 class="min-w-0 truncate text-lg font-semibold">
          {{ editorLeader ? editorTitle : $t("players") }}
        </h2>
        <p class="sr-only">{{ $t("tooltip.select_player") }}</p>
      </div>

      <div
        ref="playerList"
        class="player-volume-scroller min-h-0 flex-1 overflow-y-auto"
      >
        <GroupEditor
          v-if="editorLeader"
          :leader="editorLeader"
          @close="closeGroupEditor"
        />
        <SpeakerList
          v-else
          v-model:top-order="topOrder"
          :players="visiblePlayers"
          :active-id="store.activePlayerId"
          @select="selectPlayer"
          @open-group-editor="openGroupEditor"
        />
      </div>
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import PanelDragHandle from "@/components/PanelDragHandle.vue";
import GroupEditor from "@/components/speakers/GroupEditor.vue";
import SpeakerList from "@/components/speakers/SpeakerList.vue";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { useOrderedPlayers } from "@/composables/useOrderedPlayers";
import { useSpeakerList } from "@/composables/useSpeakerList";
import { useUserPreferences } from "@/composables/userPreferences";
import { preventOnScreenKeyboardOnOpen } from "@/helpers/dialog_focus";
import {
  PLAYER_BAR_POPOUT_COLLISION_PADDING,
  PLAYER_BAR_POPOUT_GAP,
  fullscreenPlayerSelectAnchor,
  playerBarEndAnchor,
} from "@/helpers/player_bar";
import {
  canEditPlayerGroup,
  getPlayerDisplayName,
  isBuiltinPlayer,
  isPlayerActive,
  isSelectablePlayer,
  playerVisible,
} from "@/helpers/players";
import { api } from "@/plugins/api";
import { PlayerType, Scope, type Player } from "@/plugins/api/interfaces";
import { authManager } from "@/plugins/auth";
import { eventbus } from "@/plugins/eventbus";
import { $t } from "@/plugins/i18n";
import { store } from "@/plugins/store";
import { webPlayer } from "@/plugins/web_player";
import { ArrowLeft } from "@lucide/vue";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";

// Stored instead of a built-in player id: those are unique per browser/app
// session, so they are meaningless on the next visit or on another device.
const BUILTIN_PLAYER_PREFERENCE = "<builtinplayer>";

const playerList = ref<HTMLElement>();
// The room whose group editor is open, in place of the speaker list.
const editorFor = ref<string>();
// Order of the playing rooms on top; kept while the panel is closed, so a
// room keeps its place when the list opens again.
const topOrder = ref<string[]>([]);
const { getPreference, setPreference } = useUserPreferences();
const {
  refresh: refreshSpeakerList,
  groupColour,
  onHandover,
} = useSpeakerList();
let stopFollowingHandovers: (() => void) | undefined;
let menuTrigger: HTMLElement | null = null;
let lastInteractionWasKeyboard = false;
let restoreFocusOnClose = false;
let autoSelectedPlayerId: string | undefined;

// PlayerSelect is the only surface that lists needs_setup players (a click here
// launches the setup flow, see selectPlayer), to a role that may set them up.
// It also lists capture-only audio inputs (informational rows, so the device
// stays discoverable).
const allowNeedsSetup = () => authManager.hasScope(Scope.CONFIG_PLAYERS_WRITE);
const orderedPlayers = useOrderedPlayers({
  allowNeedsSetup,
  allowSources: true,
  includePausedAsActive: true,
});

// Grouped rooms stay listed: they show greyed under their heading.
const visiblePlayers = computed(() =>
  Object.values(api.players).filter((player) =>
    playerVisible(player, true, allowNeedsSetup(), true),
  ),
);

const editorLeader = computed(() =>
  editorFor.value ? api.players[editorFor.value] : undefined,
);

// A group of rooms is named by its colour; a group player keeps its own name;
// a room on its own is about to become one.
const editorTitle = computed(() => {
  const leader = editorLeader.value;
  if (!leader) return "";
  const colour = groupColour(leader.player_id);
  if (colour && leader.type !== PlayerType.GROUP) return colour.name;
  if (leader.type === PlayerType.GROUP) return getPlayerDisplayName(leader);
  return $t("player_select.group_with", { name: getPlayerDisplayName(leader) });
});

// the fullscreen player covers the player bar, so the panel pops out of the
// player select button in there and stays on top of it
const popoutFromFullscreen = computed(() => store.showFullscreenPlayer);

const popoutAnchor = computed(() =>
  popoutFromFullscreen.value
    ? fullscreenPlayerSelectAnchor
    : playerBarEndAnchor,
);

watch(
  () => store.showPlayersMenu,
  (isOpen) => {
    if (isOpen) {
      restoreFocusOnClose = lastInteractionWasKeyboard;
      const activeElement = document.activeElement;
      menuTrigger =
        activeElement instanceof HTMLElement && activeElement !== document.body
          ? activeElement
          : null;
      void refreshSpeakerList();
      openActivePlayerGroupEditor();
      return;
    }
    resetPanelState();
    nextTick(() => {
      const focusTarget = menuTrigger?.isConnected
        ? menuTrigger
        : document.getElementById("player-select-button");
      if (restoreFocusOnClose) {
        focusTarget?.focus();
      } else {
        focusTarget?.blur();
      }
      menuTrigger = null;
    });
  },
);

// a leader that went away (removed, or disabled) takes its editor with it
watch(editorLeader, (leader) => {
  if (editorFor.value && !leader) editorFor.value = undefined;
});

watch(
  () => store.activePlayerId,
  (playerId) => {
    if (!playerId) return;
    // only a deliberate choice is remembered: persisting the automatic pick
    // would overwrite the player the user actually selected earlier
    if (playerId === autoSelectedPlayerId) return;
    autoSelectedPlayerId = undefined;
    rememberPlayer(playerId);
  },
);

watch(
  () => api.players,
  () => checkDefaultPlayer(),
  { deep: true },
);

watch([() => webPlayer.player_id, () => store.companionPlayerId], () => {
  checkDefaultPlayer();
  preferBuiltinPlayer();
});

onMounted(() => {
  document.addEventListener("keydown", markKeyboardInteraction, true);
  document.addEventListener("pointerdown", markPointerInteraction, true);
  // when a leader leaves its group, the group plays on under another room:
  // the editor and the player bar follow the group, not the room that left
  stopFollowingHandovers = onHandover((oldLeader, newLeader) => {
    if (editorFor.value === oldLeader) editorFor.value = newLeader;
    if (store.activePlayerId === oldLeader) activatePlayer(newLeader);
  });
  checkDefaultPlayer();
  if (store.showPlayersMenu) void refreshSpeakerList();
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", markKeyboardInteraction, true);
  document.removeEventListener("pointerdown", markPointerInteraction, true);
  stopFollowingHandovers?.();
});

function setMenuOpen(isOpen: boolean) {
  store.showPlayersMenu = isOpen;
}

function handleSheetKeydown(event: KeyboardEvent) {
  event.stopPropagation();
  if (event.key !== "Escape") return;
  // Escape steps back from the group editor to the list before closing
  if (editorFor.value) {
    closeGroupEditor();
  } else {
    setMenuOpen(false);
  }
}

function handleSheetInteractOutside(event: Event) {
  const originalEvent = (event as CustomEvent<{ originalEvent?: Event }>).detail
    ?.originalEvent;
  const target = originalEvent?.target;
  if (
    store.dialogActive ||
    (target instanceof Element &&
      target.closest(
        "#player-select-button, [data-slot='dropdown-menu-content']",
      ))
  ) {
    event.preventDefault();
  }
}

function preventAutoFocus(event: Event) {
  event.preventDefault();
}

function markKeyboardInteraction() {
  lastInteractionWasKeyboard = true;
}

function markPointerInteraction() {
  lastInteractionWasKeyboard = false;
}

function selectPlayer(player: Player) {
  if (player.needs_setup) {
    // a player that still needs setup can't be selected; launch its setup flow instead
    eventbus.emit("setupFlowDialog", {
      kind: "player",
      playerId: player.player_id,
      onFlowEnded: (finished) => {
        if (finished && player.type !== PlayerType.SOURCE) {
          activatePlayer(player.player_id);
        }
      },
    });
    store.showPlayersMenu = false;
    return;
  }
  // an audio input can't be a playback target; its card is informational
  if (player.type === PlayerType.SOURCE) return;
  // the list stays open: the "Active" label moves to the chosen room
  activatePlayer(player.player_id);
}

function activatePlayer(playerId: string) {
  // remember it here as well: picking the player that was already selected
  // automatically leaves store.activePlayerId untouched
  autoSelectedPlayerId = undefined;
  rememberPlayer(playerId);
  store.activePlayerId = playerId;
}

function openGroupEditor(player: Player) {
  editorFor.value = player.player_id;
  playerList.value?.scrollTo?.({ top: 0 });
}

function closeGroupEditor() {
  editorFor.value = undefined;
}

/**
 * Open the group editor of the active player when the panel is opened from
 * the fullscreen player, where changing the group is the only reason to open it.
 */
function openActivePlayerGroupEditor() {
  const player = store.activePlayer;
  if (!popoutFromFullscreen.value || !player || !canEditPlayerGroup(player))
    return;
  editorFor.value = player.player_id;
}

function resetPanelState() {
  editorFor.value = undefined;
}

function checkDefaultPlayer() {
  // dashboard viewers never pick players themselves; the hosting view pins one.
  if (authManager.isDashboardViewer()) return;
  if (store.activePlayer) return;
  const defaultPlayerId = selectDefaultPlayer();
  if (!defaultPlayerId) return;
  autoSelectedPlayerId = defaultPlayerId;
  store.activePlayerId = defaultPlayerId;
  // a built-in player id remembered before the placeholder existed only
  // resolves in the browser session that created it: store the placeholder
  if (getPreference<string>("activePlayerId").value === defaultPlayerId) {
    rememberPlayer(defaultPlayerId);
  }
}

/**
 * Hand an automatically picked player over to the built-in player of this
 * device, which only registers a moment after the app has started.
 */
function preferBuiltinPlayer() {
  // a display must never end up showing its own built-in player
  if (authManager.isDashboardViewer()) return;
  if (store.activePlayerId !== autoSelectedPlayerId) return;
  if (getPreference<string>("activePlayerId").value) return;
  const builtinPlayerId = selectBuiltinPlayer();
  if (!builtinPlayerId) return;
  autoSelectedPlayerId = builtinPlayerId;
  store.activePlayerId = builtinPlayerId;
}

function rememberPlayer(playerId: string) {
  // dashboard viewer preferences are shared by every dashboard session
  if (authManager.isDashboardViewer()) return;
  const player = api.players[playerId];
  if (!player) return;
  const rememberedPlayer = isBuiltinPlayer(player)
    ? BUILTIN_PLAYER_PREFERENCE
    : playerId;
  if (getPreference<string>("activePlayerId").value === rememberedPlayer)
    return;
  void setPreference("activePlayerId", rememberedPlayer);
}

function selectDefaultPlayer() {
  const lastPlayerId = getPreference<string>("activePlayerId").value;
  // both a remembered built-in player and a remembered player that is not known
  // (yet) register a moment after startup, so leave the selection empty until
  // they show up instead of settling for another player
  if (lastPlayerId === BUILTIN_PLAYER_PREFERENCE) return selectBuiltinPlayer();
  if (lastPlayerId) {
    if (!(lastPlayerId in api.players)) return;
    if (isSelectablePlayerId(lastPlayerId)) return lastPlayerId;
  }
  const builtinPlayerId = selectBuiltinPlayer();
  if (builtinPlayerId) return builtinPlayerId;
  const selectablePlayers = orderedPlayers.value.filter((player) =>
    isSelectablePlayerId(player.player_id),
  );
  return (selectablePlayers.find(isPlayerActive) ?? selectablePlayers[0])
    ?.player_id;
}

function selectBuiltinPlayer() {
  if (isSelectablePlayerId(webPlayer.player_id)) {
    return webPlayer.player_id;
  }
  if (isSelectablePlayerId(store.companionPlayerId)) {
    return store.companionPlayerId;
  }
}

function isSelectablePlayerId(playerId: string | null | undefined) {
  return !!playerId && isSelectablePlayer(api.players[playerId]);
}
</script>

<style>
.player-select-desktop-offset {
  bottom: var(--bottom-bars-height) !important;
}

.player-select-mobile-offset {
  bottom: var(--mobile-navigation-height) !important;
}

/* the paired class outweighs the equally-!important z-index utility the popover
   component carries */
.player-bar-popout.player-select-popover {
  z-index: 998 !important;
}

/* the fullscreen player is a dialog at z-index 9000, so both the panel and its
   backdrop have to clear it; each rule pairs up its class to outweigh the
   utility it overrides */
.player-select-backdrop.player-select-fullscreen-backdrop {
  bottom: 0 !important;
  z-index: 9001 !important;
}

.player-bar-popout.player-select-popover.player-select-popover-fullscreen {
  z-index: 9002 !important;
}

/* the fullscreen player covers the mobile player bar, so this popout has no
   floating bar to stay clear of */
:root[data-player-bar-overlay]
  .player-bar-popout.player-select-popover-fullscreen {
  padding-bottom: 0 !important;
}
</style>
