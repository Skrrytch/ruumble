<script lang="ts">
  // the wrench at the entrance (building maintenance, ADR-0016): the building's settings, for admins only.
  // Next to the plant (care of the data); keys moved to the user menu (ADR-0015).
  let { size = 28 }: { size?: number } = $props();
</script>

<svg class="wrench" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
  <!-- open-end wrench: head with jaw on top, handle with a rounded end, as one outline -->
  <path transform="rotate(45 16 16)" d="M13 1.7 V8 H19 V1.7 A7 7 0 0 1 18.5 14.5 V28 A2.5 2.5 0 0 1 13.5 28 V14.5 A7 7 0 0 1 13 1.7 Z" class="steel" />
</svg>

<style>
  .wrench { display: block; overflow: visible; filter: drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.25)); }
  .steel { fill: var(--color-steel); stroke: var(--color-navy); stroke-width: 1.2; stroke-linejoin: round; }
</style>
