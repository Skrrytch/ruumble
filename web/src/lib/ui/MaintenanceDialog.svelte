<script lang="ts">
  import X from "@lucide/svelte/icons/x";
  import { MAX_FILE_MB, type BuildingSettings } from "@ruumble/protocol";
  import { formatSize } from "../board/model.ts";
  import { t } from "../i18n/index.svelte.ts";
  import { careErrorText, type RuumbleState } from "../state.svelte.ts";
  import KeyList from "./KeyList.svelte";
  import Wrench from "./Wrench.svelte";

  // Building maintenance (ADR-0016), the wrench at the entrance, for admins: the settings that used to be fixed
  // (defaults come from the environment variables) and the keys of all other users (ADR-0015).
  let { app }: { app: RuumbleState } = $props();

  let dialog: HTMLDialogElement;
  $effect(() => {
    dialog.showModal();
    return () => dialog.close();
  });

  /** the form: a copy of the saved settings, taken over whenever the service reports new ones */
  let draft = $state<BuildingSettings | null>(null);
  $effect(() => {
    draft = app.maintenance ? { ...app.maintenance.settings } : null;
  });

  const LIMITS = { retentionDays: [1, 3650], quotaMB: [10, 1024 * 1024], maxFileMB: [1, MAX_FILE_MB], graceDays: [0, 90] } as const;
  type NumberKey = keyof typeof LIMITS;
  const valid = $derived(!!draft && (Object.keys(LIMITS) as NumberKey[]).every((k) => Number.isInteger(draft![k]) && draft![k] >= LIMITS[k][0] && draft![k] <= LIMITS[k][1]));
  const saved = $derived(app.maintenance?.settings);
  const changed = $derived(!!draft && !!saved && (Object.keys(saved) as (keyof BuildingSettings)[]).some((k) => draft![k] !== saved[k]));
  const defaults = $derived(app.maintenance?.defaults);
  const atDefaults = $derived(!!draft && !!defaults && (Object.keys(defaults) as (keyof BuildingSettings)[]).every((k) => draft![k] === defaults[k]));
  // changes that make the next hourly cleanup delete data
  const shorterRetention = $derived(!!draft && !!saved && draft.retentionDays < saved.retentionDays);
  const quotaBelowUse = $derived(!!draft && !!app.maintenance && draft.quotaMB * 1024 * 1024 < app.maintenance.usedBytes);

  function save(): void {
    if (!draft || !valid) return;
    if ((shorterRetention || quotaBelowUse) && !confirm(t().maintenance.confirmSave)) return;
    void app.saveSettings({ ...draft });
  }

  const fields: { key: NumberKey; unit: "days" | "mb" }[] = [
    { key: "retentionDays", unit: "days" },
    { key: "quotaMB", unit: "mb" },
    { key: "maxFileMB", unit: "mb" },
    { key: "graceDays", unit: "days" },
  ];
</script>

