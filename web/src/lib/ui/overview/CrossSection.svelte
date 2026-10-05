<script lang="ts">
  import Lock from "@lucide/svelte/icons/lock";
  import { t } from "../../i18n/index.svelte.ts";
  import { splitRows, type Building, type Floor, type Space } from "../../model/building.ts";
  import MiniPerson from "./MiniPerson.svelte";

  // The cross-section of the building overview (ADR-0019), like an architect's section drawing: the roof with the
  // server's name, the floors stacked like in the elevator (highest on top), the elevator shaft on the left with
  // the cabin at the own floor, the entrance at the bottom. Rooms keep their floor-plan proportions; occupied rooms
  // have the lights on. A room is a button to move there, the floor badge shows that floor.
  let {
    building,
    readonly,
    pendingChannel,
    highlight,
    onhover,
    onvisit,
    onfloor,
  }: {
    building: Building;
    readonly: boolean;
    pendingChannel: number | null;
    /** session hovered on the directory board */
    highlight: number | null;
    onhover: (session: number | null) => void;
    onvisit: (channelId: number) => void;
    onfloor: (floor: Floor) => void;
  } = $props();

  /** people shown per room before "+n" */
  const MAX_SHOWN = 8;
  const storeys = $derived([...building.floors].reverse());
  const canVisit = (space: Space) => !readonly && !space.isSelf && !space.locked;
</script>

