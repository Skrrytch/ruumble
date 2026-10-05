<script lang="ts">
  import MessageSquareText from "@lucide/svelte/icons/message-square-text";
  import { STATUS_DEFAULT_MINUTES, STATUS_DURATIONS, STATUS_LIMITS } from "@ruumble/protocol";
  import { t } from "../i18n/index.svelte.ts";
  import { statusErrorText, type RuumbleState } from "../state.svelte.ts";
  import { expiryText } from "../status.ts";
  import CareShell from "./care/CareShell.svelte";

  // My status (B, ADR-0018), from the speech bubble in the top bar: a free text, an expiry (2 hours by default, or
  // never), set or cleared; below, the texts used last for a quick choice (they fill the field).
  let { app }: { app: RuumbleState } = $props();

  let input = $state<HTMLInputElement | null>(null);
  let text = $state("");
  /** "never" stands for no expiry: a select cannot hold null */
  let duration = $state(String(STATUS_DEFAULT_MINUTES));
  // the current text, once the service reported it, so it can be changed or set again with a new expiry
  let filled = false;
  $effect(() => {
    if (!app.status || filled) return;
    filled = true;
    text = app.status.current?.text ?? "";
    input?.focus();
  });
  const current = $derived(app.status?.current ?? null);
  const valid = $derived(text.trim().length > 0 && text.length <= STATUS_LIMITS.textChars);

  function submit(e: SubmitEvent): void {
    e.preventDefault();
    if (!valid || app.statusBusy) return;
    void app.saveStatus(text.trim(), duration === "never" ? null : Number(duration));
  }

  function use(recent: string): void {
    text = recent;
    input?.focus();
  }
</script>

<CareShell
  title={t().status.title}
  level="status"
  narrow
  onclose={() => app.closeStatus()}
  houseRule={t().status.rule}
  status={app.statusError && app.status ? { text: statusErrorText(app.statusError), error: true } : null}
>
  {#snippet glyph()}<span class="glyph"><MessageSquareText size={30} /></span>{/snippet}
  <p class="intro">{t().status.intro}</p>
  {#if !app.status}
    {#if app.statusError}<p class="error" role="alert">{statusErrorText(app.statusError)}</p>{:else}<p class="intro">{t().status.loading}</p>{/if}
  {:else}
    {#if current}
      <p class="now"><span class="caption">{t().status.now}</span><span class="text">{current.text}</span><span class="until">{expiryText(current.until)}</span></p>
    {/if}
    <form onsubmit={submit}>
      <div class="field grow">
        <label for="status-text">{t().status.label}</label>
        <input id="status-text" type="text" bind:this={input} bind:value={text} maxlength={STATUS_LIMITS.textChars} placeholder={t().status.placeholder} autocomplete="off" disabled={app.statusBusy} />
      </div>
      <div class="field">
        <label for="status-duration">{t().status.expires}</label>
        <select id="status-duration" bind:value={duration} disabled={app.statusBusy}>
          {#each STATUS_DURATIONS as minutes (minutes)}
            <option value={minutes === null ? "never" : String(minutes)}>{minutes === null ? t().status.never : t().status.after(minutes)}</option>
          {/each}
        </select>
      </div>
      <div class="row">
        <button type="submit" class="btn primary" disabled={!valid || app.statusBusy}>{t().status.set}</button>
        {#if current}
          <button type="button" class="btn danger" disabled={app.statusBusy} onclick={() => void app.saveStatus(null)}>{t().status.clear}</button>
        {/if}
      </div>
    </form>
    {#if app.status.recent.length}
      <section aria-labelledby="status-recent">
        <h3 id="status-recent">{t().status.recent}</h3>
        <ul class="recent">
          {#each app.status.recent as recent (recent)}
            <li><button type="button" class="chip" aria-label={t().status.use(recent)} disabled={app.statusBusy} onclick={() => use(recent)}>{recent}</button></li>
          {/each}
        </ul>
      </section>
    {/if}
  {/if}
</CareShell>

<style>
  .glyph { position: relative; display: inline-flex; color: var(--ink); }
  p { margin: 0; }
  .intro { font-size: 13px; color: var(--muted); }
  .error { color: var(--danger); }
  .now { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; padding: 10px 12px; border-radius: 4px; background: var(--tint); }
  .now .caption { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
  .now .text { font-weight: 700; overflow-wrap: anywhere; }
  .now .until { font-size: 13px; color: var(--muted); }
  form { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px 16px; }
  .field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .field.grow { flex: 1 1 100%; }
  label { font-size: 13px; font-weight: 700; }
  input, select { height: 40px; padding: 0 10px; border: 1px solid var(--control); border-radius: 4px; font: inherit; color: var(--ink); background: #fff; }
  input { width: 100%; box-sizing: border-box; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  section h3 { margin-bottom: 8px; }
  .recent { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
  .chip {
    max-width: 100%; min-height: 32px; padding: 4px 12px; border: 1px solid var(--control); border-radius: 16px; background: #fff;
    color: var(--ink); font: inherit; font-size: 13px; text-align: left; cursor: pointer; overflow-wrap: anywhere;
  }
  .chip:hover { background: var(--tint); }
  .chip:disabled { opacity: 0.45; cursor: default; }
</style>