<dialog bind:this={dialog} aria-label={t().maintenance.title} onclose={() => app.closeMaintenance()}>
  <header>
    <span class="symbol" aria-hidden="true"><Wrench size={22} /></span>
    <h2>{t().maintenance.title}</h2>
    <button type="button" class="icon" aria-label={t().common.close} onclick={() => app.closeMaintenance()}><X size={18} /></button>
  </header>
  <div class="content">
    {#if !draft || !defaults || !app.maintenance}
      {#if app.maintenanceError}<p class="error" role="alert">{careErrorText(app.maintenanceError)}</p>{:else}<p class="hint">{t().care.loading}</p>{/if}
    {:else}
      <section>
        <h3>{t().maintenance.settings}</h3>
        <p class="hint">{t().maintenance.settingsHint}</p>
        <div class="fields">
          {#each fields as f (f.key)}
            <label class="field" for={`setting-${f.key}`}>
              <span class="label">{t().maintenance.fields[f.key]}</span>
              <span class="input">
                <input id={`setting-${f.key}`} type="number" min={LIMITS[f.key][0]} max={LIMITS[f.key][1]} step="1" bind:value={draft[f.key]} disabled={app.maintenanceBusy} />
                <span class="unit">{f.unit === "days" ? t().maintenance.days : "MB"}</span>
              </span>
              <span class="hint">{t().maintenance.defaultValue(String(defaults[f.key]))}{#if f.key === "quotaMB"}{" · "}{t().maintenance.used(formatSize(app.maintenance.usedBytes))}{/if}</span>
            </label>
          {/each}
          <label class="check" for="setting-notifyNewPosts">
            <input id="setting-notifyNewPosts" type="checkbox" bind:checked={draft.notifyNewPosts} disabled={app.maintenanceBusy} />
            <span>
              <span class="label">{t().maintenance.fields.notifyNewPosts}</span>
              <span class="hint">{t().maintenance.notifyHint}</span>
            </span>
          </label>
        </div>
        {#if shorterRetention}<p class="warn">{t().maintenance.shorterRetention}</p>{/if}
        {#if quotaBelowUse}<p class="warn">{t().maintenance.quotaBelowUse}</p>{/if}
        {#if !valid}<p class="warn">{t().maintenance.invalid}</p>{/if}
        <div class="row">
          <button type="button" class="primary" disabled={app.maintenanceBusy || !changed || !valid} onclick={save}>{t().common.save}</button>
          <button type="button" disabled={app.maintenanceBusy || atDefaults} onclick={() => (draft = { ...defaults })}>{t().maintenance.resetAll}</button>
        </div>
        {#if app.maintenanceError}<p class="error" role="alert">{careErrorText(app.maintenanceError)}</p>{/if}
        {#if app.maintenanceMessage}<p class="done" role="status">{app.maintenanceMessage}</p>{/if}
      </section>
      <section>
        <h3>{t().maintenance.access}</h3>
        <p class="hint">{t().maintenance.accessHint}</p>
        {#if !app.keys}
          {#if app.keysError}<p class="error" role="alert">{careErrorText(app.keysError)}</p>{:else}<p class="hint">{t().care.loading}</p>{/if}
        {:else if app.keys.others?.length}
          {#each app.keys.others as holder (holder.name)}
            <h4>{holder.name}</h4>
            <KeyList keys={holder.keys} owner={holder.name} busy={app.keysBusy} onrevoke={(id) => app.revokeKey(id)} />
          {/each}
        {:else}
          <p class="hint">{t().keys.none}</p>
        {/if}
      </section>
    {/if}
  </div>
  <footer>
    <button type="button" class="primary" onclick={() => app.closeMaintenance()}>{t().common.close}</button>
  </footer>
</dialog>

<style>
  dialog { width: min(600px, 92vw); max-height: 86vh; border: 0; border-radius: var(--radius-md); padding: 0; color: var(--color-navy); display: flex; flex-direction: column; }
  dialog::backdrop { background: rgb(0 56 105 / 0.45); }
  header, footer { display: flex; align-items: center; gap: 10px; padding: 12px 16px; }
  header { border-bottom: 1px solid var(--color-blue-100); }
  footer { border-top: 1px solid var(--color-blue-100); justify-content: flex-end; }
  h2 { flex: 1; margin: 0; font-size: 16px; }
  h3 { margin: 0; font-size: 14px; }
  h4 { margin: 4px 0 0; font-size: 13px; }
  .symbol { display: inline-flex; }
  .content { padding: 4px 16px 12px; overflow: auto; flex: 1; font-size: 14px; }
  section { padding: 12px 0; display: flex; flex-direction: column; gap: 8px; }
  section + section { border-top: 1px solid var(--color-blue-100); }
  p { margin: 0; }
  .hint { font-size: 13px; color: var(--color-blue-700); }
  .warn { font-size: 13px; color: var(--color-alert); }
  .error { color: var(--color-alert); }
  .done { font-weight: 700; }
  .fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; }
  .field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .label { font-size: 13px; font-weight: 700; }
  .input { display: flex; align-items: center; gap: 6px; }
  input[type="number"] { width: 120px; min-height: 36px; padding: 0 8px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); font: inherit; font-size: 14px; color: var(--color-navy); font-variant-numeric: tabular-nums; }
  .unit { font-size: 13px; color: var(--color-blue-700); }
  .check { grid-column: 1 / -1; display: flex; align-items: flex-start; gap: 10px; }
  .check > span { display: flex; flex-direction: column; gap: 2px; }
  .check input { width: 18px; height: 18px; margin-top: 1px; accent-color: var(--color-navy); }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  button { min-height: 36px; padding: 0 14px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-white); color: var(--color-navy); font-size: 14px; cursor: pointer; }
  button.primary { background: var(--color-navy); border-color: var(--color-navy); color: var(--color-white); font-weight: 700; }
  button.icon { border: 0; min-width: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
  button:disabled { opacity: 0.5; cursor: default; }
  button:focus-visible, input:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
</style>
