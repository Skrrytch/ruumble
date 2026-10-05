<script lang="ts">
  import Building from "@lucide/svelte/icons/building";
  import HeadphoneOff from "@lucide/svelte/icons/headphone-off";
  import MessageSquareText from "@lucide/svelte/icons/message-square-text";
  import MicOff from "@lucide/svelte/icons/mic-off";
  import type { UserView } from "../model/building.ts";
  import { t } from "../i18n/index.svelte.ts";
  import { statusLabel } from "../status.ts";

  let { user, talking = false, showName = true }: { user: UserView; talking?: boolean; showName?: boolean } = $props();

  // image not loadable → initials (AP9)
  let failedUrl = $state<string | null>(null);
  const imageUrl = $derived(user.avatarUrl && user.avatarUrl !== failedUrl ? user.avatarUrl : null);
  // whoever is talking is active – whatever idlesecs says (AP10)
  const presence = $derived(talking ? "active" : user.presence);

  const p = $derived(t().people);
  // status (B, ADR-0018): a speech bubble at the top right, its text in the tooltip
  const status = $derived(user.status ? statusLabel(user.status) : null);
  const label = $derived(
    [
      user.name + (user.isSelf ? ` (${p.you})` : ""),
      user.selfDeafened ? p.deaf : user.selfMuted ? p.muted : null,
      user.serverMuted ? p.serverMuted : null,
      talking ? p.talking : null,
      presence === "away" ? p.away : presence === "quiet" ? p.quiet(user.idleMinutes) : null,
      user.recording ? p.recording : null,
      user.usesRuumble ? p.usesRuumble : null,
      status,
    ]
      .filter(Boolean)
      .join(", "),
  );
  /** same words as in the label, capitalised as the badge tooltip */
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
</script>

<span class="person" title={label} aria-label={label} role="img">
  <span class="av {presence}" class:me={user.isSelf} class:talking aria-hidden="true">
    {#if imageUrl}
      <img src={imageUrl} alt="" onerror={() => (failedUrl = imageUrl)} />
    {:else}
      {user.initials}
    {/if}
    {#if user.usesRuumble}
      <span class="house" title={cap(p.usesRuumble)}><Building size={10} strokeWidth={2.5} /></span>
    {/if}
    {#if status}
      <span class="bubble" title={status}><MessageSquareText size={12} strokeWidth={2.5} /></span>
    {/if}
    {#if user.recording}
      <span class="rec" title={cap(p.recording)}></span>
    {/if}
    {#if user.serverMuted}
      <span class="flag server" title={cap(p.serverMuted)}><MicOff size={12} strokeWidth={2.5} /></span>
    {:else if user.selfDeafened}
      <span class="flag" title={cap(p.deaf)}><HeadphoneOff size={12} strokeWidth={2.5} /></span>
    {:else if user.selfMuted}
      <span class="flag" title={cap(p.muted)}><MicOff size={12} strokeWidth={2.5} /></span>
    {/if}
  </span>
  {#if showName}<span class="name" aria-hidden="true">{user.name}</span>{/if}
</span>

<style>
  /* a tile of 60 × 63: avatar, 3 px, a name line of 16 px (PERSON_TILE in model/building.ts) */
  .person { display: flex; flex-direction: column; align-items: center; gap: 3px; width: 60px; font-size: 11px; line-height: 16px; } /* 11 px: names like "SuperUser" fit whole */
  .name { max-width: 60px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .av {
    position: relative; width: 44px; height: 44px; flex-shrink: 0; border-radius: 50%;
    background: var(--color-blue-500); color: var(--color-white);
    display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 15px;
    transition: opacity var(--dur) var(--ease-out);
  }
  .av img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
  /* presence (AP10): only the opacity, so ring and badges stay readable */
  .av.quiet { opacity: 0.7; }
  .av.away { opacity: 0.4; }
  /* own user: the only yellow element */
  .av.me { background: var(--color-navy); box-shadow: 0 0 0 3px var(--color-accent); }
  /* talking indicator: pulsing ring in medium blue (docs/internal/charter.md) */
  .av.talking::after {
    content: ""; position: absolute; inset: -7px; border-radius: 50%;
    border: 3px solid var(--color-sky); animation: pulse 1.2s var(--ease-out) infinite;
  }
  .av.me.talking::after { inset: -10px; }
  @keyframes pulse { 0% { opacity: 1; transform: scale(0.92); } 100% { opacity: 0.35; transform: scale(1.06); } }
  .rec {
    position: absolute; left: -3px; top: -3px; width: 12px; height: 12px; border-radius: 50%;
    background: var(--color-alert); border: 2px solid var(--color-white);
  }
  /* uses Ruumble (plugin connected): a small building at the bottom left, quieter than the state badges */
  .house {
    position: absolute; left: -5px; bottom: -5px; width: 18px; height: 18px; border-radius: 50%;
    background: var(--color-white); border: 1px solid var(--color-blue-300); color: var(--color-blue-500);
    display: flex; align-items: center; justify-content: center;
  }
  .bubble {
    position: absolute; right: -7px; top: -7px; width: 22px; height: 22px; border-radius: 50%;
    background: var(--color-white); border: 1px solid var(--color-navy); color: var(--color-navy);
    display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 2px rgb(0 56 105 / 0.25);
  }
  .flag {
    position: absolute; right: -6px; bottom: -6px; width: 22px; height: 22px; border-radius: 50%;
    background: var(--color-white); border: 1px solid var(--color-blue-300); color: var(--color-navy);
    display: flex; align-items: center; justify-content: center;
  }
  .flag.server { background: var(--color-navy); border-color: var(--color-navy); color: var(--color-white); }
</style>
