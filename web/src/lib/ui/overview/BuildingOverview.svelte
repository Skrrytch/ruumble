<script lang="ts">
  import X from "@lucide/svelte/icons/x";
  import { t } from "../../i18n/index.svelte.ts";
  import type { Building } from "../../model/building.ts";
  import { buildDirectory } from "../../model/overview.ts";
  import type { RuumbleState } from "../../state.svelte.ts";
  import CrossSection from "./CrossSection.svelte";
  import Directory from "./Directory.svelte";

  // Building overview (ADR-0019), from the elevator's status bar or with H: the cross-section of the building on the
  // left, the directory board of the lobby on the right. Hovering a person on one side marks them on the other.
  let { app, building }: { app: RuumbleState; building: Building } = $props();

  let dialog: HTMLDialogElement;
  $effect(() => {
    dialog.showModal();
    dialog.querySelector<HTMLInputElement>("input[type=search]")?.focus(); // the search, ready for a name
    return () => dialog.close();
  });
  let highlight = $state<number | null>(null);
  const groups = $derived(app.snapshot ? buildDirectory(app.snapshot, building, app.avatarOptions) : []);
</script>

<dialog bind:this={dialog} class="overview" aria-labelledby="overview-title" onclose={() => app.closeOverview()}>
  <header>
    <h2 id="overview-title">{t().overview.title}</h2>
    <span class="count">{t().overview.inHouse(building.online)}</span>
    <button type="button" class="close" aria-label={t().common.close} title={t().common.close} onclick={() => app.closeOverview()}><X size={18} /></button>
  </header>
  <div class="body">
    <div class="section-pane">
      <CrossSection {building} readonly={app.readonly} pendingChannel={app.pendingChannel} {highlight} onhover={(s) => (highlight = s)} onvisit={(id) => app.visit(id)} onfloor={(f) => app.viewFloor(f)} />
    </div>
    <Directory {groups} floors={building.floors} {highlight} onhover={(s) => (highlight = s)} onvisit={(p) => app.visit(p.channelId)} onfloor={(f) => app.viewFloor(f)} />
  </div>
</dialog>

<style>
  .overview {
    width: min(1180px, calc(100vw - 32px)); height: min(820px, 92vh); padding: 0; border: 0; border-radius: var(--radius-md);
    color: var(--color-navy); background: var(--color-white); display: flex; flex-direction: column; overflow: hidden;
  }
  .overview::backdrop { background: rgb(0 56 105 / 0.45); }
  header { display: flex; align-items: center; gap: 12px; padding: 12px 12px 12px 20px; border-bottom: 1px solid var(--color-blue-100); flex: none; }
  h2 { margin: 0; font-size: 18px; font-weight: 700; }
  .count { font-size: 13px; color: var(--color-blue-700); font-variant-numeric: tabular-nums; }
  .close { margin-left: auto; width: 36px; height: 36px; display: grid; place-items: center; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--color-navy); cursor: pointer; }
  .close:hover { background: var(--color-blue-100); }
  .close:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
  .body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(300px, 1fr); gap: 20px; padding: 16px 20px 20px; }
  .section-pane { min-height: 0; overflow-y: auto; }
</style>
