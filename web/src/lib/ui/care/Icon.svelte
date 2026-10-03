<script lang="ts" module>
  /** line icons of the care dialogs (24 viewBox, stroke 2, round), from the design handoff */
  const PATHS = {
    door: ["M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17", "M3 21h18", "M14.5 12h.01"],
    plant: ["M7 14h10l-1.5 7h-7z", "M12 14V9", "M12 10c0-3 2-5.5 5-5.5 0 3-2 5.5-5 5.5z", "M12 12c0-2.5-1.8-4.5-4.5-4.5 0 2.5 1.8 4.5 4.5 4.5z"],
    trash: ["M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"],
    download: ["M12 4v11M7 10l5 5 5-5M5 20h14"],
    tag: ["M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z", "M7.5 7.5h.01"],
    rules: ["M4 3h16v18H4z", "M8 8h8M8 12h8M8 16h5"],
    warning: ["M12 3l9.5 17h-19z", "M12 10v4M12 17h.01"],
    back: ["M15 6l-6 6 6 6"],
    next: ["M9 6l6 6-6 6"],
    close: ["M6 6l12 12M18 6L6 18"],
    check: ["M5 12l5 5 9-10"],
    move: ["M4 12h14M13 7l5 5-5 5"],
  } as const;
  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  let { name, size = 16, color = "currentColor" }: { name: IconName; size?: number; color?: string } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex: none">
  {#each PATHS[name] as d (d)}<path {d} />{/each}
</svg>
