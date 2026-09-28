<script lang="ts">
  import { FIXTURES, type FixtureName, type MockAdapter } from "../adapter/mock.ts";
  import type { RuumbleState } from "../state.svelte.ts";

  // Nur mit ?debug: spielt alle Fälle aus PLANUNG Abschnitt 2 gegen den Mock durch.
  let { mock, app }: { mock: MockAdapter; app: RuumbleState } = $props();
  let fixture = $state<FixtureName>((new URLSearchParams(location.search).get("fixture") as FixtureName) ?? "musterhaus");
  let open = $state(true);
</script>

<aside class="debug" aria-label="Debug-Panel (Mock)">
  <button type="button" class="toggle" onclick={() => (open = !open)}>{open ? "Debug ▾" : "Debug ▸"}</button>
  {#if open}
    <label>
      Fixture
      <select bind:value={fixture} onchange={() => mock.setFixture(fixture)}>
        {#each Object.keys(FIXTURES) as name (name)}<option value={name}>{name}</option>{/each}
      </select>
    </label>
    <button type="button" onclick={() => mock.setPlugin(app.plugin === "connected" ? "disconnected" : "connected")}>
      Plugin {app.plugin === "connected" ? "trennen" : "verbinden"}
    </button>
    <button type="button" disabled={!app.floor?.rooms[0]} onclick={() => mock.addSubchannel(app.floor!.rooms[0]!.channelId)}>
      Unterkanal im 1. Raum anlegen
    </button>
    <button type="button" onclick={() => mock.removeTemporaryChannels()}>Neue Unterkanäle entfernen</button>
    <button type="button" onclick={() => mock.moveRandomUser()}>Jemanden verschieben</button>
    <button type="button" onclick={() => mock.rejectNextJoin()}>Nächsten Wechsel ablehnen</button>
  {/if}
</aside>

<style>
  .debug {
    position: fixed; right: 12px; bottom: 12px; display: flex; flex-direction: column; gap: 6px; padding: 10px;
    background: var(--color-white); border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); font-size: 12px; z-index: 10;
  }
  .debug button, .debug select { font-size: 12px; padding: 4px 8px; }
  label { display: flex; gap: 6px; align-items: center; }
  .toggle { align-self: flex-end; }
</style>
