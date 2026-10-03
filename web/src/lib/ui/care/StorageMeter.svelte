<script lang="ts">
  // storage in use against the quota: ticks at 25/50/75 %, at least 4 px filled so a little use stays visible
  let { share, label }: { share: number; label: string } = $props();
</script>

<div class="meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
  <span class="fill" style:width={`max(4px, ${share * 100}%)`}></span>
  {#each [25, 50, 75] as tick (tick)}<span class="tick" style:left={`${tick}%`}></span>{/each}
</div>

<style>
  .meter { position: relative; height: 10px; border: 1px solid var(--line); border-radius: 2px; background: #fff; overflow: hidden; }
  .fill { position: absolute; inset: 0 auto 0 0; background: var(--ink); }
  .tick { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--line); }
</style>
