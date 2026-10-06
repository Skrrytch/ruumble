<script lang="ts">
  // room binders: the description a room or corridor has in Mumble, filed on the shelf next to the board.
  // Two lever-arch files, the second one leaning against the first; the spine labels and finger holes of office binders.
  let { size = 26 }: { size?: number } = $props();
</script>

<svg class="binders" width={size} height={Math.round((size * 30) / 28)} viewBox="0 0 28 30" aria-hidden="true">
  <rect x="2" y="3" width="10" height="25" rx="1" class="spine a" />
  <rect x="4" y="7" width="6" height="8" rx="0.6" class="label" />
  <line x1="5.3" y1="9.7" x2="8.7" y2="9.7" class="line" /><line x1="5.3" y1="12.3" x2="7.7" y2="12.3" class="line" />
  <circle cx="7" cy="22" r="1.9" class="hole" />
  <!-- tilted about its bottom left corner until its top rests on the first one -->
  <g transform="rotate(-12 17 28)">
    <rect x="17" y="3" width="10" height="25" rx="1" class="spine b" />
    <rect x="19" y="7" width="6" height="8" rx="0.6" class="label" />
    <line x1="20.3" y1="9.7" x2="23.7" y2="9.7" class="line" /><line x1="20.3" y1="12.3" x2="22.7" y2="12.3" class="line" />
    <circle cx="22" cy="22" r="1.9" class="hole" />
  </g>
</svg>

<style>
  .binders { display: block; overflow: visible; filter: drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.18)); }
  .spine { stroke: var(--color-navy); stroke-width: 0.8; }
  .spine.a { fill: var(--color-blue-500); }
  .spine.b { fill: var(--color-sky); }
  .label { fill: var(--color-white); stroke: var(--color-navy); stroke-width: 0.5; }
  .line { stroke: var(--color-blue-500); stroke-width: 0.9; stroke-linecap: round; }
  .hole { fill: var(--color-white); stroke: var(--color-navy); stroke-width: 0.6; }
</style>
