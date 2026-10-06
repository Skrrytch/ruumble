<script lang="ts">
  import Ear from "@lucide/svelte/icons/ear";
  import Lock from "@lucide/svelte/icons/lock";
  import Users from "@lucide/svelte/icons/users";
  import VolumeX from "@lucide/svelte/icons/volume-x";
  import { countText, fitPeople, type Room, type Space } from "../model/building.ts";
  import Avatar from "./Avatar.svelte";
  import BoardNotes from "./board/BoardNotes.svelte";
  import DescriptionPopover from "./DescriptionPopover.svelte";
  import Plant from "./Plant.svelte";
  import { t } from "../i18n/index.svelte.ts";
  import { SHORTCUT_KEYS } from "../shortcuts.ts";

  let {
    space,
    variant,
    row = "top",
    title,
    subtitle,
    pending = false,
    readonly = false,
    talking,
    onjoin,
    boardOpen = false,
    boardUnseen = 0,
    ontoggleboard,
    ontend,
  }: {
    space: Space | Room;
    variant: "room" | "corridor" | "open";
    row?: "top" | "bottom";
    /** display name, e.g. "Corridor" instead of the channel name */
    title: string;
    /** line below the title; default: occupancy */
    subtitle?: string;
    pending?: boolean;
    /** preview without own user: nothing can be entered */
    readonly?: boolean;
    talking: Record<number, boolean>;
    onjoin: (channelId: number) => void;
    /** board sidebar open (for the toggle in the user's own room, ADR-0011) */
    boardOpen?: boolean;
    /** posts by others not seen yet in this room: an extra note on the closed toggle */
    boardUnseen?: number;
    ontoggleboard?: () => void;
    /** open the care dialog of this room or floor (plant, ADR-0014) */
    ontend?: () => void;
  } = $props();


  const room = $derived("grow" in space ? space : null);
  // board graphic only in the user's own room, as the toggle for the sidebar
  const boardToggle = $derived(!!room && space.isSelf && !readonly && !!ontoggleboard);
  const boardFresh = $derived(!boardOpen && boardUnseen > 0);
  const boardLabel = $derived(boardOpen ? t().board.hide : boardFresh ? t().board.showUnseen(boardUnseen) : t().board.show);
  const disabled = $derived((space.locked && !space.isSelf) || readonly);
  // the plant: decoration for everyone, a button for whoever may tend the stored data here
  const tendable = $derived(space.canTend && !readonly && !!ontend);
  const tendLabel = $derived(variant === "room" ? t().care.roomPlant(space.name) : t().care.floorPlant(space.name));
  const ariaLabel = $derived.by(() => {
    const s = t().space;
    const name = variant === "corridor" ? s.corridorName(space.name) : space.name;
    return name + (space.isSelf ? s.here : readonly ? "" : disabled ? s.noAccess : pending ? s.entering : s.enter);
  });

  // rooms: as many people as fit into their area, the rest behind a "+n" tile (design "Grundriss: Flurseite")
  let peopleWidth = $state(0);
  let peopleHeight = $state(0);
  /** the board toggle sits left of the door plate */
  let plateWidth = $state(0);
  // the description from Mumble behind the binders: in a room left of the board (or of the door plate), in the
  // corridor left of the plant, in an open floor top right
  const descriptionName = $derived(variant === "corridor" ? t().space.corridorName(space.name) : space.name);
  const BOARD_TOGGLE_WIDTH = 40;
  const BINDERS_WIDTH = 34;
  const descriptionRight = $derived(variant === "room" ? `${14 + plateWidth + 6 + (boardToggle ? BOARD_TOGGLE_WIDTH + 2 : 0)}px` : undefined);
  /** room width the door plate leaves for the door, the board and the binders */
  const plateReserve = $derived(90 + (boardToggle ? BOARD_TOGGLE_WIDTH : 0) + (space.description ? BINDERS_WIDTH : 0));

  const fit = $derived(variant === "room" ? fitPeople(space.users, peopleWidth, peopleHeight) : { shown: space.users, hidden: [] });
  const doorState = $derived(disabled && !readonly ? "closed" : "ajar");
  // "entering …" only when Mumble takes a while: a quick move would only make it flicker (the aria-label says it at once)
  const ENTERING_TEXT_AFTER_MS = 600;
  let slow = $state(false);
  $effect(() => {
    if (!pending) return;
    const timer = setTimeout(() => (slow = true), ENTERING_TEXT_AFTER_MS);
    return () => {
      clearTimeout(timer);
      slow = false;
    };
  });
  const countLine = $derived(pending && slow ? t().space.enteringText : (subtitle ?? countText(space.users.length)));

  function click() {
    if (space.isSelf || disabled || pending) return;
    onjoin(space.channelId);
  }
