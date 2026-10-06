<script lang="ts">
  import Unplug from "@lucide/svelte/icons/unplug";
  import type { MockAdapter } from "./lib/adapter/mock.ts";
  import { FEW_ROOMS, ownPlace } from "./lib/model/building.ts";
  import type { RuumbleState } from "./lib/state.svelte.ts";
  import DebugPanel from "./lib/ui/DebugPanel.svelte";
  import FloorPlan from "./lib/ui/FloorPlan.svelte";
  import { t } from "./lib/i18n/index.svelte.ts";
  import { unlockAudioOnFirstUse } from "./lib/nudge.ts";
  import { shortcutOf } from "./lib/shortcuts.ts";
  import PairForm from "./lib/ui/PairForm.svelte";
  import PluginHelp from "./lib/ui/PluginHelp.svelte";
  import TopBar from "./lib/ui/TopBar.svelte";
  import BoardPanel from "./lib/ui/board/BoardPanel.svelte";
  import CareDialog from "./lib/ui/CareDialog.svelte";
  import KeysDialog from "./lib/ui/KeysDialog.svelte";
  import MaintenanceDialog from "./lib/ui/MaintenanceDialog.svelte";
  import BuildingOverview from "./lib/ui/overview/BuildingOverview.svelte";
  import ShortcutsDialog from "./lib/ui/ShortcutsDialog.svelte";
  import StatusDialog from "./lib/ui/StatusDialog.svelte";

  let { app, mock = null }: { app: RuumbleState; mock?: MockAdapter | null } = $props();

  const building = $derived(app.building);
  const floor = $derived(app.floor);
  // few rooms: the open board gets more width
  const fewRooms = $derived(
    app.boardOpen && !app.readonly && !!floor && !floor.lock && floor.rooms.length > 0 && floor.rooms.length <= FEW_ROOMS,
  );

  // the tab says where one is: "Let's talk · Ruumble"; without an own place just "Ruumble"
  $effect(() => {
    const place = building && app.snapshot ? ownPlace(building, app.snapshot) : null;
    document.title = place ? `${place.name} · Ruumble` : "Ruumble";
  });

  // a nudge plays a sound (ADR-0020); browsers allow that only after the page was used once
  $effect(() => unlockAudioOnFirstUse());

  // keyboard shortcuts (lib/shortcuts.ts): only in the building view; the board needs an own user
  function onkeydown(e: KeyboardEvent): void {
    if (!building || app.connection !== "connected") return;
    const shortcut = shortcutOf(e, !!document.querySelector("dialog[open]"));
    if (shortcut === "toggleBoard" && !app.readonly) {
      e.preventDefault();
      app.toggleBoard();
    } else if (shortcut === "status" && app.me) {
      e.preventDefault();
      void app.openStatus();
    } else if (shortcut === "help") {
      e.preventDefault();
      app.helpOpen = true;
    } else if (shortcut === "overview") {
      e.preventDefault();
      app.openOverview();
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="app">
  {#if app.connection === "unpaired"}
    <div class="screen" role="status">
      <Unplug size={40} />
      <strong>{t().screens.notPairedTitle}</strong>
      <span>{t().screens.notPairedText}</span>
      <PairForm {app} />
      <PluginHelp versions={app.versions} />
    </div>
  {:else if !building}
    <div class="screen" role="status">{t().screens.connecting}</div>
  {:else if !app.preview && (app.plugin === "disconnected" || !building.self)}
    <div class="screen" role="status">
      <Unplug size={40} />
      <strong>{t().common.mumbleOffline}</strong>
      <span>{t().screens.mumbleOfflineText(building.name)}</span>
      <PluginHelp versions={app.versions} />
    </div>
  {:else}
    <!-- top bar instead of an elevator column: the floor plan gets the full width -->
    <TopBar {app} {building} {floor} />

    <div class="plan" class:few={fewRooms}>
      {#if floor}
        <!-- also when vacant: if the user is on a locked floor, its notice appears there -->
        <FloorPlan
          {floor}
          readonly={app.readonly}
          pendingChannel={app.pendingChannel}
          talking={app.talking}
          onjoin={(id) => app.join(id)}
          boardOpen={app.boardOpen}
          boardUnseen={app.boardUnseen}
          ontoggleboard={() => app.toggleBoard()}
          ontend={(target) => app.openCare(target)}
          onnudge={(user) => void app.nudge(user)}
        />
      {:else}
        <div class="vacancy" role="status">
          <strong>{t().screens.vacancyTitle}</strong>
          <span>{t().screens.vacancyText}</span>
        </div>
      {/if}
      {#if app.boardOpen && !app.readonly}<BoardPanel {app} />{/if}
    </div>
    {#if app.care}<CareDialog {app} />{/if}
    {#if app.keysOpen}<KeysDialog {app} />{/if}
    {#if app.maintenanceOpen}<MaintenanceDialog {app} />{/if}
    {#if app.statusOpen}<StatusDialog {app} />{/if}
    {#if app.helpOpen}<ShortcutsDialog onclose={() => (app.helpOpen = false)} />{/if}
    {#if app.overviewOpen && building}<BuildingOverview {app} {building} />{/if}
  {/if}

  {#if app.connection === "reconnecting" && building}
    <div class="toast" role="status">{t().screens.reconnecting}</div>
  {:else if app.notice}
    <div class="toast" role="alert">
      {app.notice.text}
      <button type="button" aria-label={t().screens.dismissNotice} onclick={() => app.dismissNotice()}>×</button>
    </div>
  {/if}
</div>

{#if mock}<DebugPanel {mock} {app} />{/if}

<style>
  .app {
    /* the full window, scaled down to the minimum width and to the height where rooms still hold two rows of people;
       below that the page scrolls. The board measures against the width. */
    width: 100%; min-width: var(--app-min-width); height: 100vh;
    min-height: calc(16px + var(--topbar-height) + 12px + var(--plan-min-height) + 24px); padding: 16px 32px 24px;
    display: flex; flex-direction: column; gap: 12px; overflow: hidden; container-type: inline-size;
  }

  /* floor with 1–2 rooms: floor plan and board share the width */
  .plan.few :global(.floorplan), .plan.few :global(.board) { flex: 1 1 0; width: auto; min-width: 340px; }

  /* floor plan: walls = 4 px dark blue as gap */
  .app { --plan-min-height: calc(var(--room-min-top) + var(--corridor-height) + var(--room-min-bottom) + 4 * var(--wall)); }
  .plan {
    flex: 1 1 auto; min-height: var(--plan-min-height); padding: var(--wall); background: var(--color-navy);
    display: flex; gap: var(--wall);
  }
  .vacancy, .screen {
    flex-grow: 1; display: flex; flex-direction: column; justify-content: center; gap: 8px; padding: 40px;
    background: var(--color-white); font-size: 15px; color: var(--color-blue-700);
  }
  .vacancy strong, .screen strong { font-size: 20px; color: var(--color-navy); }
  .screen { align-items: center; text-align: center; color: var(--color-navy); }

  .toast {
    position: fixed; left: 50%; bottom: 32px; transform: translateX(-50%); display: flex; align-items: center; gap: 16px;
    padding: 12px 16px; border-radius: var(--radius-md); background: var(--color-navy); color: var(--color-white); font-size: 15px;
  }
  .toast button { border: 0; background: transparent; color: var(--color-white); font-size: 20px; cursor: pointer; min-width: 44px; min-height: 44px; }
</style>
