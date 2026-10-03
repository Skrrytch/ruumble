<script lang="ts">
  import type { BuildingCare } from "@ruumble/protocol";
  import { formatSize } from "../../board/model.ts";
  import { floorBadge, purgeDays, roomCount, storageShare } from "../../care/model.ts";
  import { t } from "../../i18n/index.svelte.ts";
  import type { RuumbleState } from "../../state.svelte.ts";
  import type { ConfirmRequest } from "./CareShell.svelte";
  import FloorButton from "./FloorButton.svelte";
  import Icon from "./Icon.svelte";
  import OrphanList, { type OrphanItem } from "./OrphanList.svelte";
  import StorageMeter from "./StorageMeter.svelte";

  // building care: the meter reading (storage), the floors from the top (a line opens floor care where the viewer may tend it), floors that are
  // gone, and the learned ticket links
  let { app, data, ask, confirming }: { app: RuumbleState; data: BuildingCare; ask: (key: string, request: ConfirmRequest) => void; confirming: string | null } = $props();

  const share = $derived(storageShare(data.storage.usedBytes, data.storage.quotaBytes));
  /** highest floor first, like the elevator */
  const floors = $derived([...data.floors].reverse());
  const building = $derived(app.building);
  /** floors whose care the viewer may open (Mumble Write, from the snapshot); the service checks again */
  const tendable = $derived(new Set(app.snapshot?.care ?? []));

  const orphans = $derived<OrphanItem[]>(
    data.orphans.map((f) => {
      const c = t().care;
      return {
        id: f.channelId, name: f.channelId === null ? c.unknownFloor : f.name || c.unknownFloor, posts: f.posts,
        meta: [c.rooms(f.rooms), c.postsShort(f.posts), f.bytes ? formatSize(f.bytes) : "", f.goneSince === null ? "" : c.purgeIn(purgeDays(f.goneSince, data.storage.graceDays))].filter(Boolean).join(" · "),
      };
    }),
  );

  function remove(items: OrphanItem[]): void {
    const c = t().care;
    const posts = items.reduce((n, i) => n + i.posts, 0);
    ask("orphans", {
      title: items.length === 1 ? c.confirmRemoveOne(items[0]!.name) : c.confirmRemoveFloors(items.length),
      detail: c.confirmRemoveDetail(c.posts(posts)),
      confirmLabel: c.removeForever,
      tone: "danger",
      run: () => app.removeOrphans(items.map((i) => i.id)),
    });
  }

  const tickets = $derived(Object.entries(data.tickets));

  function forget(projects: string[]): void {
    const c = t().care;
    ask("tickets", {
      title: projects.length === 1 ? c.confirmForgetOne(projects[0]!) : c.confirmForgetAll(projects.length),
      detail: c.confirmForgetDetail,
      confirmLabel: c.forgetConfirm,
      tone: "neutral",
      icon: "tag",
      run: () => app.forgetTickets(projects),
    });
  }
</script>

<section class="meter-strip" aria-label={t().care.storage} class:faded={!!confirming}>
  <span class="used"><strong>{formatSize(data.storage.usedBytes)}</strong> {t().care.ofQuota(formatSize(data.storage.quotaBytes))}</span>
  <StorageMeter {share} label={t().care.storageBar} />
  <span class="meta">{t().care.share(share)} · {t().care.retentionShort(data.storage.retentionDays)}</span>
</section>

{#snippet cells(f: BuildingCare["floors"][number], rooms: number)}
  <FloorButton label={(building && floorBadge(building, f.channelId)) ?? "?"} />
  <strong class="name">{f.name}</strong>
  <span class="meta">{f.posts ? [t().care.rooms(rooms), t().care.postsShort(f.posts), f.bytes ? formatSize(f.bytes) : ""].filter(Boolean).join(" · ") : t().care.empty}</span>
{/snippet}

<div class="columns">
  <div class="left">
    <section class:faded={!!confirming}>
      <h3>{t().care.floorsTitle}</h3>
      {#if floors.length}
        <ul class="list">
          {#each floors as f (f.channelId)}
            {@const rooms = building ? roomCount(building, f.channelId) : f.rooms}
            <li>
              {#if tendable.has(f.channelId)}
                <button type="button" class="floor-row" title={t().care.floorPlant(f.name)} onclick={() => app.openCare({ kind: "floor", channelId: f.channelId }, true)}>
                  {@render cells(f, rooms)}
                  <Icon name="next" size={16} color="var(--link)" />
                </button>
              {:else}
                <div class="floor-row">{@render cells(f, rooms)}<span class="spacer"></span></div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
    <div class:faded={!!confirming && confirming !== "orphans"}>
      <OrphanList title={t().care.gone} items={orphans} empty={t().care.noGoneFloors} busy={app.careBusy} onremove={remove} />
    </div>
  </div>

  <section class:faded={!!confirming && confirming !== "tickets"}>
    <div class="head">
      <h3>{t().care.tickets}</h3>
      {#if tickets.length > 1}<button type="button" class="text-link" disabled={app.careBusy} onclick={() => forget(tickets.map(([p]) => p))}>{t().care.forgetAll}</button>{/if}
    </div>
    {#if tickets.length}
      <ul class="list">
        {#each tickets as [project, base] (project)}
          <li class="ticket">
            <span class="chip"><Icon name="tag" size={13} color="var(--accent)" />{project}</span>
            <span class="url" title={base}>{base.replace(/^https?:\/\//, "")}</span>
            <button type="button" class="reset" aria-label={t().care.forgetTicket(project)} title={t().care.forgetTicket(project)} disabled={app.careBusy} onclick={() => forget([project])}><Icon name="close" size={15} /></button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="small">{t().care.noTickets}</p>
    {/if}
    <p class="small">{t().care.ticketsHint}</p>
  </section>
</div>

<style>
  .meter-strip { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 16px; padding: 12px 14px; background: var(--surface); border-radius: 4px; }
  .used { white-space: nowrap; font-size: 13px; color: var(--ink-2); }
  .used strong { font-size: 20px; color: var(--ink); font-variant-numeric: tabular-nums; }
  .meta { font-size: 13px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .columns { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 24px; align-items: start; }
  .left { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: 4px; overflow: hidden; }
  .list li + li { border-top: 1px solid var(--line-soft); }
  .floor-row { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 0 10px; border: 0; background: #fff; font: inherit; color: var(--ink); text-align: left; }
  button.floor-row { cursor: pointer; }
  button.floor-row:hover { background: #f4f8fc; }
  .spacer { flex: none; width: 16px; }
  .floor-row .name { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .floor-row .meta { flex: 1; text-align: right; }
  .ticket { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 6px 0 8px; }
  .chip { flex: none; display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 9px; border: 1px solid var(--accent-soft); border-radius: 12px; background: var(--tint); font-size: 13px; font-weight: 700; }
  .url { flex: 1; min-width: 0; font-family: var(--font-mono); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .reset { flex: none; width: 36px; height: 36px; display: grid; place-items: center; border: 0; border-radius: 4px; background: transparent; color: var(--ink); cursor: pointer; }
  .reset:hover { background: var(--tint); }
  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .text-link { border: 0; padding: 0; background: none; font: inherit; font-size: 13px; font-weight: 700; color: var(--link); cursor: pointer; }
  .text-link:hover { text-decoration: underline; }
  .text-link:disabled { opacity: 0.45; cursor: default; text-decoration: none; }
  .reset:disabled { opacity: 0.45; cursor: default; }
</style>
