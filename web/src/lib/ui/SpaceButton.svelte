<script lang="ts">
  import Ear from "@lucide/svelte/icons/ear";
  import Lock from "@lucide/svelte/icons/lock";
  import VolumeX from "@lucide/svelte/icons/volume-x";
  import { countText, type Room, type Space } from "../model/building.ts";
  import Avatar from "./Avatar.svelte";

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
  }: {
    space: Space | Room;
    variant: "room" | "corridor" | "open";
    row?: "top" | "bottom";
    /** Anzeigename, z. B. „Flur“ statt des Kanalnamens */
    title: string;
    /** Zeile unter dem Titel; Standard: Belegung */
    subtitle?: string;
    pending?: boolean;
    /** Vorschau ohne eigenen Nutzer: nichts betretbar */
    readonly?: boolean;
    talking: Record<number, boolean>;
    onjoin: (channelId: number) => void;
  } = $props();

  const room = $derived("grow" in space ? space : null);
  const disabled = $derived((space.locked && !space.isSelf) || readonly);
  const ariaLabel = $derived(
    `${variant === "corridor" ? `Flur ${space.name}` : space.name}` +
      (space.isSelf ? " – du bist hier" : readonly ? "" : disabled ? " – kein Zutritt" : pending ? " – wird betreten" : " betreten"),
  );

  function click() {
    if (space.isSelf || disabled || pending) return;
    onjoin(space.channelId);
  }
</script>

<button
  type="button"
  class="room {variant}"
  class:raster={variant === "corridor"}
  class:mine={space.isSelf}
  class:locked={disabled && !readonly}
  class:readonly
  class:pending
  style:flex-grow={room ? room.grow : undefined}
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
  <span class="label">
    <span class="title">
      {title}
      {#if room?.muted}<span class="icon" title="Stummer Raum"><VolumeX size={18} /></span>{/if}
      {#if space.listeners.length > 0}
        <span class="icon" title={space.listeners.length === 1 ? "1 Person hört mit" : `${space.listeners.length} Personen hören mit`}>
          <Ear size={18} />
        </span>
      {/if}
      {#if space.locked && !space.isSelf}<span class="icon" title="Kein Zutritt"><Lock size={16} /></span>{/if}
    </span>
    <span class="count">{pending ? "wird betreten …" : (subtitle ?? countText(space.users.length))}</span>
  </span>
  {#if space.users.length > 0}
    <span class="people">
      {#each space.users as user (user.session)}
        <Avatar {user} talking={talking[user.session] ?? false} />
      {/each}
    </span>
  {/if}
</button>

<style>
  .room {
    position: relative; border: 0; margin: 0; padding: 20px 22px; background: var(--color-white);
    text-align: left; cursor: pointer; display: flex; flex-direction: column; align-items: flex-start; gap: 14px;
    flex-basis: 0; min-width: 0; transition: background var(--dur) var(--ease-out);
  }
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
  .count { font-size: 13px; color: var(--color-blue-700); display: block; margin-top: 4px; }
  .people { display: flex; flex-wrap: wrap; gap: 12px; }

  .raster {
    background-color: var(--color-white);
    background-image: radial-gradient(var(--raster-dot) 2px, transparent 2.4px);
    background-size: 10px 10px;
  }
  .room.corridor { height: 110px; flex: none; flex-direction: row; align-items: center; gap: 24px; }
  .room.corridor:hover { background-color: var(--color-surface); }
  .room.corridor.mine { background-color: var(--color-blue-100); }
  .room.corridor .label { min-width: 120px; }
  .room.open { flex-grow: 1; }
  .room.open .title { font-size: 20px; }
</style>
