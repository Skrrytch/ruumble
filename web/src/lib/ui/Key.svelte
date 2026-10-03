<script lang="ts">
  // a key (key cabinet, ADR-0015): one brass key, the sign of "My keys" in the user menu and of its dialog. Every
  // paired browser is a key.
  let { size = 28 }: { size?: number } = $props();
</script>

<svg class="key" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
  <g transform="rotate(45 16 16)">
    <path d="M12 14 H30 V18 H28 V22 H25 V18 H23 V21 H20 V18 H12 Z" class="metal" />
    <circle cx="7" cy="16" r="6.5" class="metal" />
    <circle cx="5.5" cy="16" r="2" class="hole" />
  </g>
</svg>

<style>
  .key { display: block; overflow: visible; filter: drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.25)); }
  .metal { fill: var(--color-brass); stroke: var(--color-navy); stroke-width: 1.2; stroke-linejoin: round; }
  .hole { fill: var(--color-navy); }
</style>
