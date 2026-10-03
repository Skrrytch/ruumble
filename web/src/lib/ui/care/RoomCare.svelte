<script lang="ts">
  import type { RoomCare } from "@ruumble/protocol";
  import { formatSize, relativeTime } from "../../board/model.ts";
  import { t } from "../../i18n/index.svelte.ts";
  import type { RuumbleState } from "../../state.svelte.ts";
  import type { ConfirmRequest } from "./CareShell.svelte";
  import Icon from "./Icon.svelte";

  // room care: what the board holds, deleting posts older than a choice, export and clearing the whole board
  let { app, room, ask, confirming }: { app: RuumbleState; room: RoomCare; ask: (key: string, request: ConfirmRequest) => void; confirming: string | null } = $props();

  let days = $state<number | null>(null);
  const choice = $derived(room.olderThan.find((o) => o.days === days && o.posts > 0) ?? null);

  function prune(): void {
    if (!choice) return;
    const c = t().care;
    ask("prune", {
      title: c.confirmPruneTitle(c.posts(choice.posts)),
      detail: c.confirmPruneDetail(c.ageChoice(choice.days), room.name),
      confirmLabel: c.deleteForever,
      tone: "danger",
      run: async () => {
        if (await app.pruneRoom(choice.days)) days = null;
      },
    });
  }

  function clear(): void {
    const c = t().care;
    ask("clear", {
      title: c.confirmClearTitle(room.posts),
      detail: c.confirmClearDetail(room.name),
      confirmLabel: c.deleteForever,
      tone: "danger",
      run: () => app.clearRoom(),
    });
  }

  const stats = $derived([
    { label: t().care.statPosts, value: String(room.posts), large: true },
    { label: t().care.statAttachments, value: room.bytes ? formatSize(room.bytes) : "–", large: true },
    { label: t().care.statNewest, value: room.newest === null ? "–" : relativeTime(room.newest), large: false },
    { label: t().care.statOldest, value: room.oldest === null ? "–" : relativeTime(room.oldest), large: false },
  ]);
</script>

<section class="stats" aria-label={t().care.statsLabel} class:faded={!!confirming}>
  {#each stats as s (s.label)}
    <div class="stat"><div class="label">{s.label}</div><div class="value" class:large={s.large}>{s.value}</div></div>
  {/each}
</section>

<div class="columns">
  <section class:faded={!!confirming && confirming !== "prune"}>
    <h3>{t().care.cleanUp}</h3>
    <fieldset>
      <legend>{t().care.ageLegend}</legend>
      <div class="ages">
        {#each room.olderThan as o (o.days)}
          {@const disabled = o.posts === 0}
          <label class="age" class:chosen={days === o.days && !disabled} class:danger={confirming === "prune" && days === o.days} class:disabled>
            <input type="radio" name="care-age" value={o.days} {disabled} checked={days === o.days} onchange={() => (days = o.days)} />
            <span class="age-label">{t().care.ageChoice(o.days)}</span>
            <span class="age-count">{o.posts}</span>
          </label>
        {/each}
      </div>
    </fieldset>
    <button type="button" class="btn danger" disabled={app.careBusy || !choice} onclick={prune}><Icon name="trash" />{t().care.pruneButton(choice ? choice.posts : null)}</button>
  </section>

  <section class:faded={!!confirming && confirming !== "clear"}>
    <h3>{t().care.wholeBoard}</h3>
    <div class="stack">
      <button type="button" class="btn secondary wide" disabled={app.careBusy || room.posts === 0} onclick={() => app.exportRoom()}><Icon name="download" color="var(--accent)" />{t().care.exportZip}</button>
      <button type="button" class="btn danger wide" disabled={app.careBusy || room.posts === 0} onclick={clear}><Icon name="trash" />{t().care.clearButton}</button>
    </div>
    <p class="small">{t().care.zipHint}</p>
  </section>
</div>

<style>
  .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); padding: 10px 0; background: var(--surface); border-radius: 4px; }
  .stat { padding: 0 16px; min-width: 0; }
  .stat + .stat { border-left: 1px solid var(--line); }
  .label { font-size: 12px; color: var(--muted); }
  .value { font-size: 15px; font-weight: 700; line-height: 1.3; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .value.large { font-size: 18px; margin-top: 0; font-variant-numeric: tabular-nums; }
  .columns { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 24px; align-items: start; }
  fieldset { margin: 0 0 10px; padding: 0; border: 0; }
  legend { padding: 0; margin-bottom: 6px; font-size: 13px; color: var(--muted); }
  .ages { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
  .age { position: relative; display: block; padding: 6px 8px; border: 1px solid var(--control); border-radius: 4px; cursor: pointer; transition: border-color 150ms ease-out, background 150ms ease-out; }
  .age input { position: absolute; opacity: 0; width: 1px; height: 1px; }
  .age-label { display: block; font-weight: 700; font-size: 13px; white-space: nowrap; }
  .age-count { display: block; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .age.chosen { padding: 5px 7px; border: 2px solid var(--ink); background: var(--tint); }
  .age.chosen .age-count { color: var(--ink-2); }
  .age.danger { border-color: var(--danger); background: var(--danger-tint); }
  .age.danger .age-count { color: var(--danger); }
  .age.disabled { border: 1px dashed var(--line); background: var(--surface); color: var(--disabled); cursor: default; }
  .age.disabled .age-count { color: var(--disabled); }
  .stack { display: flex; flex-direction: column; gap: 8px; }
  .wide { width: 100%; justify-content: flex-start; }
</style>
