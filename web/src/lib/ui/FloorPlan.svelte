<script lang="ts">
  import { countText, rowsWidth, splitRows, type Floor } from "../model/building.ts";
  import SpaceButton from "./SpaceButton.svelte";
  import { t } from "../i18n/index.svelte.ts";

  let {
    floor,
    readonly = false,
    pendingChannel,
    talking,
    onjoin,
    boardOpen = false,
    boardUnseen = 0,
    ontoggleboard,
  }: {
    floor: Floor;
    readonly?: boolean;
    pendingChannel: number | null;
    talking: Record<number, boolean>;
    onjoin: (channelId: number) => void;
    boardOpen?: boolean;
    boardUnseen?: number;
    ontoggleboard?: () => void;
  } = $props();

  const rows = $derived(splitRows(floor.rooms));
  const lockText = $derived(floor.lock ? t().floorPlan.lockText[floor.lock] : "");
  // more than 3 rooms per row: the rows get wider than the view and only the floor plan scrolls sideways
  const width = $derived(rowsWidth(floor.rooms.length));

  let plan = $state<HTMLDivElement | null>(null);
  // own room out of view (other floor, room change, many rooms): bring it into view
  const selfRoom = $derived(floor.rooms.find((r) => r.isSelf)?.channelId ?? null);
  $effect(() => {
    if (selfRoom === null || !plan) return;
    plan.querySelector(`[data-channel="${selfRoom}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
  // a mouse wheel scrolls the floor plan sideways when it is wider than the view
  function wheel(el: HTMLElement) {
    const onwheel = (e: WheelEvent) => {
      if (e.ctrlKey || el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onwheel, { passive: false });
    return () => el.removeEventListener("wheel", onwheel);
  }
</script>

<div class="floorplan" class:wide={width > 1} bind:this={plan} {@attach wheel}>
  {#if floor.lock}
    <div class="notice" role="status">
      <strong>{t().common.notShown}</strong>
      <span>{lockText} {t().floorPlan.useMumble}</span>
    </div>
  {:else if floor.open}
    <SpaceButton
      space={floor.corridor}
      variant="open"
      title={floor.name}
      subtitle={t().floorPlan.openFloor(countText(floor.population))}
      pending={pendingChannel === floor.channelId}
      {talking}
      {readonly}
      {onjoin}
    />
  {:else}
    <div class="track" style:width={width > 1 ? `${width * 100}%` : undefined}>
      <div class="row top">
        {#each rows.top as room (room.channelId)}
          <SpaceButton space={room} variant="room" row="top" title={room.name} pending={pendingChannel === room.channelId} {talking} {readonly} {onjoin} {boardOpen} {boardUnseen} {ontoggleboard} />
        {/each}
      </div>
      <SpaceButton
        space={floor.corridor}
        variant="corridor"
        title={t().common.corridor}
        subtitle={t().floorPlan.corridorSubtitle(countText(floor.corridor.users.length))}
        pending={pendingChannel === floor.channelId}
        {talking}
        {readonly}
        {onjoin}
      />
      <div class="row bottom">
        {#each rows.bottom as room (room.channelId)}
          <SpaceButton space={room} variant="room" row="bottom" title={room.name} pending={pendingChannel === room.channelId} {talking} {readonly} {onjoin} {boardOpen} {boardUnseen} {ontoggleboard} />
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .floorplan { flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--wall); overflow-x: auto; overflow-y: hidden; }
  .floorplan.wide { scrollbar-color: var(--color-blue-300) var(--color-navy); }
  .track { flex: 1 0 auto; min-width: 100%; display: flex; flex-direction: column; gap: var(--wall); }
  .row { display: flex; gap: var(--wall); flex: 1 1 0; min-height: 0; }
  .notice {
    flex-grow: 1; display: flex; flex-direction: column; justify-content: center; gap: 8px; padding: 40px;
    background: var(--color-white); font-size: 15px; color: var(--color-blue-700);
  }
  .notice strong { font-size: 20px; color: var(--color-navy); }
</style>