</script>

{#snippet icons()}
  {#if room?.muted}<span class="icon" title={t().space.mutedRoom}><VolumeX size={variant === "room" ? 16 : 18} /></span>{/if}
  {#if space.listeners.length > 0}
    <span class="icon" title={t().people.listening(space.listeners.length)}><Ear size={variant === "room" ? 16 : 18} /></span>
  {/if}
  {#if space.locked && !space.isSelf}<span class="icon" title={t().space.noAccessTitle}><Lock size={variant === "room" ? 14 : 16} /></span>{/if}
  {#if space.recording}<span class="rec" title={t().space.recording}>{t().space.recordingBadge}</span>{/if}
{/snippet}

<div class="wrap wrap-{variant}" class:lower={row === "bottom"} style:flex-grow={room ? room.grow : undefined} style:--plate-reserve="{plateReserve}px">
<button
  type="button"
  class="room {variant}"
  class:raster={variant === "corridor"}
  class:mine={space.isSelf}
  class:locked={disabled && !readonly}
  class:readonly
  class:pending
  class:slow={pending && slow}
  aria-label={ariaLabel}
  aria-disabled={disabled || space.isSelf || undefined}
  aria-busy={pending || undefined}
  data-channel={space.channelId}
  onclick={click}
>
  {#if variant === "room"}
    <!-- door at the corridor wall: the white strip cuts the opening into the wall; mirrored in the lower row.
         Ajar (45°) where the user may enter, closed where Mumble does not let them in -->
    <svg class="door {doorState}" width="48" height="52" viewBox="0 0 48 52" fill="none" aria-hidden="true">
      <rect x="2" y="48" width="44" height="4" class="opening" />
      <path d="M46 50A44 44 0 0 0 2 6" class="swing" />
      <path d="M2 50H46" class="leaf" />
    </svg>
    <span class="people" bind:clientWidth={peopleWidth} bind:clientHeight={peopleHeight}>
      {#each fit.shown as user (user.session)}
        <Avatar {user} talking={talking[user.session] ?? false} />
      {/each}
      {#if fit.hidden.length}
        {@const names = t().space.morePeople(fit.hidden.map((u) => u.name).join(", "))}
        <span class="person more" title={names} aria-label={names} role="img"><span class="more-tile" aria-hidden="true">+{fit.hidden.length}</span></span>
      {/if}
    </span>
    <!-- door plate on the corridor side, right-aligned; the full name in the tooltip -->
    <span class="plate" bind:clientWidth={plateWidth}>
      <span class="title">{@render icons()}<span class="name" title={title}>{title}</span>{#if space.users.length}<span class="mini-count"><Users size={12} />{space.users.length}</span>{/if}</span>
      <span class="count">{countLine}</span>
    </span>
  {:else}
    <!-- in the corridor the content stays in view while the floor plan scrolls sideways -->
    <span class="content">
    <span class="label">
      <span class="title">
        {title}
        {@render icons()}
      </span>
      <span class="count">{countLine}</span>
    </span>
    {#if space.users.length > 0}
      <span class="people">
        {#each space.users as user (user.session)}
          <Avatar {user} talking={talking[user.session] ?? false} />
        {/each}
      </span>
    {/if}
    </span>
  {/if}
</button>
{#snippet notesToggle()}
  <button
    type="button"
    class="notes toggle"
    aria-label={boardLabel}
    title={t().board.withKey(boardLabel, SHORTCUT_KEYS.toggleBoard)}
    aria-keyshortcuts={SHORTCUT_KEYS.toggleBoard.toUpperCase()}
    aria-expanded={boardOpen}
    aria-controls="board-panel"
    style:right={variant === "room" ? `${14 + plateWidth + 6}px` : undefined}
    onclick={ontoggleboard}
  >
    <!-- remounted for every further unseen post, so the new note lands again -->
    {#key boardFresh && boardUnseen}<BoardNotes fresh={boardFresh} />{/key}
  </button>
{/snippet}
{#snippet plant()}
  {#if tendable}
    <button type="button" class="plant-spot plant-{variant} tend" aria-label={tendLabel} title={tendLabel} onclick={ontend}><Plant size={variant === "room" ? 22 : 26} subtle /></button>
  {:else}
    <span class="plant-spot plant-{variant}"><Plant size={variant === "room" ? 22 : 26} subtle /></span>
  {/if}
{/snippet}
{#if boardToggle}{@render notesToggle()}{/if}
{#if space.description}
  <span class="description-spot description-{variant}" style:right={descriptionRight}>
    <DescriptionPopover channelId={space.channelId} name={descriptionName} description={space.description} size={variant === "room" ? 24 : 28} />
  </span>
{/if}
{@render plant()}
</div>

<style>
  /* basis = horizontal padding of the room, so the widths are distributed as without the wrapper */
  .wrap { position: relative; display: flex; flex-basis: 44px; min-width: 0; }
  /* the width follows the people in the room (roomGrow): changes glide; names stay readable */
  .wrap-room { min-width: 190px; transition: flex-grow var(--dur-slow) var(--ease-out); container-type: inline-size; }
  .content { display: contents; }
  .room.corridor .content { position: sticky; left: 22px; display: flex; align-items: center; gap: 24px; min-width: 0; }
  .wrap-corridor { flex: none; }
  .wrap-open { flex-grow: 1; }
  .room {
    position: relative; border: 0; margin: 0; padding: 20px 22px; background: var(--color-white);
    text-align: left; cursor: pointer; display: flex; flex-direction: column; align-items: flex-start; gap: 14px;
    flex: 1 1 auto; min-width: 0; width: 100%; transition: background var(--dur) var(--ease-out);
  }
  .room:hover { background: var(--color-surface); }
  .room:focus-visible { outline: 3px solid var(--color-sky); outline-offset: -7px; }
  .room.mine, .room.mine:hover { background: var(--color-blue-100); cursor: default; }
  .room.locked { cursor: not-allowed; }
  .room.readonly { cursor: default; }
  .room.locked:hover { background: var(--color-white); }
  .room.pending { cursor: progress; }
  .room.pending.slow .count { color: var(--color-blue-500); }

  /* Rooms (design "Grundriss: Flurseite"): a 48 px door strip on the corridor side holds the plant behind the door,
     the door and, right-aligned, the board and the door plate; the people fill the rest from the far wall.
     Upper row: corridor side below; lower row (.lower): mirrored. */
  .wrap-room > .room { padding: 12px 14px calc(var(--door-strip) + 8px); gap: 0; }
  .wrap-room.lower > .room { padding: calc(var(--door-strip) + 8px) 14px 12px; }
  .door { position: absolute; left: 34px; bottom: calc(-1 * var(--wall)); z-index: 2; overflow: visible; }
  .lower .door { bottom: auto; top: calc(-1 * var(--wall)); transform: scaleY(-1); }
  .door .opening { fill: var(--color-white); }
  /* the leaf turns about its hinge (2, 50); the swing shows the part of the quarter circle (length 69.12) it has opened */
  .door .leaf {
    stroke: var(--color-blue-700); stroke-width: 2; stroke-linecap: round;
    transform-box: view-box; transform-origin: 2px 50px; transform: rotate(-45deg);
  }
  .door .swing { stroke: var(--color-blue-300); stroke-width: 1.5; stroke-dasharray: 69.12; stroke-dashoffset: 34.56; }
  .door.closed .leaf { transform: none; stroke: var(--color-blue-500); stroke-width: 3; stroke-linecap: butt; }
  .door.closed .swing { stroke-dashoffset: 69.12; }
  .wrap-room .people { flex: 1 1 auto; min-height: 0; width: 100%; display: flex; flex-wrap: wrap; justify-content: center; align-content: center; gap: 6px 3px; }
  /* the people stand in the middle of their area: one alone, two side by side, every row centred */
  /* no clipping: fitPeople renders only the tiles that fit, and the rings of the own and talking people reach beyond the tile */
  .more { display: flex; flex-direction: column; align-items: center; width: 60px; height: 63px; }
  .more-tile {
    width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    background: var(--color-blue-50); color: var(--color-navy); font-size: 14px; font-weight: 700;
  }
  .plate {
    position: absolute; right: 14px; bottom: 8px; max-width: calc(100% - 14px - var(--plate-reserve, 90px));
    display: flex; flex-direction: column; align-items: flex-end; text-align: right; line-height: 1.25;
  }
  .lower .plate { bottom: auto; top: 8px; }
  .wrap-room .title { gap: 6px; flex-wrap: nowrap; max-width: 100%; font-size: 15px; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .wrap-room .count { margin-top: 1px; font-size: 12px; color: var(--color-blue-700); }
  .mini-count { display: none; align-items: center; gap: 2px; flex: none; font-size: 12px; font-weight: 700; color: var(--color-blue-700); }
  /* narrow rooms: the count moves behind the name, the board gets smaller */
  @container (max-width: 220px) {
    .wrap-room .count { display: none; }
    .mini-count { display: inline-flex; }
  }
  @container (max-width: 170px) {
    .notes.toggle :global(svg) { width: 20px; height: 16px; }
  }

  /* board toggle without a box: only the notes, on hover they lift slightly. In a room left of the door plate
     (its right offset comes from the plate's width), in the open floor top right */
  .notes.toggle {
    position: absolute; top: 12px; right: 12px; border: 0; background: transparent; padding: 4px; margin: -4px; border-radius: var(--radius-md);
    min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center; cursor: pointer;
    transition: transform var(--dur) var(--ease-out);
  }
  .wrap-room .notes.toggle { top: auto; bottom: 2px; min-width: 40px; min-height: 40px; }
  .wrap-room.lower .notes.toggle { bottom: auto; top: 2px; }
  .wrap-room .notes.toggle :global(svg) { width: 34px; height: 24px; }
  .notes.toggle:hover { transform: translateY(-2px) rotate(-2deg) scale(1.06); }
  .notes.toggle:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 0; }

  /* binders with the description: in the door strip, in the corridor left of the plant, top right in an open floor */
  .description-spot { position: absolute; display: flex; }
  .description-spot.description-room { bottom: 2px; }
  .lower .description-spot.description-room { bottom: auto; top: 2px; }
  .description-spot.description-corridor { top: 50%; right: 64px; transform: translateY(-50%); }
  .description-spot.description-open { top: 12px; right: 12px; }

  /* plant (care, ADR-0014): in a room behind the door in the door strip, bottom right in an open floor, at the
     right end of the corridor */
  .plant-spot {
    position: absolute; right: 10px; bottom: 8px; display: flex; align-items: flex-end; justify-content: center;
    min-width: 44px; min-height: 44px; padding: 2px; border: 0; background: transparent; border-radius: var(--radius-md);
    pointer-events: none;
  }
  .plant-spot.plant-room { left: 4px; right: auto; bottom: 8px; min-width: 30px; min-height: 32px; width: 30px; height: 32px; padding: 0; align-items: center; }
  .lower .plant-spot.plant-room { bottom: auto; top: 8px; }
  .plant-spot.plant-corridor { bottom: auto; top: 50%; right: 14px; transform: translateY(-50%); }
  .plant-spot.tend { pointer-events: auto; cursor: pointer; transition: transform var(--dur) var(--ease-out); }
  .plant-spot.tend:hover { transform: translateY(-2px) rotate(3deg) scale(1.08); }
  .plant-spot.plant-corridor.tend:hover { transform: translateY(calc(-50% - 2px)) rotate(3deg) scale(1.08); }
  .plant-spot.tend:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 0; }

  .title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 16px; font-weight: 700; }
  .icon { display: inline-flex; flex: none; color: var(--color-blue-500); }
  .rec { font-size: 12px; font-weight: 700; color: var(--color-alert); white-space: nowrap; }
  .count { font-size: 13px; color: var(--color-blue-700); display: block; margin-top: 4px; }
  .people { display: flex; flex-wrap: wrap; gap: 12px; }

  .raster {
    background-color: var(--color-white);
    background-image: radial-gradient(var(--raster-dot) 2px, transparent 2.4px);
    background-size: 10px 10px;
  }
  .room.corridor { height: var(--corridor-height); flex: none; flex-direction: row; align-items: center; gap: 24px; }
  .room.corridor:hover { background-color: var(--color-surface); }
  .room.corridor.mine { background-color: var(--color-blue-100); }
  .room.corridor .label { min-width: 120px; }
  .room.open { flex-grow: 1; } /* inside .wrap-open */
  .room.open .title { font-size: 20px; }
</style>
