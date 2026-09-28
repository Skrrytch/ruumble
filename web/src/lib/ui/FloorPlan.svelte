<script lang="ts">
  import { MAX_ROOMS, countText, splitRows, type Floor } from "../model/building.ts";
  import SpaceButton from "./SpaceButton.svelte";
  import { t } from "../i18n/index.svelte.ts";

  let {
    floor,
    readonly = false,
    pendingChannel,
    talking,
    onjoin,
    boardOpen = false,
    ontoggleboard,
  }: {
    floor: Floor;
    readonly?: boolean;
    pendingChannel: number | null;
    talking: Record<number, boolean>;
    onjoin: (channelId: number) => void;
    boardOpen?: boolean;
    ontoggleboard?: () => void;
  } = $props();

  const rows = $derived(splitRows(floor.rooms));
  const lockText = $derived(floor.lock === "too-many-rooms" ? t().floorPlan.lockText["too-many-rooms"](MAX_ROOMS) : t().floorPlan.lockText["too-deep"]);
</script>

<div class="floorplan">
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
    <div class="row top">
      {#each rows.top as room (room.channelId)}
        <SpaceButton space={room} variant="room" row="top" title={room.name} pending={pendingChannel === room.channelId} {talking} {readonly} {onjoin} {boardOpen} {ontoggleboard} />
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
        <SpaceButton space={room} variant="room" row="bottom" title={room.name} pending={pendingChannel === room.channelId} {talking} {readonly} {onjoin} {boardOpen} {ontoggleboard} />
      {/each}
    </div>
  {/if}
</div>

<style>
  .floorplan { flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--wall); }
  .row { display: flex; gap: var(--wall); flex: 1 1 0; min-height: 0; }
  .notice {
    flex-grow: 1; display: flex; flex-direction: column; justify-content: center; gap: 8px; padding: 40px;
    background: var(--color-white); font-size: 15px; color: var(--color-blue-700);
  }
  .notice strong { font-size: 20px; color: var(--color-navy); }
</style>
