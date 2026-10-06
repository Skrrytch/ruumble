<script lang="ts">
  // a slim cypress beside the building in the building overview (ADR-0019), decoration only: a narrow dark crown
  // with a lighter side, on a short brown trunk. It stands in front of the building's right wall, so its crown
  // overlaps the wall a little and the drawing gains a layer.
  let { height = 46 }: { height?: number } = $props();
</script>

<svg class="cypress" width={Math.round((height * 20) / 48)} {height} viewBox="0 0 20 48" aria-hidden="true">
  <rect x="8.8" y="37" width="2.4" height="11" rx="0.6" class="trunk" />
  <path d="M10 1 C14 9 16.5 20 15.5 30 C15 36 12.5 39.5 10 40.5 C7.5 39.5 5 36 4.5 30 C3.5 20 6 9 10 1 Z" class="crown" />
  <path d="M10 4 C8 12 6.5 21 7 30 C7.4 34.5 8.6 37.5 10 39 Z" class="light" />
  <path d="M10 10 C11.5 16 12.5 23 12 31 M8.5 18 C9 23 9 28 8.6 33" class="twig" />
</svg>

<style>
  .cypress { display: block; overflow: visible; filter: drop-shadow(1px 1px 1.5px rgb(0 0 0 / 0.2)); }
  .trunk { fill: var(--color-bark); }
  .crown { fill: var(--color-leaf-dark); stroke: var(--color-leaf-dark); stroke-width: 0.6; }
  .light { fill: var(--color-leaf); opacity: 0.85; }
  .twig { fill: none; stroke: var(--color-leaf-dark); stroke-width: 0.6; stroke-linecap: round; opacity: 0.5; }
</style>
