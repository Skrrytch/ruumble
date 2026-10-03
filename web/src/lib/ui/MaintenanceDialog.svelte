<script lang="ts">
  import { BuildingSettings, type DeviceKey } from "@ruumble/protocol";
  import { formatSize } from "../board/model.ts";
  import { t } from "../i18n/index.svelte.ts";
  import { careErrorText, type RuumbleState } from "../state.svelte.ts";
  import CareShell, { type ConfirmRequest } from "./care/CareShell.svelte";
  import KeyList, { deviceName } from "./KeyList.svelte";
  import Wrench from "./Wrench.svelte";

  // Building maintenance (ADR-0016), the wrench at the entrance, for admins: the settings that used to be fixed
  // (defaults come from the environment variables) and the keys of all other users (ADR-0015). Same frame as the
  // care dialogs; saving settings that make the next cleanup delete data and revoking a key ask first.
  let { app }: { app: RuumbleState } = $props();

  /** the form: a copy of the saved settings, taken over whenever the service reports new ones */
  let draft = $state<BuildingSettings | null>(null);
  $effect(() => {
    draft = app.maintenance ? { ...app.maintenance.settings } : null;
  });

  type NumberKey = "retentionDays" | "quotaMB" | "maxFileMB" | "graceDays";
  /** the input range, from the schema the service checks against */
  const range = (key: NumberKey) => BuildingSettings.shape[key];
  const fields: { key: NumberKey; unit: "days" | "mb" }[] = [
    { key: "retentionDays", unit: "days" },
    { key: "quotaMB", unit: "mb" },
    { key: "maxFileMB", unit: "mb" },
    { key: "graceDays", unit: "days" },
  ];
  const valid = $derived(!!draft && BuildingSettings.safeParse(draft).success);
  const saved = $derived(app.maintenance?.settings);
  const defaults = $derived(app.maintenance?.defaults);
  const changed = $derived(!!draft && !!saved && (Object.keys(saved) as (keyof BuildingSettings)[]).some((k) => draft![k] !== saved[k]));
  const atDefaults = $derived(!!draft && !!defaults && (Object.keys(defaults) as (keyof BuildingSettings)[]).every((k) => draft![k] === defaults[k]));
  // changes that make the next hourly cleanup delete data
  const shorterRetention = $derived(!!draft && !!saved && draft.retentionDays < saved.retentionDays);
  const quotaBelowUse = $derived(!!draft && !!app.maintenance && draft.quotaMB * 1024 * 1024 < app.maintenance.usedBytes);
  const shorterGrace = $derived(!!draft && !!saved && draft.graceDays < saved.graceDays);

  let confirm = $state<{ key: string; request: ConfirmRequest } | null>(null);

  function save(): void {
    if (!draft || !valid) return;
    const next = { ...draft };
    if (!shorterRetention && !quotaBelowUse && !shorterGrace) return void app.saveSettings(next);
    const m = t().maintenance;
    confirm = {
      key: "settings",
      request: { title: m.confirmSave, detail: [shorterRetention ? m.shorterRetention : "", quotaBelowUse ? m.quotaBelowUse : "", shorterGrace ? m.shorterGrace : ""].filter(Boolean).join(" "), confirmLabel: m.saveAnyway, tone: "danger", run: () => app.saveSettings(next) },
    };
  }

  function revoke(key: DeviceKey, owner: string): void {
    const c = t().keys;
    const device = deviceName(key.device);
    confirm = { key: "access", request: { title: c.revokeTitleOther(device, owner), detail: c.revokeDetail, confirmLabel: c.revokeConfirm, tone: "danger", run: () => app.revokeKey(key.id) } };
  }

  // a key list that failed to load shows its error in the Access section, a failed revoke here
  const status = $derived(app.maintenanceError ? { text: careErrorText(app.maintenanceError), error: true } : app.keysError && app.keys ? { text: careErrorText(app.keysError), error: true } : app.maintenanceMessage ? { text: app.maintenanceMessage, error: false } : null);
</script>

<CareShell
  title={t().maintenance.title}
  level="maintenance"
  onclose={() => app.closeMaintenance()}
  houseRule={t().maintenance.rule}
  status={app.maintenance ? status : null}
  confirm={confirm?.request ?? null}
  oncancelconfirm={() => (confirm = null)}
