<script lang="ts">
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import X from "@lucide/svelte/icons/x";
  import { formatSize, relativeTime } from "../board/model.ts";
  import { locale, t } from "../i18n/index.svelte.ts";
  import { careErrorText, type RuumbleState } from "../state.svelte.ts";
  import Plant from "./Plant.svelte";

  // Care of the stored data (ADR-0014), opened from a plant. Room care: the board (delete old posts, clear, export).
  // Floor care: its rooms, moving a board here, rooms that are gone. Building care: storage and floors, floors that
  // are gone, learned ticket links. A line of an overview opens the level below; "back" returns. Removals ask first.
  let { app }: { app: RuumbleState } = $props();

  let dialog: HTMLDialogElement;
  $effect(() => {
    dialog.showModal();
    return () => dialog.close();
  });

  const view = $derived(app.careView);
  const title = $derived.by(() => {
    const c = t().care;
    const target = app.care;
    if (!target || target.kind === "building") return c.buildingTitle;
    const name = view && view.kind !== "building" ? view.value.name : (app.snapshot?.channels.find((x) => x.id === target.channelId)?.name ?? "");
    return target.kind === "room" ? c.roomTitle(name) : c.floorTitle(name);
  });
  const date = $derived(new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short" }));
  const size = (bytes: number) => (bytes ? formatSize(bytes) : "");
  /** relative time in the middle of a line ("just now", not "Just now") */
  const ago = (time: number) => { const s = relativeTime(time); return s.charAt(0).toLowerCase() + s.slice(1); };

  /** the rows of floor or building care for what is gone: one line each */
  const rows = $derived.by(() => {
    const c = t().care;
    if (view?.kind === "floor") {
      return view.value.orphans.map((r) => ({
        id: r.channelId as number | null, name: r.name || c.unnamedRoom(r.channelId), posts: r.posts,
        details: [c.posts(r.posts), size(r.bytes), r.goneSince === null ? c.moved : c.goneSince(date.format(r.goneSince))],
      }));
    }
    if (view?.kind === "building") {
      return view.value.orphans.map((f) => ({
        id: f.channelId, name: f.channelId === null ? c.unknownFloor : f.name || c.unknownFloor, posts: f.posts,
        details: [c.rooms(f.rooms), c.posts(f.posts), size(f.bytes), f.goneSince === null ? "" : c.goneSince(date.format(f.goneSince))],
      }));
    }
    return [];
  });

  // room care: "older than" choice, preselected with the first that finds something
  let pruneDays = $state<number | null>(null);
  const pruneChoice = $derived(view?.kind === "room" ? (view.value.olderThan.find((o) => o.days === pruneDays) ?? view.value.olderThan.find((o) => o.posts > 0) ?? view.value.olderThan[0]) : undefined);

  // floor care: move a board here
  let transferFrom = $state("");
  let transferTo = $state("");

  function clear(): void {
    if (view?.kind !== "room" || !confirm(t().care.confirmClear(view.value.name, t().care.posts(view.value.posts)))) return;
    void app.clearRoom();
  }

  function prune(): void {
    const choice = pruneChoice;
    if (view?.kind !== "room" || !choice) return;
    const c = t().care;
    if (!confirm(c.confirmPrune(c.pruneChoice(choice.days), c.posts(choice.posts), view.value.name))) return;
    void app.pruneRoom(choice.days);
  }

  async function transfer(): Promise<void> {
    if (view?.kind !== "floor") return;
    const from = view.value.sources.find((s) => s.channelId === Number(transferFrom));
    const to = view.value.rooms.find((r) => r.channelId === Number(transferTo));
    if (!from || !to) return;
    const c = t().care;
    if (!confirm(c.confirmTransfer(from.name, to.name, c.posts(from.posts)))) return;
    if (await app.transferBoard(from.channelId, to.channelId)) transferFrom = "";
  }

  function remove(list: typeof rows): void {
    const posts = list.reduce((n, r) => n + r.posts, 0);
    const c = t().care;
    const what = list.length === 1 ? c.quote(list[0]!.name) : view?.kind === "building" ? c.floors(list.length) : c.rooms(list.length);
    if (!confirm(c.confirmRemove(what, c.posts(posts)))) return;
    void app.removeOrphans(list.map((r) => r.id));
  }
</script>

<dialog bind:this={dialog} class="care" aria-label={title} onclose={() => app.closeCare()}>
  <header>
    {#if app.careTrail.length}
      <button type="button" class="icon" aria-label={t().care.back} title={t().care.back} onclick={() => app.careBack()}><ArrowLeft size={18} /></button>
    {:else}
      <span class="plant" aria-hidden="true"><Plant size={22} /></span>
    {/if}
    <h2>{title}</h2>
    <button type="button" class="icon" aria-label={t().common.close} onclick={() => app.closeCare()}><X size={18} /></button>
  </header>
  <div class="content">
    {#if !view}
      {#if app.careError}<p class="error" role="alert">{careErrorText(app.careError)}</p>{:else}<p class="muted">{t().care.loading}</p>{/if}
    {:else if view.kind === "room"}
      {@const room = view.value}
      <section>
        <h3>{t().board.title}</h3>
        <p>{room.posts ? t().care.boardHolds(t().care.posts(room.posts), size(room.bytes)) : t().care.boardEmpty}</p>
        {#if room.newest !== null && room.oldest !== null}<p class="hint">{t().care.newest(ago(room.newest))} · {t().care.oldest(ago(room.oldest))}</p>{/if}
        <p class="hint">{t().care.retention(room.retentionDays)}</p>
      </section>
      <section>
        <h3>{t().care.cleanUp}</h3>
        <div class="row">
          <label>{t().care.pruneLabel}
            <select value={pruneChoice?.days} onchange={(e) => (pruneDays = Number(e.currentTarget.value))} disabled={app.careBusy || room.posts === 0}>
              {#each room.olderThan as o (o.days)}<option value={o.days}>{t().care.pruneOption(t().care.pruneChoice(o.days), o.posts)}</option>{/each}
            </select>
          </label>
          <button type="button" class="danger" disabled={app.careBusy || !pruneChoice?.posts} onclick={prune}>{t().care.prune}</button>
        </div>
        <div class="row clear">
          <button type="button" class="danger" disabled={app.careBusy || room.posts === 0} onclick={clear}>{t().care.clearBoard}</button>
        </div>
        <p class="hint">{t().care.clearBoardHint}</p>
      </section>
      <section>
        <h3>{t().care.export}</h3>
        <p class="hint">{t().care.exportHint}</p>
        <button type="button" disabled={app.careBusy || room.posts === 0} onclick={() => app.exportRoom()}>{t().care.exportButton}</button>
      </section>
    {:else if view.kind === "floor"}
      {@const floor = view.value}
      <section>
        <h3>{t().care.floorRooms}</h3>
        {#if floor.rooms.length}
          <ul class="list">
            {#each floor.rooms as r (r.channelId)}
              <li>
                <span class="name">{r.name}</span>
                <span class="details">{r.posts ? [t().care.posts(r.posts), size(r.bytes), r.newest === null ? "" : t().care.lastPost(ago(r.newest))].filter(Boolean).join(" · ") : t().care.empty}</span>
                <button type="button" class="icon" aria-label={t().care.roomPlant(r.name)} title={t().care.roomPlant(r.name)} onclick={() => app.openCare({ kind: "room", channelId: r.channelId }, true)}><ChevronRight size={18} /></button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted">{t().care.noRooms}</p>
        {/if}
      </section>
      {#if floor.rooms.length}
        <section>
          <h3>{t().care.transfer}</h3>
          {#if floor.sources.length}
            <div class="row transfer">
              <label>{t().care.transferFrom}
                <select bind:value={transferFrom} disabled={app.careBusy}>
                  <option value="">{t().care.chooseRoom}</option>
                  {#each floor.sources as s (s.channelId)}<option value={String(s.channelId)}>{t().care.transferSource(s.name, s.floorName, s.posts, s.gone)}</option>{/each}
                </select>
              </label>
              <label>{t().care.transferTo}
                <select bind:value={transferTo} disabled={app.careBusy}>
                  <option value="">{t().care.chooseRoom}</option>
                  {#each floor.rooms.filter((r) => String(r.channelId) !== transferFrom) as r (r.channelId)}<option value={String(r.channelId)}>{r.name}</option>{/each}
                </select>
              </label>
              <button type="button" disabled={app.careBusy || !transferFrom || !transferTo || transferFrom === transferTo} onclick={transfer}>{t().care.transferButton}</button>
            </div>
          {:else}
            <p class="muted">{t().care.noSources}</p>
          {/if}
          <p class="hint">{t().care.transferHint}</p>
        </section>
      {/if}
      {@render gone()}
    {:else}
      {@const building = view.value}
      {@const share = building.storage.quotaBytes ? Math.min(1, building.storage.usedBytes / building.storage.quotaBytes) : 0}
      <section>
        <h3>{t().care.storage}</h3>
        <p>{t().care.storageUsed(formatSize(building.storage.usedBytes), formatSize(building.storage.quotaBytes))}</p>
        <div class="bar" role="meter" aria-label={t().care.storageBar} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}><span style:width={`${share * 100}%`}></span></div>
        <p class="hint">{t().care.retention(building.storage.retentionDays)}</p>
        {#if building.floors.length}
          <ul class="list">
            {#each building.floors as f (f.channelId)}
              <li>
                <span class="name">{f.name}</span>
                <span class="details">{f.posts ? [t().care.rooms(f.rooms), t().care.posts(f.posts), size(f.bytes)].filter(Boolean).join(" · ") : t().care.empty}</span>
                <button type="button" class="icon" aria-label={t().care.floorPlant(f.name)} title={t().care.floorPlant(f.name)} onclick={() => app.openCare({ kind: "floor", channelId: f.channelId }, true)}><ChevronRight size={18} /></button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
      {@render gone()}
      <!-- learned ticket links are building-wide: one base URL per project, learned from every room -->
      {@const projects = Object.entries(building.tickets)}
      <section>
        <h3>{t().care.tickets}</h3>
        {#if projects.length}
          <ul class="list">
            {#each projects as [project, base] (project)}
              <li>
                <span class="name">{project}</span>
                <span class="details" title={base}>{base.replace(/^https?:\/\//, "")}</span>
                <button type="button" class="icon" aria-label={t().care.forgetTicket(project)} title={t().care.forgetTicket(project)} disabled={app.careBusy} onclick={() => app.forgetTickets([project])}><RotateCcw size={16} /></button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted">{t().care.noTickets}</p>
        {/if}
        <p class="hint">{t().care.ticketsHint}</p>
        {#if projects.length > 1}<button type="button" disabled={app.careBusy} onclick={() => app.forgetTickets(projects.map(([p]) => p))}>{t().care.forgetTickets}</button>{/if}
      </section>
    {/if}
    {#if view && app.careError}<p class="error" role="alert">{careErrorText(app.careError)}</p>{/if}
    {#if app.careMessage}<p class="done" role="status">{app.careMessage}</p>{/if}
  </div>
  <footer>
    <button type="button" class="primary" onclick={() => app.closeCare()}>{t().common.close}</button>
  </footer>
</dialog>

<!-- rooms (floor care) or floors (building care) that are gone -->
{#snippet gone()}
  <section>
    <h3>{view?.kind === "floor" ? t().care.orphanRooms : t().care.orphanFloors}</h3>
    {#if rows.length}
      <ul class="list gone">
        {#each rows as row (row.id)}
          <li>
            <span class="name">{row.name}</span>
            <span class="details">{row.details.filter(Boolean).join(" · ")}</span>
            <button type="button" class="icon" aria-label={t().care.remove(row.name)} title={t().care.remove(row.name)} disabled={app.careBusy} onclick={() => remove([row])}><Trash2 size={16} /></button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted">{view?.kind === "floor" ? t().care.noOrphanRooms : t().care.noOrphanFloors}</p>
    {/if}
    <p class="hint">{view?.kind === "floor" ? t().care.orphanRoomsHint : t().care.orphanFloorsHint}</p>
    {#if rows.length > 1}<button type="button" class="danger" disabled={app.careBusy} onclick={() => remove(rows)}>{t().care.removeAll}</button>{/if}
  </section>
{/snippet}

<style>
  dialog { width: min(600px, 92vw); max-height: 86vh; border: 0; border-radius: var(--radius-md); padding: 0; color: var(--color-navy); display: flex; flex-direction: column; }
  dialog::backdrop { background: rgb(0 56 105 / 0.45); }
  header, footer { display: flex; align-items: center; gap: 10px; padding: 12px 16px; }
  header { border-bottom: 1px solid var(--color-blue-100); }
  footer { border-top: 1px solid var(--color-blue-100); justify-content: flex-end; }
  h2 { flex: 1; margin: 0; font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  h3 { margin: 0 0 6px; font-size: 14px; }
  .plant { display: inline-flex; }
  .content { padding: 4px 16px 12px; overflow: auto; flex: 1; font-size: 14px; }
  section { padding: 12px 0; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
  section + section { border-top: 1px solid var(--color-blue-100); }
  p { margin: 0; }
  .hint, .muted { font-size: 13px; color: var(--color-blue-700); }
  .error { color: var(--color-alert); margin-top: 8px; }
  .done { font-weight: 700; margin-top: 8px; }
  .row { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--color-blue-700); }
  select { min-height: 36px; padding: 0 8px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-white); color: var(--color-navy); font-size: 14px; max-width: 100%; }
  .row.clear { margin-top: 6px; }
  .transfer label { flex: 1 1 200px; min-width: 0; }
  .transfer select { width: 100%; }
  /* storage bar: share of the quota in use */
  .bar { width: 100%; height: 8px; border-radius: 4px; background: var(--color-blue-100); overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--color-navy); }
  /* one line per room, floor or ticket project; long lists scroll inside the dialog */
  .list { list-style: none; margin: 0; padding: 0; width: 100%; max-height: 36vh; overflow-y: auto; border: 1px solid var(--color-blue-100); border-radius: var(--radius-md); }
  .list li { display: flex; align-items: center; gap: 10px; padding: 2px 4px 2px 10px; min-height: 40px; }
  .list li + li { border-top: 1px solid var(--color-blue-100); }
  .name { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto; min-width: 0; }
  .details { flex: 1 1 auto; font-size: 13px; color: var(--color-blue-700); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  button { min-height: 36px; padding: 0 14px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-white); color: var(--color-navy); font-size: 14px; cursor: pointer; }
  button.primary { background: var(--color-navy); border-color: var(--color-navy); color: var(--color-white); font-weight: 700; }
  button.danger { border-color: var(--color-alert); color: var(--color-alert); }
  button.icon { border: 0; min-height: 36px; min-width: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .gone button.icon { color: var(--color-alert); }
  button:disabled { opacity: 0.5; cursor: default; }
  button:focus-visible, select:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
</style>
