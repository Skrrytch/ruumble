<script lang="ts">
  import HeadphoneOff from "@lucide/svelte/icons/headphone-off";
  import MicOff from "@lucide/svelte/icons/mic-off";
  import type { UserView } from "../model/building.ts";

  let { user, talking = false, showName = true }: { user: UserView; talking?: boolean; showName?: boolean } = $props();

  const label = $derived(
    [
      user.name + (user.isSelf ? " (du)" : ""),
      user.selfDeafened ? "taub" : user.selfMuted ? "stumm" : null,
      user.serverMuted ? "vom Server stummgeschaltet" : null,
      talking ? "spricht" : null,
    ]
      .filter(Boolean)
      .join(", "),
  );
</script>

<span class="person" title={label} aria-label={label} role="img">
  <span class="av" class:me={user.isSelf} class:talking aria-hidden="true">
    {user.initials}
    {#if user.serverMuted}
      <span class="flag server" title="Vom Server stummgeschaltet"><MicOff size={12} strokeWidth={2.5} /></span>
    {:else if user.selfDeafened}
      <span class="flag" title="Taub geschaltet"><HeadphoneOff size={12} strokeWidth={2.5} /></span>
    {:else if user.selfMuted}
      <span class="flag" title="Mikrofon stumm"><MicOff size={12} strokeWidth={2.5} /></span>
    {/if}
  </span>
  {#if showName}<span class="name" aria-hidden="true">{user.name}</span>{/if}
</span>

<style>
  .person { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 64px; font-size: 13px; }
  .name { max-width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .av {
    position: relative; width: 44px; height: 44px; flex-shrink: 0; border-radius: 50%;
    background: var(--color-blue-500); color: var(--color-white);
    display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 15px;
  }
  /* eigener Nutzer: das einzige gelbe Element (SPEC 4) */
  .av.me { background: var(--color-navy); box-shadow: 0 0 0 3px var(--color-accent); }
  /* Sprechanzeige: pulsierender Ring in Mittelblau (PLANUNG 2.4) */
  .av.talking::after {
    content: ""; position: absolute; inset: -7px; border-radius: 50%;
    border: 3px solid var(--color-sky); animation: pulse 1.2s var(--ease-out) infinite;
  }
  .av.me.talking::after { inset: -10px; }
  @keyframes pulse { 0% { opacity: 1; transform: scale(0.92); } 100% { opacity: 0.35; transform: scale(1.06); } }
  .flag {
    position: absolute; right: -6px; bottom: -6px; width: 22px; height: 22px; border-radius: 50%;
    background: var(--color-white); border: 1px solid var(--color-blue-300); color: var(--color-navy);
    display: flex; align-items: center; justify-content: center;
  }
  .flag.server { background: var(--color-navy); border-color: var(--color-navy); color: var(--color-white); }
</style>
