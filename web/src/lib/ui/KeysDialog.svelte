<script lang="ts">
  import type { DeviceKey } from "@ruumble/protocol";
  import { t } from "../i18n/index.svelte.ts";
  import { careErrorText, type RuumbleState } from "../state.svelte.ts";
  import CareShell, { type ConfirmRequest } from "./care/CareShell.svelte";
  import Key from "./Key.svelte";
  import KeyList, { deviceName } from "./KeyList.svelte";

  // My keys (ADR-0015), from the user menu: the own paired browsers, each revocable after confirming. Everyone
  // else's keys are in the building maintenance. Revoking this browser's key unpairs it.
  let { app }: { app: RuumbleState } = $props();

  let confirm = $state<ConfirmRequest | null>(null);
  function revoke(key: DeviceKey): void {
    const c = t().keys;
    const device = deviceName(key.device);
    confirm = { title: c.revokeTitle(device), detail: key.current ? c.revokeDetailCurrent : c.revokeDetail, confirmLabel: c.revokeConfirm, tone: "danger", run: () => app.revokeKey(key.id) };
  }
</script>

<CareShell
  title={t().keys.myKeys}
  level="keys"
  onclose={() => app.closeKeys()}
  houseRule={t().keys.rule}
  status={app.keys && app.keysError ? { text: careErrorText(app.keysError), error: true } : null}
  {confirm}
  oncancelconfirm={() => (confirm = null)}
>
  {#snippet glyph()}<Key size={34} />{/snippet}
  <p class="intro">{t().keys.intro}</p>
  {#if !app.keys}
    {#if app.keysError}<p class="error" role="alert">{careErrorText(app.keysError)}</p>{:else}<p class="intro">{t().keys.loading}</p>{/if}
  {:else if app.keys.mine.length}
    <div class:faded={!!confirm}><KeyList keys={app.keys.mine} busy={app.keysBusy} onrevoke={revoke} /></div>
  {:else}
    <p class="intro">{t().keys.none}</p>
  {/if}
</CareShell>

<style>
  .intro { margin: 0; font-size: 13px; color: var(--muted); }
  .error { margin: 0; color: var(--danger); }
</style>
