<script lang="ts">
  // floor button like in the elevator (care dialogs); `mini`: filled, in front of the floor name in a header
  let { label, mini = false }: { label: string; mini?: boolean } = $props();
</script>

<span class="floor" class:mini aria-hidden="true">{label}</span>

<style>
  .floor { flex: none; display: inline-grid; place-items: center; min-width: 28px; height: 28px; padding: 0 3px; box-sizing: border-box; border: 2px solid var(--ink); border-radius: 4px; font-size: 13px; font-weight: 700; color: var(--ink); background: #fff; }
  .mini { min-width: 18px; height: 18px; padding: 0 2px; border: 0; border-radius: 3px; background: var(--ink); color: #fff; font-size: 11px; }
</style>
