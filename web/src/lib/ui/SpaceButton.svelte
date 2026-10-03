<script lang="ts">
  import Ear from "@lucide/svelte/icons/ear";
  import Lock from "@lucide/svelte/icons/lock";
  import VolumeX from "@lucide/svelte/icons/volume-x";
  import { countText, type Room, type Space } from "../model/building.ts";
  import Avatar from "./Avatar.svelte";
  import BoardNotes from "./board/BoardNotes.svelte";
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

  function click() {
    if (space.isSelf || disabled || pending) return;
    onjoin(space.channelId);
  }
</script>

<div class="wrap wrap-{variant}" style:flex-grow={room ? room.grow : undefined}>
<button
  type="button"
  class="room {variant}"
  class:raster={variant === "corridor"}
  class:mine={space.isSelf}
  class:locked={disabled && !readonly}
  class:readonly
  class:pending
  aria-label={ariaLabel}
  aria-disabled={disabled || space.isSelf || undefined}
  aria-busy={pending || undefined}
  data-channel={space.channelId}
  onclick={click}
>
  {#if variant === "room"}
    <span class="door" aria-hidden="true"></span>
    <svg class="arc" aria-hidden="true" width="48" height="48" viewBox="0 0 48 48">
      {#if row === "top"}
        <path d="M1 48 V1 A47 47 0 0 1 48 48" />
      {:else}
        <path d="M1 0 V47 A47 47 0 0 0 48 0" />
      {/if}
    </svg>
  {/if}
  <!-- in the corridor the content stays in view while the floor plan scrolls sideways -->
  <span class="content">
  <span class="label">
    <span class="title">
      {title}
      {#if room?.muted}<span class="icon" title={t().space.mutedRoom}><VolumeX size={18} /></span>{/if}
      {#if space.listeners.length > 0}
        <span class="icon" title={t().people.listening(space.listeners.length)}>
          <Ear size={18} />
        </span>
      {/if}
      {#if space.locked && !space.isSelf}<span class="icon" title={t().space.noAccessTitle}><Lock size={16} /></span>{/if}
      {#if space.recording}<span class="rec" title={t().space.recording}>{t().space.recordingBadge}</span>{/if}
    </span>
    <span class="count">{pending ? t().space.enteringText : (subtitle ?? countText(space.users.length))}</span>
  </span>
  {#if space.users.length > 0}
    <span class="people">
      {#each space.users as user (user.session)}
        <Avatar {user} talking={talking[user.session] ?? false} />
      {/each}
    </span>
  {/if}
  </span>
</button>
{#if boardToggle}
  <button
    type="button"
    class="notes toggle"
    aria-label={boardLabel}
    title={t().board.withKey(boardLabel, SHORTCUT_KEYS.toggleBoard)}
    aria-keyshortcuts={SHORTCUT_KEYS.toggleBoard.toUpperCase()}
    aria-expanded={boardOpen}
    aria-controls="board-panel"
    onclick={ontoggleboard}
  >
    <!-- remounted for every further unseen post, so the new note lands again -->
    {#key boardFresh && boardUnseen}<BoardNotes fresh={boardFresh} />{/key}
  </button>
{/if}
{#if tendable}
  <button type="button" class="plant-spot plant-{variant} tend" aria-label={tendLabel} title={tendLabel} onclick={ontend}><Plant size={26} subtle /></button>
{:else}
  <span class="plant-spot plant-{variant}"><Plant size={26} subtle /></span>
{/if}
</div>

<style>
  /* basis = horizontal padding of the room, so the widths are distributed as without the wrapper */
  .wrap { position: relative; display: flex; flex-basis: 44px; min-width: 0; }
  /* the width follows the people in the room (roomGrow): changes glide; names stay readable */
  .wrap-room { min-width: 150px; transition: flex-grow var(--dur-slow) var(--ease-out); }
  .content { display: contents; }
  .room.corridor .content { position: sticky; left: 22px; display: flex; align-items: center; gap: 24px; min-width: 0; }
  .wrap-corridor { flex: none; }
  .wrap-open { flex-grow: 1; }
  .room {
    position: relative; border: 0; margin: 0; padding: 20px 22px; background: var(--color-white);
    text-align: left; cursor: pointer; display: flex; flex-direction: column; align-items: flex-start; gap: 14px;
    flex: 1 1 auto; min-width: 0; width: 100%; transition: background var(--dur) var(--ease-out);
  }
  /* board graphic top right (ADR-0011, variant B) */
  /* toggle without a box: only the notes, on hover they lift slightly */
  .notes.toggle {
    position: absolute; top: 12px; right: 12px; border: 0; background: transparent; padding: 4px; margin: -4px; border-radius: var(--radius-md);
    min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center; cursor: pointer;
    transition: transform var(--dur) var(--ease-out);
  }
  .notes.toggle:hover { transform: translateY(-2px) rotate(-2deg) scale(1.06); }
  .notes.toggle:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 0; }
  /* plant (care, ADR-0014): bottom right in a room and an open floor, at the right end of the corridor */
  .plant-spot {
    position: absolute; right: 10px; bottom: 8px; display: flex; align-items: flex-end; justify-content: center;
    min-width: 44px; min-height: 44px; padding: 2px; border: 0; background: transparent; border-radius: var(--radius-md);
    pointer-events: none;
  }
  .plant-spot.plant-corridor { bottom: auto; top: 50%; right: 14px; transform: translateY(-50%); }
  .plant-spot.tend { pointer-events: auto; cursor: pointer; transition: transform var(--dur) var(--ease-out); }
  .plant-spot.tend:hover { transform: translateY(-2px) rotate(3deg) scale(1.08); }
  .plant-spot.plant-corridor.tend:hover { transform: translateY(calc(-50% - 2px)) rotate(3deg) scale(1.08); }
  .plant-spot.tend:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 0; }
  .room:hover { background: var(--color-surface); }
  .room:focus-visible { outline: 3px solid var(--color-sky); outline-offset: -7px; }
  .room.mine, .room.mine:hover { background: var(--color-blue-100); cursor: default; }
  .room.locked { cursor: not-allowed; }
  .room.readonly { cursor: default; }
  .room.locked:hover { background: var(--color-white); }
  .room.pending { cursor: progress; }
  .room.pending .count { color: var(--color-blue-500); }

  .door { position: absolute; left: 28px; width: 48px; height: var(--wall); background: var(--color-white); }
  :global(.row.top) .door { bottom: calc(-1 * var(--wall)); }
  :global(.row.bottom) .door { top: calc(-1 * var(--wall)); }
  .arc { position: absolute; left: 28px; fill: none; stroke: var(--color-blue-300); stroke-width: 1.5; }
  :global(.row.top) .arc { bottom: 0; }
  :global(.row.bottom) .arc { top: 0; }
  :global(.row.bottom) .room { padding-top: 56px; }

  .title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 16px; font-weight: 700; }
  .icon { display: inline-flex; color: var(--color-blue-500); }
  .rec { font-size: 12px; font-weight: 700; color: var(--color-alert); }
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
