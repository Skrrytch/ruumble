<script lang="ts">
  import type { FloorCare } from "@ruumble/protocol";
  import { formatSize, relativeTime } from "../../board/model.ts";
  import { purgeDays } from "../../care/model.ts";
  import { t } from "../../i18n/index.svelte.ts";
  import type { RuumbleState } from "../../state.svelte.ts";
  import type { ConfirmRequest } from "./CareShell.svelte";
  import Icon from "./Icon.svelte";
  import OrphanList, { type OrphanItem } from "./OrphanList.svelte";

  // floor care: the rooms of the floor (a line opens room care), moving a board here, rooms that are gone
  let { app, floor, ask, confirming }: { app: RuumbleState; floor: FloorCare; ask: (key: string, request: ConfirmRequest) => void; confirming: string | null } = $props();

  let from = $state("");
  let to = $state("");
  const source = $derived(floor.sources.find((s) => String(s.channelId) === from));
  const target = $derived(floor.rooms.find((r) => String(r.channelId) === to));

  function move(): void {
    if (!source || !target) return;
    const c = t().care;
    ask("move", {
      title: c.confirmMoveTitle(c.posts(source.posts), source.name, target.name),
      detail: c.confirmMoveDetail(target.name),
      confirmLabel: c.moveConfirm,
      tone: "neutral",
      run: async () => {
        if (await app.transferBoard(source.channelId, target.channelId)) from = to = "";
      },
    });
  }

  const orphans = $derived<OrphanItem[]>(
    floor.orphans.map((o) => {
      const c = t().care;
      const when = o.goneSince === null ? c.moved : c.purgeIn(purgeDays(o.goneSince, floor.graceDays));
      return { id: o.channelId, name: o.name || c.unnamedRoom(o.channelId), posts: o.posts, meta: [c.postsShort(o.posts), o.bytes ? formatSize(o.bytes) : "", when].filter(Boolean).join(" · ") };
    }),
  );

  function remove(items: OrphanItem[]): void {
    const c = t().care;
    const posts = items.reduce((n, i) => n + i.posts, 0);
    ask("orphans", {
      title: items.length === 1 ? c.confirmRemoveOne(items[0]!.name) : c.confirmRemoveRooms(items.length),
      detail: c.confirmRemoveDetail(c.posts(posts)),
      confirmLabel: c.removeForever,
      tone: "danger",
      run: () => app.removeOrphans(items.map((i) => i.id)),
    });
  }
</script>

<div class="columns">
  <section class:faded={!!confirming}>
    <h3>{t().care.floorRooms}</h3>
    {#if floor.rooms.length}
      <div class="table">
        <div class="row head" aria-hidden="true">
          <span>{t().care.colDoor}</span><span class="num">{t().care.colPosts}</span><span class="num">{t().care.colAttachments}</span><span>{t().care.colLast}</span><span></span>
        </div>
        <ul>
          {#each floor.rooms as r (r.channelId)}
            <li>
              <button type="button" class="row" title={t().care.roomPlant(r.name)} onclick={() => app.openCare({ kind: "room", channelId: r.channelId }, true)}>
                <span class="door"><Icon name="door" size={14} color="var(--accent)" /><strong>{r.name}</strong></span>
                {#if r.posts}
                  <span class="num">{r.posts}<span class="sr"> {t().care.colPosts}</span></span>
                  <span class="num">{r.bytes ? formatSize(r.bytes) : "–"}</span>
                  <span class="last">{r.newest === null ? "" : relativeTime(r.newest)}</span>
                {:else}
                  <span class="num empty">{t().care.empty}</span><span></span><span></span>
                {/if}
                <span class="chev" aria-hidden="true"><Icon name="next" size={16} color="var(--link)" /></span>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {:else}
      <p class="small">{t().care.noRooms}</p>
    {/if}
  </section>

  <div class="side">
    {#if floor.rooms.length}
      <section class:faded={!!confirming && confirming !== "move"}>
        <h3>{t().care.move}</h3>
        {#if floor.sources.length}
          <div class="pick">
            <label for="care-move-from">{t().care.moveFrom}</label>
            <select id="care-move-from" bind:value={from} disabled={app.careBusy}>
              <option value="">{t().care.chooseRoom}</option>
              {#each floor.sources as s (s.channelId)}<option value={String(s.channelId)}>{t().care.sourceOption(s.name, s.posts, s.floorName === floor.name ? "" : s.floorName, s.gone)}</option>{/each}
            </select>
            <label for="care-move-to">{t().care.moveTo}</label>
            <select id="care-move-to" bind:value={to} disabled={app.careBusy}>
              <option value="">{t().care.chooseRoom}</option>
              {#each floor.rooms.filter((r) => String(r.channelId) !== from) as r (r.channelId)}<option value={String(r.channelId)}>{r.name}</option>{/each}
            </select>
            <span></span>
            <button type="button" class="btn primary" disabled={app.careBusy || !source || !target || from === to} onclick={move}>{t().care.moveButton}</button>
          </div>
        {:else}
          <p class="small">{t().care.noSources}</p>
        {/if}
        <p class="small">{t().care.moveHint}</p>
      </section>
    {/if}
    <div class:faded={!!confirming && confirming !== "orphans"}>
      <OrphanList title={t().care.gone} items={orphans} empty={t().care.noGoneRooms} busy={app.careBusy} onremove={remove} />
    </div>
  </div>
</div>

<style>
  .columns { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 24px; align-items: start; }
  .side { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
  .table { border: 1px solid var(--line); border-radius: 4px; overflow: hidden; }
  .row {
    display: grid; grid-template-columns: minmax(0, 1fr) 44px 64px 96px 16px; gap: 8px; align-items: center; width: 100%;
    min-height: 42px; padding: 0 10px; border: 0; background: #fff; font: inherit; color: var(--ink); text-align: left; cursor: pointer;
  }
  ul { list-style: none; margin: 0; padding: 0; }
  li { border-top: 1px solid var(--line-soft); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  button.row:hover { background: #f4f8fc; }
  .head { min-height: 30px; background: var(--surface); font-size: 12px; color: var(--muted); cursor: default; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .door { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .door strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .last { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .empty { color: var(--disabled); font-size: 13px; }
  .chev { display: grid; place-items: center; }
  .pick { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 12px; align-items: center; }
  .pick label { font-size: 13px; color: var(--muted); }
  select { height: 40px; padding: 0 8px; border: 1px solid var(--control); border-radius: 4px; background: #fff; color: var(--ink); font: inherit; min-width: 0; width: 100%; }
  .pick .btn { justify-content: center; }
</style>
