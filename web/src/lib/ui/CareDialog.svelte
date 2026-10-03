<script lang="ts">
  import { formatSize } from "../board/model.ts";
  import { careCrumbs, floorBadge, roomCount } from "../care/model.ts";
  import { t } from "../i18n/index.svelte.ts";
  import { careErrorText, type RuumbleState } from "../state.svelte.ts";
  import BuildingCare from "./care/BuildingCare.svelte";
  import CareShell, { type ConfirmRequest, type ShellCrumb } from "./care/CareShell.svelte";
  import DoorPlate from "./care/DoorPlate.svelte";
  import FloorButton from "./care/FloorButton.svelte";
  import FloorCare from "./care/FloorCare.svelte";
  import LevelGlyph from "./care/LevelGlyph.svelte";
  import RoomCare from "./care/RoomCare.svelte";

  // Care of the stored data (ADR-0014), opened from a plant: one dialog that moves between building, floor and room
  // (the trail in the state, the breadcrumb for parent levels the viewer may tend). Design handoff "Hausmeister".
  let { app }: { app: RuumbleState } = $props();

  const target = $derived(app.care!);
  const view = $derived(app.careView);
  const channelName = (id: number) => app.snapshot?.channels.find((c) => c.id === id)?.name ?? "";
  const levelKey = $derived(target.kind === "building" ? "building" : `${target.kind}-${target.channelId}`);

  const title = $derived(t().care.titles[target.kind]);
  const name = $derived(target.kind === "building" ? "" : view && view.kind !== "building" ? view.value.name : channelName(target.channelId));

  const crumbs = $derived<ShellCrumb[]>(
    careCrumbs(target, app.snapshot?.channels ?? [], app.snapshot?.care ?? [], t().care.buildingCrumb).map((c) => {
      const to = c.target;
      return to ? { label: c.label, onselect: () => void app.careJump(to) } : { label: c.label };
    }),
  );

  const summary = $derived.by(() => {
    const c = t().care;
    if (view?.kind === "floor") {
      const posts = view.value.rooms.reduce((n, r) => n + r.posts, 0);
      const bytes = view.value.rooms.reduce((n, r) => n + r.bytes, 0);
      return [c.rooms(view.value.rooms.length), c.posts(posts), bytes ? formatSize(bytes) : ""].filter(Boolean).join(" · ");
    }
    if (view?.kind === "building") {
      const building = app.building;
      const rooms = building ? view.value.floors.reduce((n, f) => n + roomCount(building, f.channelId), 0) : 0;
      return [c.floors(view.value.floors.length), c.rooms(rooms), c.posts(view.value.floors.reduce((n, f) => n + f.posts, 0))].join(" · ");
    }
    return "";
  });

  const previous = $derived(app.careTrail.at(-1));
  const houseRule = $derived.by(() => {
    const c = t().care;
    if (view?.kind === "room") return c.ruleRoom(view.value.retentionDays);
    if (view?.kind === "floor") return c.ruleFloor(view.value.graceDays);
    if (view?.kind === "building") return c.ruleBuilding(view.value.storage.retentionDays, view.value.storage.graceDays);
    return "";
  });
  const status = $derived(!view ? null : app.careError ? { text: careErrorText(app.careError), error: true } : app.careMessage ? { text: app.careMessage, error: false } : null);

  // the confirmation bar instead of the footer; `key` names the section it is about (the rest is dimmed)
  let confirm = $state<{ key: string; request: ConfirmRequest } | null>(null);
  const ask = (key: string, request: ConfirmRequest) => (confirm = { key, request });
  $effect(() => {
    void levelKey;
    confirm = null; // another level: nothing to confirm there
  });
</script>

<CareShell
  {title}
  level={levelKey}
  {crumbs}
  {summary}
  backLabel={previous ? t().care.backTo[previous.kind] : ""}
  onback={previous ? () => void app.careBack() : undefined}
  onclose={() => app.closeCare()}
  {houseRule}
  {status}
  confirm={confirm?.request ?? null}
  oncancelconfirm={() => (confirm = null)}
>
  {#snippet glyph()}<LevelGlyph level={target.kind} />{/snippet}
  {#snippet plate()}
    {#if target.kind === "room" && name}
      <DoorPlate {name} />
    {:else if target.kind === "floor" && name}
      {@const badge = app.building ? floorBadge(app.building, target.channelId) : null}
      <span class="floor-plate">{#if badge}<FloorButton label={badge} mini />{/if}{name}</span>
    {/if}
  {/snippet}

  {#if !view}
    {#if app.careError}<p class="error" role="alert">{careErrorText(app.careError)}</p>{:else}<p class="loading">{t().care.loading}</p>{/if}
  {:else if view.kind === "room"}
    <RoomCare {app} room={view.value} {ask} confirming={confirm?.key ?? null} />
  {:else if view.kind === "floor"}
    <FloorCare {app} floor={view.value} {ask} confirming={confirm?.key ?? null} />
  {:else}
    <BuildingCare {app} data={view.value} {ask} confirming={confirm?.key ?? null} />
  {/if}
</CareShell>

<style>
  .floor-plate { display: inline-flex; align-items: center; gap: 6px; min-width: 0; padding: 1px 10px 1px 4px; border: 1px solid var(--ink); border-radius: 3px; background: #fff; font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .loading { margin: 0; color: var(--muted); }
  .error { margin: 0; color: var(--danger); }
</style>
