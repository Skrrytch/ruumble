<script lang="ts">
  // key cabinet (ADR-0015): a small wall cabinet with hooks and two keys, next to the plant at the entrance.
  // Every paired browser is a key; the button around it opens the list of keys.
  let { size = 30 }: { size?: number } = $props();
</script>

<svg class="cabinet" width={size} height={Math.round(size * 1.1)} viewBox="0 0 30 33" aria-hidden="true">
  <rect x="3" y="2" width="24" height="29" rx="2" class="box" />
  <path d="M8 9 V11 M15 9 V11 M22 9 V11" class="hook" />
  <g class="key a"><circle cx="8" cy="14.5" r="2.6" /><path d="M8 17 V25 M8 22 H10 M8 24.5 H10" /></g>
  <g class="key b"><circle cx="22" cy="14.5" r="2.6" /><path d="M22 17 V25 M22 22 H24 M22 24.5 H24" /></g>
</svg>

<style>
  .cabinet { display: block; overflow: visible; filter: drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.18)); }
  .box { fill: var(--color-white); stroke: var(--color-navy); stroke-width: 1.2; }
  .hook { stroke: var(--color-blue-500); stroke-width: 1.4; stroke-linecap: round; }
  .key { fill: none; stroke-width: 1.4; stroke-linecap: round; }
  .key circle { fill: var(--color-white); }
  .key.a { stroke: var(--color-accent); }
  .key.a circle { stroke: var(--color-navy); fill: var(--color-accent); }
  .key.b { stroke: var(--color-blue-500); }
</style>
