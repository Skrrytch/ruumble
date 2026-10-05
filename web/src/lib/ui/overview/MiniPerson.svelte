<script lang="ts">
  import type { UserView } from "../../model/building.ts";
  import { personLabel } from "../../status.ts";

  // A person in the cross-section of the building overview (ADR-0019): a small avatar with the own yellow ring,
  // presence as opacity, a dot for a status; the full label as tooltip. `highlight`: hovered on the directory board.
  let { user, highlight = false }: { user: UserView; highlight?: boolean } = $props();

  let failedUrl = $state<string | null>(null);
  const imageUrl = $derived(user.avatarUrl && user.avatarUrl !== failedUrl ? user.avatarUrl : null);
  const label = $derived(personLabel(user));
</script>

<span class="mini {user.presence}" class:me={user.isSelf} class:highlight title={label} aria-label={label} role="img" data-session={user.session}>
  {#if imageUrl}<img src={imageUrl} alt="" onerror={() => (failedUrl = imageUrl)} />{:else}{user.initials}{/if}
  {#if user.status}<span class="status" aria-hidden="true"></span>{/if}
</span>

<style>
  .mini {
    position: relative; width: 22px; height: 22px; flex-shrink: 0; border-radius: 50%;
    background: var(--color-blue-500); color: var(--color-white);
    display: inline-flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; line-height: 1;
    transition: box-shadow var(--dur) var(--ease-out), transform var(--dur) var(--ease-out);
  }
  .mini img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
  .mini.quiet { opacity: 0.7; }
  .mini.away { opacity: 0.4; }
  .mini.me { background: var(--color-navy); box-shadow: 0 0 0 2px var(--color-accent); }
  .mini.highlight { box-shadow: 0 0 0 3px var(--color-sky); transform: scale(1.15); z-index: 1; }
  .mini.me.highlight { box-shadow: 0 0 0 2px var(--color-accent), 0 0 0 5px var(--color-sky); }
  /* a status: a small white speech dot at the top right, like the bubble at the big avatar */
  .status {
    position: absolute; right: -3px; top: -3px; width: 9px; height: 9px; border-radius: 50% 50% 50% 0;
    background: var(--color-white); border: 1.5px solid var(--color-navy);
  }
</style>