>
  {#snippet glyph()}<Wrench size={34} />{/snippet}
  {#if !draft || !defaults || !app.maintenance}
    {#if app.maintenanceError}<p class="error" role="alert">{careErrorText(app.maintenanceError)}</p>{:else}<p class="hint">{t().care.loading}</p>{/if}
  {:else}
    <div class="columns">
      <section class:faded={!!confirm && confirm.key !== "settings"}>
        <h3>{t().maintenance.settings}</h3>
        <p class="hint">{t().maintenance.settingsHint}</p>
        <div class="fields">
          {#each fields as f (f.key)}
            <div class="field">
              <label for={`setting-${f.key}`}>{t().maintenance.fields[f.key]}</label>
              <span class="input">
                <input id={`setting-${f.key}`} type="number" min={range(f.key).minValue} max={range(f.key).maxValue} step="1" bind:value={draft[f.key]} disabled={app.maintenanceBusy} />
                <span class="unit">{f.unit === "days" ? t().maintenance.days : "MB"}</span>
              </span>
              <span class="hint">{t().maintenance.defaultValue(String(defaults[f.key]))}{#if f.key === "quotaMB"}{" · "}{t().maintenance.used(formatSize(app.maintenance.usedBytes))}{/if}</span>
            </div>
          {/each}
        </div>
        <label class="check" for="setting-notifyNewPosts">
          <input id="setting-notifyNewPosts" type="checkbox" bind:checked={draft.notifyNewPosts} disabled={app.maintenanceBusy} />
          <span><span class="label">{t().maintenance.fields.notifyNewPosts}</span><span class="hint">{t().maintenance.notifyHint}</span></span>
        </label>
        {#if shorterRetention}<p class="warn">{t().maintenance.shorterRetention}</p>{/if}
        {#if quotaBelowUse}<p class="warn">{t().maintenance.quotaBelowUse}</p>{/if}
        {#if shorterGrace}<p class="warn">{t().maintenance.shorterGrace}</p>{/if}
        {#if !valid}<p class="warn">{t().maintenance.invalid}</p>{/if}
        <div class="row">
          <button type="button" class="btn primary" disabled={app.maintenanceBusy || !changed || !valid} onclick={save}>{t().common.save}</button>
          <button type="button" class="btn secondary" disabled={app.maintenanceBusy || atDefaults} onclick={() => (draft = { ...defaults })}>{t().maintenance.resetAll}</button>
        </div>
      </section>
      <section class:faded={!!confirm && confirm.key !== "access"}>
        <h3>{t().maintenance.access}</h3>
        <p class="hint">{t().maintenance.accessHint}</p>
        {#if !app.keys}
          {#if app.keysError}<p class="error" role="alert">{careErrorText(app.keysError)}</p>{:else}<p class="hint">{t().care.loading}</p>{/if}
        {:else if app.keys.others?.length}
          {#each app.keys.others as holder (holder.name)}
            <h4>{holder.name}</h4>
            <KeyList keys={holder.keys} busy={app.keysBusy} onrevoke={(k) => revoke(k, holder.name)} />
          {/each}
        {:else}
          <p class="hint">{t().keys.none}</p>
        {/if}
      </section>
    </div>
  {/if}
</CareShell>

<style>
  .columns { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 24px; align-items: start; }
  section { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  section h3 { margin: 0; }
  h4 { margin: 6px 0 0; font-size: 13px; font-weight: 700; }
  p { margin: 0; }
  .hint { font-size: 12px; color: var(--muted); }
  .warn { font-size: 12px; color: var(--danger); }
  .error { color: var(--danger); }
  .fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; }
  .field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .field label, .label { font-size: 13px; font-weight: 700; }
  .input { display: flex; align-items: center; gap: 6px; }
  input[type="number"] { width: 110px; height: 40px; padding: 0 8px; border: 1px solid var(--control); border-radius: 4px; font: inherit; color: var(--ink); font-variant-numeric: tabular-nums; }
  .unit { font-size: 13px; color: var(--muted); }
  .check { display: flex; align-items: flex-start; gap: 10px; margin-top: 4px; }
  .check > span { display: flex; flex-direction: column; gap: 2px; }
  .check input { width: 18px; height: 18px; margin-top: 2px; accent-color: var(--ink); }
  .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
</style>
