<script lang="ts">
  // the street lantern next to the building in the building overview (ADR-0019): it opens the building maintenance
  // (ADR-0016) for admins, decoration for everyone else. Navy post and frame, the glass lit in sky blue.
  let { size = 56 }: { size?: number } = $props();
</script>

<svg class="lantern" width={Math.round(size * 0.5)} height={size} viewBox="0 0 20 40" aria-hidden="true">
  <circle cx="10" cy="9" r="8" class="glow" />
  <path d="M6 4 H14 L13 13 H7 Z" class="glass" />
  <path d="M5 4 H15 L10 0.8 Z M6.5 13 H13.5 V14.5 H6.5 Z" class="frame" />
  <path d="M10 14.5 V38 M6.5 39 H13.5" class="post" />
</svg>

<style>
  .lantern { display: block; overflow: visible; filter: drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.18)); }
  .glow { fill: var(--color-sky); opacity: 0.18; }
  .glass { fill: var(--color-blue-100); stroke: var(--color-navy); stroke-width: 0.9; stroke-linejoin: round; }
  .frame { fill: var(--color-navy); }
  .post { fill: none; stroke: var(--color-navy); stroke-width: 1.8; stroke-linecap: round; }
</style>
