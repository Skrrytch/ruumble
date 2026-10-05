<script lang="ts">
  import X from "@lucide/svelte/icons/x";
  import { t } from "../i18n/index.svelte.ts";
  import { SHORTCUT_KEYS, type Shortcut } from "../shortcuts.ts";
  import { showModal } from "./modal.ts";

  // The keyboard shortcuts at a glance, opened with ? or from the user menu: the keys come from shortcuts.ts, so the
  // list cannot drift from what the keys do.
  let { onclose }: { onclose: () => void } = $props();

  let dialog: HTMLDialogElement;
  $effect(() => showModal(dialog, () => onclose()));
  const order: Shortcut[] = ["toggleBoard", "overview", "status", "help"];
</script>

<dialog bind:this={dialog} class="shortcuts" aria-labelledby="shortcuts-title">
  <header>
    <h2 id="shortcuts-title">{t().shortcuts.title}</h2>
    <button type="button" class="close" aria-label={t().common.close} title={t().common.close} onclick={onclose}><X size={18} /></button>
  </header>
  <dl>
    {#each order as s (s)}
      <dt><kbd>{SHORTCUT_KEYS[s].toUpperCase()}</kbd></dt>
      <dd>{t().shortcuts[s]}</dd>
    {/each}
    <dt><kbd>Esc</kbd></dt>
    <dd>{t().shortcuts.escape}</dd>
  </dl>
  <p>{t().shortcuts.note}</p>
</dialog>

<style>
  .shortcuts { width: min(380px, calc(100vw - 32px)); padding: 0; border: 0; border-radius: var(--radius-md); color: var(--color-navy); background: var(--color-white); }
  .shortcuts::backdrop { background: rgb(0 56 105 / 0.45); }
  header { display: flex; align-items: center; justify-content: space-between; padding: 10px 10px 10px 20px; border-bottom: 1px solid var(--color-blue-100); }
  h2 { margin: 0; font-size: 17px; font-weight: 700; }
  .close { width: 36px; height: 36px; display: grid; place-items: center; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--color-navy); cursor: pointer; }
  .close:hover { background: var(--color-blue-100); }
  .close:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 10px 14px; align-items: center; margin: 0; padding: 16px 20px 8px; }
  dt { margin: 0; }
  dd { margin: 0; font-size: 14px; }
  kbd {
    display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; padding: 0 7px; border: 1px solid var(--color-blue-300);
    border-bottom-width: 3px; border-radius: 5px; background: var(--color-surface); font: inherit; font-size: 13px; font-weight: 700;
  }
  p { margin: 0; padding: 4px 20px 16px; font-size: 12px; color: var(--color-blue-700); }
</style>
