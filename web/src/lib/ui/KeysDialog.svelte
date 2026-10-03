<script lang="ts">
  import X from "@lucide/svelte/icons/x";
  import { t } from "../i18n/index.svelte.ts";
  import { careErrorText, type RuumbleState } from "../state.svelte.ts";
  import Key from "./Key.svelte";
  import KeyList from "./KeyList.svelte";

  // My keys (ADR-0015), from the user menu: the own paired browsers, each revocable. Everyone else's keys are in the
  // building maintenance for admins. Revoking this browser's key unpairs it.
  let { app }: { app: RuumbleState } = $props();

  let dialog: HTMLDialogElement;
  $effect(() => {
    dialog.showModal();
    return () => dialog.close();
  });
</script>

<dialog bind:this={dialog} aria-label={t().keys.myKeys} onclose={() => app.closeKeys()}>
  <header>
    <span class="symbol" aria-hidden="true"><Key size={22} /></span>
    <h2>{t().keys.myKeys}</h2>
    <button type="button" class="icon" aria-label={t().common.close} onclick={() => app.closeKeys()}><X size={18} /></button>
  </header>
  <div class="content">
    <p class="hint">{t().keys.intro}</p>
    {#if !app.keys}
      {#if app.keysError}<p class="error" role="alert">{careErrorText(app.keysError)}</p>{:else}<p class="hint">{t().keys.loading}</p>{/if}
    {:else if app.keys.mine.length}
      <KeyList keys={app.keys.mine} busy={app.keysBusy} onrevoke={(id) => app.revokeKey(id)} />
    {:else}
      <p class="hint">{t().keys.none}</p>
    {/if}
    {#if app.keys && app.keysError}<p class="error" role="alert">{careErrorText(app.keysError)}</p>{/if}
  </div>
  <footer>
    <button type="button" class="primary" onclick={() => app.closeKeys()}>{t().common.close}</button>
  </footer>
</dialog>

<style>
  dialog { width: min(520px, 92vw); max-height: 86vh; border: 0; border-radius: var(--radius-md); padding: 0; color: var(--color-navy); display: flex; flex-direction: column; }
  dialog::backdrop { background: rgb(0 56 105 / 0.45); }
  header, footer { display: flex; align-items: center; gap: 10px; padding: 12px 16px; }
  header { border-bottom: 1px solid var(--color-blue-100); }
  footer { border-top: 1px solid var(--color-blue-100); justify-content: flex-end; }
  h2 { flex: 1; margin: 0; font-size: 16px; }
  .symbol { display: inline-flex; }
  .content { padding: 12px 16px 16px; overflow: auto; flex: 1; font-size: 14px; display: flex; flex-direction: column; gap: 10px; }
  p { margin: 0; }
  .hint { font-size: 13px; color: var(--color-blue-700); }
  .error { color: var(--color-alert); }
  button { min-height: 36px; padding: 0 14px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-white); color: var(--color-navy); font-size: 14px; cursor: pointer; }
  button.primary { background: var(--color-navy); border-color: var(--color-navy); color: var(--color-white); font-weight: 700; }
  button.icon { border: 0; min-width: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
  button:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
</style>
