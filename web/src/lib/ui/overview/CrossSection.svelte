<script lang="ts">
  import Lock from "@lucide/svelte/icons/lock";
  import { t } from "../../i18n/index.svelte.ts";
  import type { Building, Floor, Space } from "../../model/building.ts";
  import MiniPerson from "./MiniPerson.svelte";

  // The building from the side (ADR-0019): the roof with the server's name, the floors stacked like in the elevator
  // (highest on top), the elevator shaft on the left with the cabin at the own floor, the entrance at the bottom.
  // On every floor the people stand in groups, one per occupied room or corridor, set apart by a thin line; rooms
  // are not drawn and not named (the name is in the tooltip). A group is a button to move there, the floor badge
  // shows that floor.
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

  const storeys = $derived([...building.floors].reverse());
  const canVisit = (space: Space) => !readonly && !space.isSelf && !space.locked;
  /** the occupied places of a floor: its rooms in Mumble's order, then the corridor (or the open floor) */
  const groupsOf = (f: Floor): { space: Space; name: string }[] =>
    [...f.rooms.map((r) => ({ space: r as Space, name: r.name })), { space: f.corridor, name: f.open ? f.name : t().common.corridor }].filter((g) => g.space.users.length > 0);
  const entrance = $derived<Space>({ channelId: 0, name: t().common.entrance, users: building.entrance, isSelf: building.self?.kind === "entrance", locked: false, listeners: [], recording: false, canTend: false });
</script>

{#snippet people(space: Space, name: string)}
  {@const go = canVisit(space)}
  <svelte:element
    this={go ? "button" : "div"} type={go ? "button" : undefined} class="group" class:own={space.isSelf} class:go class:pending={pendingChannel === space.channelId}
    data-channel={space.channelId} aria-label={go ? t().overview.enterRoom(name) : undefined} title={go ? t().overview.enterRoom(name) : name}
    onclick={go ? () => onvisit(space.channelId) : undefined} role={go ? undefined : "group"}
  >
    {#each space.users as user (user.session)}
      <span class="who" role="presentation" onmouseenter={() => onhover(user.session)} onmouseleave={() => onhover(null)}>
        <MiniPerson {user} highlight={highlight === user.session} />
      </span>
    {/each}
  </svelte:element>
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
      <div class="floor">
        {#if f.lock}
          <span class="closed"><Lock size={13} />{t().overview.locked} · {t().core.lockReason[f.lock]}</span>
        {:else}
          {#each groupsOf(f) as g (g.space.channelId)}{@render people(g.space, g.name)}{/each}
        {/if}
      </div>
    </div>
  {/each}
  <div class="storey ground" class:mine={building.self?.kind === "entrance"}>
    <div class="shaft"><span class="door" aria-hidden="true"></span></div>
    <div class="floor">
      {#if building.entrance.length}{@render people(entrance, t().common.entrance)}{/if}
    </div>
  </div>
  <div class="earth" aria-hidden="true"></div>
</section>

<style>
  .section { display: flex; flex-direction: column; min-width: 0; padding: 0 4px 12px; }
  /* the roof: a flat gable in navy with the building's name, flush with the outer walls (shaft to right wall) */
  .roof {
    height: 50px; background: var(--color-navy); color: var(--color-white);
    clip-path: polygon(0 100%, 50% 0, 100% 100%); display: flex; align-items: flex-end; justify-content: center; padding-bottom: 8px;
    font-size: 13px; font-weight: 700; letter-spacing: 0.04em;
  }
  .roof span { max-width: 50%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .storey { display: grid; grid-template-columns: 40px minmax(0, 1fr); }
  /* the elevator shaft: a grey strip through every floor; the cabin stands at the own floor */
  .shaft { position: relative; display: flex; align-items: center; justify-content: center; background: var(--color-surface); border-left: 2px solid var(--color-navy); border-top: 3px solid var(--color-navy); }
  .storey.mine .shaft::before { content: ""; position: absolute; inset: 7px 6px; border-radius: 3px; background: var(--color-navy); }
  .fbadge {
    position: relative; width: 26px; height: 26px; border-radius: 50%; border: 2px solid var(--color-navy); background: var(--color-white); padding: 0;
    color: var(--color-navy); font: inherit; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; cursor: pointer;
  }
  .fbadge:hover:not(:disabled) { background: var(--color-blue-100); }
  .fbadge:disabled { opacity: 0.5; cursor: not-allowed; }
  .fbadge:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
  .storey.mine .fbadge { box-shadow: 0 0 0 2px var(--color-accent); }
  .door { position: relative; width: 14px; height: 24px; border: 2px solid var(--color-navy); border-bottom: 0; border-radius: 3px 3px 0 0; background: var(--color-white); }
  /* a floor: the slab on top, the outer wall on the right; the people stand on the slab below */
  .floor {
    display: flex; flex-wrap: wrap; align-items: flex-end; min-width: 0; min-height: 52px; padding: 8px 10px 6px;
    border-top: 3px solid var(--color-navy); border-right: 2px solid var(--color-navy); background: var(--color-white);
  }
  .ground .floor, .ground .shaft { border-bottom: 3px solid var(--color-navy); }
  /* a group: the people of one room, set apart from the next by a thin line */
  .group {
    position: relative; display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 10px; border: 0; border-radius: 6px; background: transparent;
    font: inherit; transition: background var(--dur) var(--ease-out);
  }
  button.group { cursor: pointer; }
  button.group:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 0; }
  .group + .group::before { content: ""; position: absolute; left: -1px; top: 6px; bottom: 6px; width: 1px; background: var(--color-blue-300); }
  .group.own { background: var(--color-blue-100); }
  /* the tinted own group needs no line on either side */
  .group.own::before, .group.own + .group::before { display: none; }
  .group.go:hover, .group.pending { background: var(--color-blue-50); }
  .who { position: relative; display: inline-flex; }
  .closed { display: flex; align-items: center; gap: 6px; align-self: center; font-size: 12px; color: var(--color-blue-700); }
  .storey.locked .floor { background: repeating-linear-gradient(135deg, var(--color-surface) 0 6px, var(--color-white) 6px 12px); }
  .earth { height: 6px; background: repeating-linear-gradient(90deg, var(--color-navy) 0 10px, transparent 10px 14px); opacity: 0.25; }
</style>
