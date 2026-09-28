<script lang="ts">
  import Unplug from "@lucide/svelte/icons/unplug";
  import type { MockAdapter } from "./lib/adapter/mock.ts";
  import { FEW_ROOMS, countText } from "./lib/model/building.ts";
  import type { RuumbleState } from "./lib/state.svelte.ts";
  import Core from "./lib/ui/Core.svelte";
  import DebugPanel from "./lib/ui/DebugPanel.svelte";
  import FloorPlan from "./lib/ui/FloorPlan.svelte";
  import PluginHelp from "./lib/ui/PluginHelp.svelte";
  import BoardPanel from "./lib/ui/board/BoardPanel.svelte";

  let { app, mock = null }: { app: RuumbleState; mock?: MockAdapter | null } = $props();

  const building = $derived(app.building);
  const floor = $derived(app.floor);
  // wenige Räume: die offene Pinnwand bekommt mehr Breite
  const fewRooms = $derived(
    app.boardOpen && !app.readonly && !!floor && !floor.lock && floor.rooms.length > 0 && floor.rooms.length <= FEW_ROOMS,
  );
  const summary = $derived.by(() => {
    if (!floor) return "";
    if (floor.lock) return "Diese Etage ist hier nicht darstellbar";
    const people = floor.population === 0 ? "Niemand" : countText(floor.population);
    return floor.rooms.length ? `${people} auf dieser Etage · ${floor.rooms.length} Räume` : `${people} auf dieser Etage`;
  });
  const hidden = $derived(building?.self?.kind === "hidden");
</script>

<div class="app">
  {#if app.connection === "unpaired"}
    <div class="screen" role="status">
      <Unplug size={40} />
      <strong>Dieses Gerät ist noch nicht gekoppelt.</strong>
      <span>Starte Mumble mit aktiviertem Ruumble-Plugin. Beim ersten Verbinden öffnet das Plugin diese Seite mit einem Kopplungslink.</span>
      <PluginHelp />
    </div>
  {:else if !building}
    <div class="screen" role="status">Verbinde …</div>
  {:else if !app.preview && (app.plugin === "disconnected" || !building.self)}
    <div class="screen" role="status">
      <Unplug size={40} />
      <strong>Mumble ist nicht verbunden.</strong>
      <span>Starte Mumble mit aktiviertem Ruumble-Plugin und verbinde dich mit dem Server {building.name}.</span>
      <PluginHelp />
    </div>
  {:else}
    <header class="head">
      <div>
        <div class="kicker">{floor?.level ?? building.name}</div>
        <h1>{floor?.name ?? "Leerstand"}</h1>
        {#if app.readonly}<div class="preview-note">Vorschau – nur lesend, ohne eigenen Nutzer</div>{/if}
        <div class="summary">
          {#if floor}{summary}{:else}Keine Etage dieses Gebäudes ist darstellbar{/if}
          {#if hidden}<span class="hidden-note"> · Du bist in einem Bereich, der hier nicht darstellbar ist.</span>{/if}
        </div>
      </div>
      <div class="hint">
        {#if app.readonly}Kanalwechsel nur mit dem Ruumble-Plugin.{:else}Klick auf einen Raum wechselt den Kanal.<br />Die Pinnwand zeigt, was im aktuellen Raum hängt.{/if}<br />Etagenwechsel über den Aufzug · {building.online} online
      </div>
    </header>

    <div class="plan" class:few={fewRooms}>
      <Core {app} {building} {floor} />
      {#if floor}
        <!-- auch bei Leerstand: Steht der eigene Nutzer auf einer gesperrten Etage, erscheint dort deren Hinweis -->
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
          <strong>Leerstand</strong>
          <span>Keine Etage dieses Gebäudes lässt sich darstellen: Jede Etage ist tiefer als zwei Ebenen oder hat mehr als 8 Räume. Nutze die klassische Ansicht in Mumble.</span>
        </div>
      {/if}
      {#if app.boardOpen && !app.readonly}<BoardPanel {app} />{/if}
    </div>
  {/if}

  {#if app.connection === "reconnecting" && building}
    <div class="toast" role="status">Verbindung zum Ruumble-Dienst unterbrochen, verbinde neu …</div>
  {:else if app.notice}
    <div class="toast" role="alert">
      {app.notice.text}
      <button type="button" aria-label="Hinweis schließen" onclick={() => app.dismissNotice()}>×</button>
    </div>
  {/if}
</div>

{#if mock}<DebugPanel {mock} {app} />{/if}

<style>
  .app {
    width: min(1440px, 100%); height: 100vh; min-height: 720px; margin: 0 auto; padding: 32px 32px 24px;
    display: flex; flex-direction: column; gap: 20px; overflow: hidden;
  }
  .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
  .kicker { font-size: 15px; color: var(--color-blue-500); }
  h1 { margin: 0; font-size: 40px; line-height: 1.1; font-weight: 700; letter-spacing: -0.02em; }
  .summary { font-size: 15px; color: var(--color-blue-700); }
  .hidden-note { font-weight: 700; }
  .preview-note { font-size: 13px; font-weight: 700; color: var(--color-blue-500); }
  .hint { font-size: 13px; text-align: right; line-height: 1.5; color: var(--color-blue-700); }

  /* Etage mit 1–2 Räumen: Grundriss und Pinnwand teilen sich die Breite (SPEC 2) */
  .plan.few :global(.floorplan), .plan.few :global(.board) { flex: 1 1 0; width: auto; min-width: 340px; }

  /* Grundriss: Wände = 4 px Dunkelblau als Abstand (SPEC 2) */
  .plan {
    height: clamp(520px, calc(100vh - 230px), 670px); padding: var(--wall); background: var(--color-navy);
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
