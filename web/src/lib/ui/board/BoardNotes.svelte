<script lang="ts">
  // board graphic in the room (ADR-0011, variant B): two notes with pins, right-aligned.
  // Only in the user's own room, as the toggle for the sidebar. It does not show how much is pinned there,
  // only `fresh`: posts by others the user has not seen yet add a yellow note in front (it lands and the stack wobbles).
  let { fresh = false }: { fresh?: boolean } = $props();
</script>

<svg class="notes" class:fresh width="56" height="38" viewBox="0 0 44 30" aria-hidden="true">
  <g transform="rotate(-7 12 15)">
    <rect x="3" y="4" width="18" height="22" class="paper" />
    <line x1="7" y1="13" x2="17" y2="13" class="line" /><line x1="7" y1="17" x2="15" y2="17" class="line" /><line x1="7" y1="21" x2="13" y2="21" class="line" />
    <circle cx="12" cy="6.5" r="2.8" class="pin a" />
  </g>
  <g transform="rotate(6 31 15)">
    <rect x="22" y="5" width="18" height="22" class="paper" />
    <line x1="26" y1="14" x2="36" y2="14" class="line" /><line x1="26" y1="18" x2="34" y2="18" class="line" /><line x1="26" y1="22" x2="32" y2="22" class="line" />
    <circle cx="31" cy="7.5" r="2.8" class="pin b" />
  </g>
  {#if fresh}
    <g class="new">
      <g transform="rotate(-3 22 18)">
        <rect x="13" y="7" width="18" height="21" class="paper new-paper" />
        <line x1="17" y1="16" x2="27" y2="16" class="line new-line" /><line x1="17" y1="20" x2="25" y2="20" class="line new-line" />
        <circle cx="22" cy="9.5" r="2.8" class="pin c" />
      </g>
    </g>
  {/if}
</svg>

<style>
  .notes { display: block; overflow: visible; filter: drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.18)); }
  .paper { fill: var(--color-white); stroke: var(--color-blue-500); stroke-width: 1; }
  .line { stroke: var(--color-blue-500); stroke-width: 1.1; stroke-linecap: round; }
  .pin { stroke: var(--color-navy); stroke-width: 0.7; }
  .pin.a { fill: var(--color-sky); }
  .pin.b { fill: var(--color-accent); }
  .new-paper { fill: var(--color-accent); stroke: var(--color-navy); }
  .new-line { stroke: var(--color-navy); }
  .pin.c { fill: var(--color-navy); }
  /* the new note is pinned on from above, then the stack wobbles once; replayed for every further post */
  .new { transform-box: fill-box; transform-origin: 50% 0; animation: note-land 420ms var(--ease-out) both; }
  .notes.fresh { transform-origin: 50% 20%; animation: notes-wobble 700ms 300ms ease-in-out; }
  @keyframes note-land {
    0% { transform: translateY(-9px) scale(1.25) rotate(-8deg); opacity: 0; }
    60% { transform: translateY(1px) scale(0.97) rotate(2deg); opacity: 1; }
    100% { transform: none; }
  }
  @keyframes notes-wobble {
    0%, 100% { transform: none; }
    20% { transform: rotate(-6deg); }
    45% { transform: rotate(5deg); }
    70% { transform: rotate(-2.5deg); }
  }
</style>
