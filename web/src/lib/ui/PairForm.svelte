<script lang="ts">
  import KeyRound from "@lucide/svelte/icons/key-round";
  import { t } from "../i18n/index.svelte.ts";
  import type { RuumbleState } from "../state.svelte.ts";

  let { app }: { app: RuumbleState } = $props();

  const p = $derived(t().pairing);
  let code = $state("");
  const valid = $derived(/^\d{6}$/.test(code.replace(/[\s-]/g, "")));

  function submit(e: SubmitEvent): void {
    e.preventDefault();
    if (valid) void app.confirmPairing(code).then(() => (code = ""));
  }
</script>

<!-- Pairing further browsers, profiles and web apps with a code from the Mumble log (ADR-0012) -->
<section class="pair" aria-label={p.request}>
  {#if app.pairRequest}
    <form onsubmit={submit}>
      <label for="pair-code">{p.sent}</label>
      <div class="row">
        <input id="pair-code" bind:value={code} inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123 456" aria-label={p.codeLabel} />
        <button type="submit" class="primary" disabled={!valid || app.pairBusy}>{p.confirm}</button>
      </div>
      <button type="button" class="link" disabled={app.pairBusy} onclick={() => app.requestPairing()}>{p.again}</button>
    </form>
  {:else}
    <p>{p.intro}</p>
    <button type="button" class="primary" disabled={app.pairBusy} onclick={() => app.requestPairing()}>
      <KeyRound size={18} /> {p.request}
    </button>
  {/if}
  {#if app.pairError}<p class="error" role="alert">{p.errors[app.pairError]}</p>{/if}
</section>

<style>
  .pair { display: flex; flex-direction: column; align-items: center; gap: 10px; margin-top: 16px; max-width: 560px; font-size: 14px; color: var(--color-blue-700); }
  .pair p { margin: 0; }
  form { display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .row { display: flex; gap: 8px; }
  input {
    width: 9ch; min-height: 44px; padding: 0 12px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md);
    font: inherit; font-size: 20px; letter-spacing: 0.1em; text-align: center; color: var(--color-navy);
  }
  input:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
  .primary {
    display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 10px 16px; border: 0;
    border-radius: var(--radius-md); background: var(--color-navy); color: var(--color-white); font-weight: 700; cursor: pointer;
  }
  .primary:hover:not(:disabled) { background: var(--color-navy-light); }
  .primary:disabled { opacity: 0.5; cursor: default; }
  .primary:focus-visible, .link:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
  .link { min-height: 32px; border: 0; background: transparent; color: var(--color-navy); text-decoration: underline; cursor: pointer; }
  .error { color: var(--color-navy); font-weight: 700; }
</style>
