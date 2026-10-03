<script lang="ts">
  import Icon from "./Icon.svelte";
  // door plate of a room (care dialogs); `orphan`: the room is gone (dashed, muted)
  let { name, orphan = false }: { name: string; orphan?: boolean } = $props();
</script>

<span class="plate" class:orphan><Icon name="door" size={14} color={orphan ? "var(--accent-soft)" : "var(--accent)"} /><span class="name">{name}</span></span>

<style>
  .plate { display: inline-flex; align-items: center; gap: 6px; min-width: 0; padding: 1px 10px; border: 1px solid var(--ink); border-radius: 3px; background: #fff; font-size: 14px; font-weight: 700; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .orphan { border-style: dashed; border-color: var(--accent-soft); color: var(--muted); }
</style>
