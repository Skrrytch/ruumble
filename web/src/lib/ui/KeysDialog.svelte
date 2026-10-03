<script lang="ts">
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import X from "@lucide/svelte/icons/x";
  import type { DeviceKey } from "@ruumble/protocol";
  import { relativeTime } from "../board/model.ts";
  import { locale, t } from "../i18n/index.svelte.ts";
  import { careErrorText, type RuumbleState } from "../state.svelte.ts";
  import Key from "./Key.svelte";

  // Key cabinet (ADR-0015): the own paired browsers for everyone, everyone else's for admins (Write on the root
  // channel). Revoking asks first; revoking this browser's key unpairs it.
  let { app }: { app: RuumbleState } = $props();

  let dialog: HTMLDialogElement;
  $effect(() => {
    dialog.showModal();
    return () => dialog.close();
  });

  const date = $derived(new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short", year: "numeric" }));
  const device = (k: DeviceKey) => k.device || t().keys.unknownDevice;
  /** "Just now" in the middle of a line */
  const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

  function revoke(k: DeviceKey, owner: string | null): void {
    const c = t().keys;
    const question = k.current ? c.confirmRevokeCurrent : owner ? c.confirmRevokeOther(device(k), owner) : c.confirmRevoke(device(k));
    if (confirm(question)) void app.revokeKey(k.id);
  }
</script>

{#snippet keyList(keys: DeviceKey[], owner: string | null)}
  <ul class="list">
    {#each keys as k (k.id)}
      <li>
        <span class="text">
          <span class="name">{device(k)}{#if k.current}<span class="badge">{t().keys.thisBrowser}</span>{/if}</span>
          <span class="details">{t().keys.paired(date.format(k.created))}{#if k.lastUsed !== null}{" · "}{t().keys.lastUsed(lower(relativeTime(k.lastUsed)))}{/if}</span>
        </span>
        <button type="button" class="icon" aria-label={t().keys.revoke(device(k))} title={t().keys.revoke(device(k))} disabled={app.keysBusy} onclick={() => revoke(k, owner)}><Trash2 size={16} /></button>
      </li>
    {/each}
  </ul>
{/snippet}

<dialog bind:this={dialog} aria-label={t().keys.cabinet} onclose={() => app.closeKeys()}>
  <header>
    <span class="symbol" aria-hidden="true"><Key size={22} /></span>
    <h2>{t().keys.cabinet}</h2>
    <button type="button" class="icon" aria-label={t().common.close} onclick={() => app.closeKeys()}><X size={18} /></button>
  </header>
  <div class="content">
    <p class="hint">{t().keys.intro}</p>
    {#if !app.keys}
      {#if app.keysError}<p class="error" role="alert">{careErrorText(app.keysError)}</p>{:else}<p class="hint">{t().keys.loading}</p>{/if}
    {:else}
      <section>
        <h3>{t().keys.mine}</h3>
        {#if app.keys.mine.length}{@render keyList(app.keys.mine, null)}{:else}<p class="hint">{t().keys.none}</p>{/if}
      </section>
      {#if app.keys.others}
        <section>
          <h3>{t().keys.others}</h3>
          {#if app.keys.others.length}
            {#each app.keys.others as holder (holder.name)}
              <h4>{holder.name}</h4>
              {@render keyList(holder.keys, holder.name)}
            {/each}
          {:else}
            <p class="hint">{t().keys.none}</p>
          {/if}
        </section>
      {/if}
      {#if app.keysError}<p class="error" role="alert">{careErrorText(app.keysError)}</p>{/if}
    {/if}
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
  h3 { margin: 0 0 6px; font-size: 14px; }
  h4 { margin: 8px 0 4px; font-size: 13px; }
  .symbol { display: inline-flex; }
  .content { padding: 12px 16px; overflow: auto; flex: 1; font-size: 14px; }
  section { padding: 12px 0 4px; }
  section + section { border-top: 1px solid var(--color-blue-100); margin-top: 8px; }
  p { margin: 0; }
  .hint { font-size: 13px; color: var(--color-blue-700); }
  .error { color: var(--color-alert); margin-top: 8px; }
  .list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--color-blue-100); border-radius: var(--radius-md); }
  .list li { display: flex; align-items: center; gap: 10px; padding: 6px 4px 6px 10px; }
  .list li + li { border-top: 1px solid var(--color-blue-100); }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .name { font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .badge { font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 8px; background: var(--color-blue-100); color: var(--color-blue-700); }
  .details { font-size: 13px; color: var(--color-blue-700); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  button { min-height: 36px; padding: 0 14px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-white); color: var(--color-navy); font-size: 14px; cursor: pointer; }
  button.primary { background: var(--color-navy); border-color: var(--color-navy); color: var(--color-white); font-weight: 700; }
  button.icon { border: 0; min-width: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .list button.icon { color: var(--color-alert); }
  button:disabled { opacity: 0.5; cursor: default; }
  button:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
</style>
