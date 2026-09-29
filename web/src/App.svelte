<script lang="ts">
  import Unplug from "@lucide/svelte/icons/unplug";
  import Users from "@lucide/svelte/icons/users";
  import type { MockAdapter } from "./lib/adapter/mock.ts";
  import { FEW_ROOMS, MAX_ROOMS } from "./lib/model/building.ts";
  import type { RuumbleState } from "./lib/state.svelte.ts";
  import Core from "./lib/ui/Core.svelte";
  import DebugPanel from "./lib/ui/DebugPanel.svelte";
  import FloorPlan from "./lib/ui/FloorPlan.svelte";
  import { t } from "./lib/i18n/index.svelte.ts";
  import PluginHelp from "./lib/ui/PluginHelp.svelte";
  import BoardPanel from "./lib/ui/board/BoardPanel.svelte";

  let { app, mock = null }: { app: RuumbleState; mock?: MockAdapter | null } = $props();

  const building = $derived(app.building);
  const floor = $derived(app.floor);
  // few rooms: the open board gets more width
  const fewRooms = $derived(
    app.boardOpen && !app.readonly && !!floor && !floor.lock && floor.rooms.length > 0 && floor.rooms.length <= FEW_ROOMS,
  );
  const hidden = $derived(building?.self?.kind === "hidden");
</script>

<div class="app">
  {#if app.connection === "unpaired"}
    <div class="screen" role="status">
      <Unplug size={40} />
      <strong>{t().screens.notPairedTitle}</strong>
      <span>{t().screens.notPairedText}</span>
      <PluginHelp />
    </div>
  {:else if !building}
    <div class="screen" role="status">{t().screens.connecting}</div>
  {:else if !app.preview && (app.plugin === "disconnected" || !building.self)}
    <div class="screen" role="status">
      <Unplug size={40} />
      <strong>{t().common.mumbleOffline}</strong>
      <span>{t().screens.mumbleOfflineText(building.name)}</span>
      <PluginHelp />
    </div>
  {:else}
    <!-- title bar, space-saving: the floor is marked in the elevator, here only name and numbers -->
    <header class="head">
      <div class="where">
        <h1>{floor?.name ?? t().screens.vacancyTitle}</h1>
        {#if app.readonly}<span class="note">{t().header.preview}</span>{/if}
        {#if hidden}<span class="note">{t().common.notShown}</span>{/if}
      </div>
      <div class="counts">
        {#if floor}
          <span class="count" title={t().header.onFloorTitle} aria-label={t().header.onFloorLabel(floor.population)}>
            <Users size={16} aria-hidden="true" />{floor.population}
          </span>
        {/if}
        <span class="count" title={t().header.onlineTitle}>
          <span class="dot" aria-hidden="true"></span>{t().header.online(building.online)}
        </span>
      </div>
    </header>

    <div class="plan" class:few={fewRooms}>
      <Core {app} {building} {floor} />
      {#if floor}
        <!-- also when vacant: if the user is on a locked floor, its notice appears there -->
        <FloorPlan
          {floor}
          readonly={app.readonly}
          pendingChannel={app.pendingChannel}
          talking={app.talking}
          onjoin={(id) => app.join(id)}
          boardOpen={app.boardOpen}
          ontoggleboard={() => app.toggleBoard()}
        />
      {:else}
        <div class="vacancy" role="status">
          <strong>{t().screens.vacancyTitle}</strong>
          <span>{t().screens.vacancyText(MAX_ROOMS)}</span>
        </div>
      {/if}
      {#if app.boardOpen && !app.readonly}<BoardPanel {app} />{/if}
    </div>
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
    width: min(1440px, 100%); height: 100vh; min-height: 640px; margin: 0 auto; padding: 16px 32px 24px;
    display: flex; flex-direction: column; gap: 12px; overflow: hidden;
  }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 40px; }
  .where { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
  h1 { margin: 0; font-size: 22px; line-height: 1.2; font-weight: 700; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .note { font-size: 13px; font-weight: 700; color: var(--color-blue-500); }
  .counts { display: flex; gap: 8px; flex-shrink: 0; }
  .count {
    display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 999px;
    background: var(--color-blue-100); color: var(--color-navy); font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums;
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-sky); box-shadow: 0 0 0 3px rgb(255 255 255 / 0.7); }

  /* floor with 1–2 rooms: floor plan and board share the width */
  .plan.few :global(.floorplan), .plan.few :global(.board) { flex: 1 1 0; width: auto; min-width: 340px; }

  /* floor plan: walls = 4 px dark blue as gap */
  .plan {
    flex: 1 1 auto; min-height: 520px; padding: var(--wall); background: var(--color-navy);
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
