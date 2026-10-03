<script lang="ts" module>
  export interface OrphanItem {
    id: number | null;
    name: string;
    meta: string;
    posts: number;
  }
</script>

<script lang="ts">
  import { t } from "../../i18n/index.svelte.ts";
  import Icon from "./Icon.svelte";

  // rooms or floors that are gone but still hold data: dashed frame, one line each with a remove button;
  // "Remove all …" next to the heading. Without entries one line with a tick.
  let { title, items, empty, busy = false, onremove }: { title: string; items: OrphanItem[]; empty: string; busy?: boolean; onremove: (items: OrphanItem[]) => void } = $props();
</script>

<section class="orphans">
  {#if items.length}
    <div class="head">
      <h3>{title} <span class="count">({items.length})</span></h3>
      {#if items.length > 1}<button type="button" class="text-danger" disabled={busy} onclick={() => onremove(items)}>{t().care.removeAll}</button>{/if}
    </div>
    <ul>
      {#each items as item (item.id)}
        <li>
          <span class="text"><strong>{item.name}</strong><span class="meta">{item.meta}</span></span>
          <button type="button" class="remove" aria-label={t().care.remove(item.name)} title={t().care.remove(item.name)} disabled={busy} onclick={() => onremove([item])}><Icon name="trash" size={16} /></button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="none"><Icon name="check" size={15} color="var(--accent)" />{empty}</p>
  {/if}
</section>

<style>
  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .count { font-weight: 400; color: var(--muted); }
  .text-danger { border: 0; background: none; padding: 0; font: inherit; font-size: 13px; font-weight: 700; color: var(--danger); cursor: pointer; }
  .text-danger:disabled { opacity: 0.45; cursor: default; }
  ul { list-style: none; margin: 0; padding: 0; border: 1px dashed var(--accent-soft); border-radius: 4px; }
  li { display: flex; align-items: center; gap: 10px; padding: 4px 6px 4px 10px; }
  li + li { border-top: 1px dashed var(--accent-soft); }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.35; }
  .meta { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .remove { flex: none; width: 36px; height: 36px; display: grid; place-items: center; border: 1px solid #f0c9c5; border-radius: 4px; background: #fff; color: var(--danger); cursor: pointer; }
  .remove:hover { background: var(--danger-tint); }
  .remove:disabled { opacity: 0.45; cursor: default; }
  .none { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
</style>
