<script lang="ts">
  // potted plant (care, ADR-0014): in every room, at the end of the corridor and at the entrance. Decoration for
  // everyone; for whoever may tend the stored data there, the button around it opens the care dialog.
  // `subtle`: furnishing of rooms and corridors, small and pale; full colour where the button around it is hovered
  let { size = 34, subtle = false }: { size?: number; subtle?: boolean } = $props();
</script>

<svg class="plant" class:subtle width={size} height={Math.round(size * 1.2)} viewBox="0 0 30 36" aria-hidden="true">
  <path d="M15 22 C14 16 9 12 4 12 C5 17 9 21 15 22 Z" class="leaf" />
  <path d="M15 22 C16 15 21 11 26 11 C25 17 21 21 15 22 Z" class="leaf" />
  <path d="M15 22 C11 15 11 7 15 2 C19 7 19 15 15 22 Z" class="leaf dark" />
  <path d="M15 22 V12 M15 22 L9 16 M15 22 L21 15" class="vein" />
  <path d="M7 22 H23 L21 34 H9 Z" class="pot" />
  <rect x="6" y="21" width="18" height="3.5" rx="1" class="pot rim" />
</svg>

<style>
  .plant { display: block; overflow: visible; filter: drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.18)); transition: opacity var(--dur) var(--ease-out), filter var(--dur) var(--ease-out); }
  .plant.subtle { opacity: 0.55; filter: saturate(0.6); }
  :global(.tend:hover) .plant.subtle, :global(.tend:focus-visible) .plant.subtle { opacity: 1; filter: drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.18)); }
  .leaf { fill: var(--color-leaf); stroke: var(--color-leaf-dark); stroke-width: 0.8; }
  .leaf.dark { fill: var(--color-leaf-dark); }
  .vein { fill: none; stroke: var(--color-leaf-dark); stroke-width: 0.7; stroke-linecap: round; opacity: 0.6; }
  .pot { fill: var(--color-pot); stroke: var(--color-navy); stroke-width: 0.8; stroke-linejoin: round; }
  .rim { stroke-width: 0.8; }
</style>
