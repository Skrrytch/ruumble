<script lang="ts">
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import X from "@lucide/svelte/icons/x";
  import { formatSize } from "../board/model.ts";
  import { locale, t } from "../i18n/index.svelte.ts";
  import { careErrorText, type RuumbleState } from "../state.svelte.ts";
  import Plant from "./Plant.svelte";

  // Care of the stored data (ADR-0014), opened from a plant: room care (the board), floor care (rooms of this
  // floor that are gone) or building care (floors that are gone, learned ticket links). Every removal asks first.
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

  /** the rows of floor or building care: one line each */
  const rows = $derived.by(() => {
    const c = t().care;
    if (view?.kind === "floor") {
      return view.value.orphans.map((r) => ({
        id: r.channelId as number | null, name: r.name || c.unnamedRoom(r.channelId), posts: r.posts,
        details: [c.posts(r.posts), r.bytes ? formatSize(r.bytes) : "", r.goneSince === null ? c.moved : c.goneSince(date.format(r.goneSince))],
      }));
    }
    if (view?.kind === "building") {
      return view.value.orphans.map((f) => ({
        id: f.channelId, name: f.channelId === null ? c.unknownFloor : f.name || c.unknownFloor, posts: f.posts,
        details: [c.rooms(f.rooms), c.posts(f.posts), f.bytes ? formatSize(f.bytes) : "", f.goneSince === null ? "" : c.goneSince(date.format(f.goneSince))],
      }));
    }
    return [];
  });

  function clear(): void {
    if (view?.kind !== "room" || !confirm(t().care.confirmClear(view.value.name, t().care.posts(view.value.posts)))) return;
    void app.clearRoom();
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
    <span class="plant" aria-hidden="true"><Plant size={22} /></span>
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
        <p>{room.posts ? t().care.boardHolds(t().care.posts(room.posts), room.bytes ? formatSize(room.bytes) : "") : t().care.boardEmpty}</p>
        <p class="hint">{t().care.clearBoardHint}</p>
        <button type="button" class="danger" disabled={app.careBusy || room.posts === 0} onclick={clear}>{t().care.clearBoard}</button>
      </section>
    {:else}
      <section>
        <h3>{view.kind === "floor" ? t().care.orphanRooms : t().care.orphanFloors}</h3>
        {#if rows.length}
          <ul class="orphans">
            {#each rows as row (row.id)}
              <li>
                <span class="name">{row.name}</span>
                <span class="details">{row.details.filter(Boolean).join(" · ")}</span>
                <button type="button" class="icon" aria-label={t().care.remove(row.name)} title={t().care.remove(row.name)} disabled={app.careBusy} onclick={() => remove([row])}><Trash2 size={16} /></button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted">{view.kind === "floor" ? t().care.noOrphanRooms : t().care.noOrphanFloors}</p>
        {/if}
        <p class="hint">{view.kind === "floor" ? t().care.orphanRoomsHint : t().care.orphanFloorsHint}</p>
        {#if rows.length > 1}<button type="button" class="danger" disabled={app.careBusy} onclick={() => remove(rows)}>{t().care.removeAll}</button>{/if}
      </section>
      {#if view.kind === "building"}
        <!-- learned ticket links are building-wide: one base URL per project, learned from every room -->
        {@const projects = Object.entries(view.value.tickets)}
        <section>
          <h3>{t().care.tickets}</h3>
          {#if projects.length}
            <ul class="orphans tickets">
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
    {/if}
    {#if view && app.careError}<p class="error" role="alert">{careErrorText(app.careError)}</p>{/if}
    {#if app.careMessage}<p class="done" role="status">{app.careMessage}</p>{/if}
  </div>
  <footer>
    <button type="button" class="primary" onclick={() => app.closeCare()}>{t().common.close}</button>
  </footer>
</dialog>

<style>
  dialog { width: min(520px, 92vw); max-height: 86vh; border: 0; border-radius: var(--radius-md); padding: 0; color: var(--color-navy); display: flex; flex-direction: column; }
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
  /* one line per room or floor; long lists scroll inside the dialog */
  .orphans { list-style: none; margin: 0; padding: 0; width: 100%; max-height: 40vh; overflow-y: auto; border: 1px solid var(--color-blue-100); border-radius: var(--radius-md); }
  .orphans li { display: flex; align-items: center; gap: 10px; padding: 2px 4px 2px 10px; min-height: 40px; }
  .orphans li + li { border-top: 1px solid var(--color-blue-100); }
  .name { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto; min-width: 0; }
  .details { flex: 1 1 auto; font-size: 13px; color: var(--color-blue-700); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  button { min-height: 36px; padding: 0 14px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-white); color: var(--color-navy); font-size: 14px; cursor: pointer; }
  button.primary { background: var(--color-navy); border-color: var(--color-navy); color: var(--color-white); font-weight: 700; }
  button.danger { border-color: var(--color-alert); color: var(--color-alert); }
  button.icon { border: 0; min-height: 36px; min-width: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .orphans button.icon { color: var(--color-alert); }
  .orphans.tickets button.icon { color: var(--color-navy); }
  button:disabled { opacity: 0.5; cursor: default; }
  button:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
</style>
