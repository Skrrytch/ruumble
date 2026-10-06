<script lang="ts">
  // The card at the avatar of a deafened person in the own room (nudge, ADR-0020): instead of the plain tooltip, who
  // it is with their states, and the button that nudges them. Shown while the pointer is on the avatar or the card,
  // in the top layer so neither the room nor the scrolling floor plan clips it. The avatar sits inside the room's
  // button, so the card is placed beside it rather than in it; the keyboard way is the directory board (H).
  import BellRing from "@lucide/svelte/icons/bell-ring";
  import { t } from "../i18n/index.svelte.ts";
  import type { UserView } from "../model/building.ts";
  import { personLabel } from "../status.ts";

  let {
    user,
    anchor,
    talking = false,
    onnudge,
    onenter,
    onleave,
  }: {
    user: UserView;
    /** the avatar it belongs to */
    anchor: HTMLElement;
    talking?: boolean;
    onnudge: (user: UserView) => void;
    onenter: () => void;
    onleave: () => void;
  } = $props();

  let card = $state<HTMLElement | null>(null);

  /** above the avatar, centred, inside the window; below it where there is no room above */
  function place(): void {
    if (!card) return;
    const margin = 8;
    const gap = 6;
    const a = anchor.getBoundingClientRect();
    const { width, height } = card.getBoundingClientRect();
    const left = Math.max(margin, Math.min(a.left + a.width / 2 - width / 2, innerWidth - width - margin));
    const top = a.top - gap - height >= margin ? a.top - gap - height : a.bottom + gap;
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  $effect(() => {
    void anchor;
    if (!card) return;
    card.showPopover();
    place();
    return () => card?.hidePopover();
  });
</script>

<div bind:this={card} class="nudge-card" popover="manual" role="group" aria-label={user.name} onpointerenter={onenter} onpointerleave={onleave}>
  <span class="label">{personLabel(user, talking)}</span>
  <span class="hint">{t().nudge.deafHint}</span>
  <button type="button" class="nudge" aria-label={t().nudge.label(user.name)} onclick={() => onnudge(user)}>
    <BellRing size={16} aria-hidden="true" />{t().nudge.button}
  </button>
</div>

<style>
  .nudge-card {
    position: fixed; inset: auto; margin: 0; box-sizing: border-box; max-width: 260px;
    display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border: 0; border-radius: var(--radius-md);
    background: var(--color-navy); color: var(--color-white); box-shadow: 0 6px 18px rgb(0 56 105 / 0.35); font-size: 13px; line-height: 1.35;
  }
  .label { font-weight: 700; overflow-wrap: anywhere; }
  .hint { color: var(--color-blue-100); font-size: 12px; }
  .nudge {
    align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; margin-top: 4px; min-height: 32px; padding: 0 12px;
    border: 0; border-radius: var(--radius-md); background: var(--color-white); color: var(--color-navy); font: inherit; font-weight: 700; cursor: pointer;
  }
  .nudge:hover { background: var(--color-blue-100); }
  .nudge:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
</style>
