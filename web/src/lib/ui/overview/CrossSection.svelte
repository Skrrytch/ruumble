<script lang="ts">
  import Lock from "@lucide/svelte/icons/lock";
  import { t } from "../../i18n/index.svelte.ts";
  import type { Building, Floor, Space } from "../../model/building.ts";
  import Lantern from "../Lantern.svelte";
  import Plant from "../Plant.svelte";
  import Cypress from "./Cypress.svelte";
  import MiniPerson from "./MiniPerson.svelte";

  // The building from the side (ADR-0019): the roof with the server's name, the floors stacked like in the elevator
  // (highest on top), the elevator shaft on the left with the own floor's cell tinted, the entrance at the bottom.
  // On every floor the people stand in groups, one per occupied room or corridor, set apart by a thin line; rooms
  // are not drawn and not named (the name is in the tooltip). A group is a button to move there, the floor badge
  // shows that floor. Outside, on the street: a lantern (building maintenance) on the left, two plants (building care)
  // beside the steps to the front door, buttons for building admins and decoration for everyone else; on the right a
  // cypress whose crown stands in front of the wall.
  let {
    building,
    readonly,
    pendingChannel,
    highlight,
    onhover,
    onvisit,
    onfloor,
    ontend,
    onmaintain,
  }: {
    building: Building;
    readonly: boolean;
    pendingChannel: number | null;
    /** session hovered on the directory board */
    highlight: number | null;
    onhover: (session: number | null) => void;
    onvisit: (channelId: number) => void;
    onfloor: (floor: Floor) => void;
    /** set for building admins: building care and building maintenance */
    ontend?: () => void;
    onmaintain?: () => void;
  } = $props();

  const storeys = $derived([...building.floors].reverse());
  const canVisit = (space: Space) => !readonly && !space.isSelf && !space.locked;
  /** the occupied places of a floor: its rooms in Mumble's order, then the corridor (or the open floor) */
  const groupsOf = (f: Floor): { space: Space; name: string }[] =>
    [...f.rooms.map((r) => ({ space: r as Space, name: r.name })), { space: f.corridor, name: f.open ? f.name : t().common.corridor }].filter((g) => g.space.users.length > 0);
  const entrance = $derived<Space>({ channelId: 0, name: t().common.entrance, users: building.entrance, isSelf: building.self?.kind === "entrance", locked: false, listeners: [], recording: false, canTend: false, description: "" });
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
    <div class="shaft"></div>
    <div class="floor">
      <!-- the front door: canopy, frame, a door with two panels, fanlight and handle -->
      <svg class="front-door" width="34" height="48" viewBox="0 0 34 48" aria-hidden="true">
        <rect x="0" y="0" width="34" height="4" rx="1" class="canopy" />
        <rect x="3" y="4" width="28" height="44" class="frame" />
        <rect x="6" y="7" width="22" height="8" rx="4" class="fanlight" />
        <rect x="6" y="17" width="22" height="31" class="leaf" />
        <rect x="9" y="20" width="16" height="10" rx="1" class="panel" />
        <rect x="9" y="33" width="16" height="12" rx="1" class="panel" />
        <circle cx="24.5" cy="32" r="1.6" class="handle" />
      </svg>
      {#if building.entrance.length}{@render people(entrance, t().common.entrance)}{/if}
    </div>
  </div>
  <!-- the building stands on a plinth; steps lead from the street up to the front door, a plant on either side -->
  <div class="plinth">
    <span class="step" style:--step="0" aria-hidden="true"></span>
    <span class="step" style:--step="1" aria-hidden="true"></span>
    <span class="step" style:--step="2" aria-hidden="true"></span>
    {#if ontend}
      <button type="button" class="porch left tend" aria-label={t().care.buildingPlant} title={t().care.buildingPlant} onclick={ontend}><Plant size={36} /></button>
      <!-- the same action twice: only the left one is a stop for the keyboard and screen readers -->
      <button type="button" class="porch right tend" tabindex="-1" aria-hidden="true" title={t().care.buildingPlant} onclick={ontend}><Plant size={36} /></button>
    {:else}
      <span class="porch left" aria-hidden="true"><Plant size={36} /></span>
      <span class="porch right" aria-hidden="true"><Plant size={36} /></span>
    {/if}
  </div>
  <div class="ground-line" aria-hidden="true"></div>
  <!-- outside, on the ground line: the lantern (maintenance) on the left, the cypress in front of the right wall -->
  {#if onmaintain}
    <button type="button" class="yard left tend" aria-label={t().maintenance.title} title={t().maintenance.title} onclick={onmaintain}><Lantern /></button>
  {:else}
    <span class="yard left" aria-hidden="true"><Lantern /></span>
  {/if}
  <span class="tree" aria-hidden="true"><Cypress height={150} /></span>
</section>

<style>
  /* the building stands a little in from the sides, so the ground line reaches beyond its walls */
  .section { position: relative; display: flex; flex-direction: column; min-width: 0; padding: 0 0 12px; }
  .roof, .storey { margin: 0 44px; }
  /* the lantern stands on the ground line, left of the building */
  .yard { position: absolute; bottom: 15px; display: flex; align-items: flex-end; padding: 0; border: 0; background: none; border-radius: var(--radius-md); }
  .yard.left { left: 8px; }
  button.yard, button.porch { cursor: pointer; transition: transform var(--dur) var(--ease-out); }
  button.yard:hover, button.porch:hover { transform: translateY(-2px) rotate(2deg) scale(1.08); }
  button.yard:focus-visible, button.porch:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
  /* the cypress: on the ground line beside the building, its trunk (31 px in from the tree's right edge) clear of the
     right wall (44 px in from the edge), only the crown reaches in front of the wall */
  .tree { position: absolute; bottom: 15px; right: 3px; z-index: 1; display: flex; pointer-events: none; }
  /* the roof: a flat gable in navy with the building's name, flush with the outer walls (shaft to right wall) */
  .roof {
    height: 50px; background: var(--color-navy); color: var(--color-white);
    clip-path: polygon(0 100%, 50% 0, 100% 100%); display: flex; align-items: flex-end; justify-content: center; padding-bottom: 8px;
    font-size: 13px; font-weight: 700; letter-spacing: 0.04em;
  }
  .roof span { max-width: 50%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .storey { display: grid; grid-template-columns: 40px minmax(0, 1fr); }
  /* the elevator shaft: a grey strip through every floor */
  .shaft { position: relative; display: flex; align-items: center; justify-content: center; background: var(--color-surface); border-left: 2px solid var(--color-navy); border-top: 3px solid var(--color-navy); }
  /* the own floor: its cell in the shaft is tinted, like the own room in the floor plan */
  .storey.mine .shaft { background: var(--color-blue-100); }
  .fbadge {
    position: relative; width: 26px; height: 26px; border-radius: 50%; border: 2px solid var(--color-navy); background: var(--color-white); padding: 0;
    color: var(--color-navy); font: inherit; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; cursor: pointer;
  }
  .fbadge:hover:not(:disabled) { background: var(--color-blue-100); }
  .fbadge:disabled { opacity: 0.5; cursor: not-allowed; }
  .fbadge:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
  .storey.mine .fbadge { box-shadow: 0 0 0 2px var(--color-accent); }
  /* a floor: the slab on top, the outer wall on the right; the people stand on the slab below */
  .floor {
    display: flex; flex-wrap: wrap; align-items: flex-end; min-width: 0; min-height: 52px; padding: 8px 10px 6px;
    border-top: 3px solid var(--color-navy); border-right: 2px solid var(--color-navy); background: var(--color-white);
  }
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
  /* the ground line of a section drawing: the building stands on it, it reaches beyond the walls */
  .ground-line { height: 3px; background: var(--color-navy); }
  /* the entrance storey: the door stands on the slab, at the left next to the shaft */
  .ground .floor { padding-bottom: 0; align-items: flex-end; gap: 6px; }
  .front-door { display: block; flex: none; margin-right: 6px; }
  /* the door stands on the slab, the people in the middle of the storey like on every other floor */
  .ground .group { align-self: center; }
  .front-door .canopy { fill: var(--color-navy); }
  .front-door .frame { fill: var(--color-navy); }
  .front-door .fanlight { fill: var(--color-blue-100); }
  .front-door .leaf { fill: var(--color-blue-500); }
  .front-door .panel { fill: none; stroke: var(--color-blue-100); stroke-width: 1; opacity: 0.7; }
  .front-door .handle { fill: var(--color-white); }
  /* plinth below the entrance storey: 15 px high, three steps centred under the door: its centre is at shaft 40 +
     padding 10 + half the door 17 − the plinth's wall 2 = 65 px; each step is 10 px wider than the one above */
  .plinth {
    position: relative; height: 15px; margin: 0 44px; border-top: 3px solid var(--color-navy);
    border-left: 2px solid var(--color-navy); border-right: 2px solid var(--color-navy); background: var(--color-surface);
  }
  /* the plants beside the steps stand on the street in front of the plinth, reaching up the entrance storey: 3 px clear
     of the lowest step (from 41 to 89 px, see .step) */
  /* in front of the building: the pot's base (2.4 px above the bottom of the drawing) 5–6 px below the street level */
  .porch { position: absolute; bottom: -8px; z-index: 1; display: flex; padding: 0; border: 0; background: none; border-radius: var(--radius-md); }
  .porch.left { left: 2px; }
  .porch.right { left: 92px; }
  .step {
    position: absolute; top: calc(var(--step) * 5px - 3px); left: calc(65px - 14px - var(--step) * 5px); width: calc(28px + var(--step) * 10px);
    height: 5px; background: var(--color-white); border: 1.5px solid var(--color-navy); border-bottom: 0; box-sizing: border-box;
  }
</style>
