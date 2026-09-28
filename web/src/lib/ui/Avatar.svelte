<script lang="ts">
  import HeadphoneOff from "@lucide/svelte/icons/headphone-off";
  import MicOff from "@lucide/svelte/icons/mic-off";
  import type { UserView } from "../model/building.ts";
  import { t } from "../i18n/index.svelte.ts";

  let { user, talking = false, showName = true }: { user: UserView; talking?: boolean; showName?: boolean } = $props();

  // Bild nicht ladbar → Initialen (AP9)
  let failedUrl = $state<string | null>(null);
  const imageUrl = $derived(user.avatarUrl && user.avatarUrl !== failedUrl ? user.avatarUrl : null);
  // Wer spricht, ist aktiv – egal was idlesecs sagt (AP10)
  const presence = $derived(talking ? "active" : user.presence);

  const p = $derived(t().people);
  const label = $derived(
    [
      user.name + (user.isSelf ? ` (${p.you})` : ""),
      user.selfDeafened ? p.deaf : user.selfMuted ? p.muted : null,
      user.serverMuted ? p.serverMuted : null,
      talking ? p.talking : null,
      presence === "away" ? p.away : presence === "quiet" ? p.quiet(user.idleMinutes) : null,
      user.recording ? p.recording : null,
    ]
      .filter(Boolean)
      .join(", "),
  );
  /** gleiche Wörter wie im Label, als Tooltip am Abzeichen großgeschrieben */
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
</script>

<span class="person" title={label} aria-label={label} role="img">
  <span class="av {presence}" class:me={user.isSelf} class:talking aria-hidden="true">
    {#if imageUrl}
      <img src={imageUrl} alt="" onerror={() => (failedUrl = imageUrl)} />
    {:else}
      {user.initials}
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
  .person { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 64px; font-size: 13px; }
  .name { max-width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .av {
    position: relative; width: 44px; height: 44px; flex-shrink: 0; border-radius: 50%;
    background: var(--color-blue-500); color: var(--color-white);
    display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 15px;
    transition: opacity var(--dur) var(--ease-out);
  }
  .av img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
  /* Anwesenheit (AP10): nur die Deckkraft, damit Ring und Abzeichen gut lesbar bleiben */
  .av.quiet { opacity: 0.7; }
  .av.away { opacity: 0.4; }
  /* eigener Nutzer: das einzige gelbe Element */
  .av.me { background: var(--color-navy); box-shadow: 0 0 0 3px var(--color-accent); }
  /* Sprechanzeige: pulsierender Ring in Mittelblau (docs/internal/charter.md) */
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
  .flag {
    position: absolute; right: -6px; bottom: -6px; width: 22px; height: 22px; border-radius: 50%;
    background: var(--color-white); border: 1px solid var(--color-blue-300); color: var(--color-navy);
    display: flex; align-items: center; justify-content: center;
  }
  .flag.server { background: var(--color-navy); border-color: var(--color-navy); color: var(--color-white); }
</style>