{#snippet cell(space: Space, kind: "room" | "corridor" | "open" | "entrance", grow = 1)}
  {@const go = canVisit(space)}
  {@const shown = space.users.slice(0, space.users.length > MAX_SHOWN ? MAX_SHOWN - 1 : MAX_SHOWN)}
  {@const name = kind === "corridor" ? t().common.corridor : kind === "entrance" ? t().common.entrance : space.name}
  <div
    class="cell {kind}" class:lit={space.users.length > 0} class:own={space.isSelf} class:go class:pending={pendingChannel === space.channelId}
    style:flex-grow={grow} data-channel={space.channelId}
  >
    {#if go}
      <button type="button" class="enter" aria-label={t().overview.enterRoom(name)} title={t().overview.enterRoom(name)} onclick={() => onvisit(space.channelId)}></button>
    {/if}
    <span class="cell-name" aria-hidden={go}>{#if space.locked && !space.isSelf}<Lock size={9} />{/if}{name}</span>
    {#if space.users.length}
      <span class="people">
        {#each shown as user (user.session)}
          <span role="presentation" onmouseenter={() => onhover(user.session)} onmouseleave={() => onhover(null)}>
            <MiniPerson {user} highlight={highlight === user.session} />
          </span>
        {/each}
        {#if shown.length < space.users.length}
          <span class="more" title={space.users.slice(shown.length).map((u) => u.name).join(", ")}>{t().overview.more(space.users.length - shown.length)}</span>
        {/if}
      </span>
    {/if}
  </div>
{/snippet}

<section class="section" aria-label={t().overview.section}>
  <div class="roof" aria-hidden="true"><span>{building.name}</span></div>
  {#each storeys as f (f.channelId)}
    {@const blocked = f.lock !== null && !f.isSelf}
    <div class="storey" class:mine={f.isSelf} class:locked={f.lock !== null} data-floor={f.channelId}>
      <div class="shaft">
        <button
          type="button" class="fbadge" aria-label={t().overview.viewFloor(f.name)} title={blocked ? t().core.lockReason[f.lock!] : t().overview.viewFloor(f.name)}
          disabled={blocked} onclick={() => onfloor(f)}
        >{f.badge}</button>
      </div>
      <div class="floor-body">
        {#if f.lock}
          <div class="closed"><Lock size={13} /><span class="floor-name">{f.name}</span><span>· {t().overview.locked} · {t().core.lockReason[f.lock]}</span></div>
        {:else if f.open}
          <div class="row">{@render cell(f.corridor, "open")}</div>
        {:else}
          {@const rows = splitRows(f.rooms)}
          <div class="row">{#each rows.top as r (r.channelId)}{@render cell(r, "room", r.grow)}{/each}</div>
          <div class="row corridor-row">{@render cell(f.corridor, "corridor")}</div>
          {#if rows.bottom.length}<div class="row">{#each rows.bottom as r (r.channelId)}{@render cell(r, "room", r.grow)}{/each}</div>{/if}
        {/if}
      </div>
      <span class="pop" title={t().people.count(f.population)}>{f.population}</span>
    </div>
  {/each}
  <div class="storey ground" class:mine={building.self?.kind === "entrance"}>
    <div class="shaft"><span class="fbadge entrance-badge" aria-hidden="true"></span></div>
    <div class="floor-body">
      <div class="row">
        {@render cell({ channelId: 0, name: t().common.entrance, users: building.entrance, isSelf: building.self?.kind === "entrance", locked: false, listeners: [], recording: false, canTend: false }, "entrance")}
      </div>
    </div>
    <span class="pop">{building.entrance.length}</span>
  </div>
  <div class="earth" aria-hidden="true"></div>
</section>

<style>
  .section { display: flex; flex-direction: column; gap: 0; min-width: 0; padding: 0 4px 12px; }
  /* the roof: a gable in navy with the building's name */
  .roof {
    height: 54px; margin: 0 28px 0 34px; background: var(--color-navy); color: var(--color-white);
    clip-path: polygon(6% 100%, 50% 0, 94% 100%); display: flex; align-items: flex-end; justify-content: center; padding-bottom: 8px;
    font-size: 13px; font-weight: 700; letter-spacing: 0.04em;
  }
  .roof span { max-width: 50%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .storey { display: grid; grid-template-columns: 40px minmax(0, 1fr) 28px; align-items: stretch; }
  /* the elevator shaft: a grey strip through every floor; the cabin stands at the own floor */
  .shaft { position: relative; display: flex; align-items: center; justify-content: center; background: var(--color-surface); border-left: 2px solid var(--color-navy); border-right: 2px solid var(--color-navy); }
  .storey.mine .shaft::before { content: ""; position: absolute; inset: 6px 5px; border-radius: 3px; background: var(--color-navy); }
  .fbadge {
    position: relative; width: 26px; height: 26px; border-radius: 50%; border: 2px solid var(--color-navy); background: var(--color-white);
    color: var(--color-navy); font: inherit; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; padding: 0;
  }
  button.fbadge { cursor: pointer; }
  button.fbadge:hover:not(:disabled) { background: var(--color-blue-100); }
  button.fbadge:disabled { opacity: 0.5; cursor: not-allowed; }
  .storey.mine .fbadge { box-shadow: 0 0 0 2px var(--color-accent); }
  .entrance-badge { width: 14px; height: 22px; border-radius: 2px 2px 0 0; }
  /* every floor: walls of 2 px, a slab of 5 px between the floors */
  .floor-body { display: flex; flex-direction: column; border-top: 5px solid var(--color-navy); border-right: 2px solid var(--color-navy); min-width: 0; }
  .storey:last-of-type .floor-body { border-bottom: 5px solid var(--color-navy); }
  .row { display: flex; min-width: 0; }
  .cell {
    position: relative; flex: 1 1 0; min-width: 0; min-height: 44px; padding: 3px 5px 4px; display: flex; flex-direction: column; gap: 3px;
    border-right: 2px solid var(--color-navy); background: var(--color-white); transition: background var(--dur) var(--ease-out);
  }
  .row .cell:last-child { border-right: 0; }
  .cell.corridor { min-height: 0; padding: 2px 5px; flex-direction: row; align-items: center; gap: 6px; border-top: 2px solid var(--color-navy); border-bottom: 2px solid var(--color-navy); background-image: radial-gradient(circle, var(--raster-dot) 1px, transparent 1.4px); background-size: 6px 6px; }
  .corridor-row:last-child .cell.corridor { border-bottom: 0; }
  .corridor-row .cell { min-height: 20px; }
  /* lights on: someone is in the room */
  .cell.lit { background-color: var(--color-blue-50); }
  .cell.own { background-color: var(--color-blue-100); }
  .cell.go:hover { background-color: var(--color-blue-100); }
  .cell.pending { background-color: var(--color-blue-100); }
  .enter { position: absolute; inset: 0; border: 0; background: transparent; cursor: pointer; padding: 0; }
  .enter:focus-visible { outline: 3px solid var(--color-sky); outline-offset: -3px; }
  .cell-name { display: flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 700; color: var(--color-navy); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
  .corridor .cell-name { font-weight: 400; color: var(--color-blue-700); flex: none; }
  .people { position: relative; display: flex; flex-wrap: wrap; gap: 3px; pointer-events: none; }
  .people > span { display: inline-flex; pointer-events: auto; }
  .more { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; padding: 0 3px; border-radius: 11px; background: var(--color-blue-50); border: 1px solid var(--color-blue-300); font-size: 9px; font-weight: 700; color: var(--color-navy); pointer-events: auto; }
  .closed { display: flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 8px; font-size: 11px; color: var(--color-blue-700); background: repeating-linear-gradient(135deg, var(--color-surface) 0 6px, var(--color-white) 6px 12px); }
  .floor-name { font-weight: 700; color: var(--color-navy); }
  .storey.locked .floor-body { opacity: 0.8; }
  .pop { display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: var(--color-blue-700); font-variant-numeric: tabular-nums; }
  .ground .cell { min-height: 40px; }
  .earth { height: 8px; margin: 0 0 0 0; background: repeating-linear-gradient(90deg, var(--color-navy) 0 10px, transparent 10px 14px); opacity: 0.25; }
</style>
