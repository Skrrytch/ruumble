<script lang="ts">
  // site plan of the building (care dialogs): 3×3 windows, the level being tended is filled
  let { level, size = 36 }: { level: "room" | "floor" | "building"; size?: number } = $props();
  const cols = [10, 19, 28];
  const rows = [11, 21, 31];
  const filled = (r: number, c: number) => level === "building" || (level === "floor" ? r === 1 : r === 1 && c === 1);
</script>

<svg width={size} height={size} viewBox="0 0 44 44" fill="none" aria-hidden="true" style="flex: none">
  <rect x="6" y="7" width="32" height="33" rx="1" stroke="var(--ink)" stroke-width="2" fill={level === "building" ? "var(--tint)" : "none"} />
  {#each rows as y, r (y)}
    {#each cols as x, c (x)}
      {@const door = r === 2 && c === 1}
      {@const ink = door && level === "building"}
      <rect {x} {y} width="6" height={door ? 9 : 6} fill={ink ? "var(--ink)" : filled(r, c) ? "var(--accent)" : "none"} stroke={ink ? "var(--ink)" : filled(r, c) ? "var(--accent)" : "var(--accent-soft)"} stroke-width="1.5" />
    {/each}
  {/each}
  <path d="M2 40h40" stroke="var(--ink)" stroke-width="2" />
</svg>
