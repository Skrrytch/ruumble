<script lang="ts">
  import FileOutput from "@lucide/svelte/icons/file-output";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import { formatSize } from "../../board/model.ts";
  import { t } from "../../i18n/index.svelte.ts";
  import type { RuumbleState } from "../../state.svelte.ts";
  import { isExecutable, typeLabel } from "../../tube/model.ts";

  // A new parcel of tube mail (ADR-0022): who sends what, with "Accept", "Decline" and "Later". It stays until one
  // of them is chosen; "Later" keeps the parcel in the panel. Below the notice of the direct chat when both show.
  let { app }: { app: RuumbleState } = $props();
  const parcel = $derived(app.tube.toast ? (app.tube.parcels[app.tube.toast] ?? null) : null);
</script>

{#if parcel}
  <div class="tube-toast" class:lower={!!app.chat.toast} role="status">
    <span class="mini" aria-hidden="true"><FileOutput size={18} /></span>
    <div class="body">
      <span class="from">{t().tube.from(parcel.fromName)}</span>
      <span class="name">{parcel.name}</span>
      <span class="meta">{[typeLabel(parcel.name, parcel.type), formatSize(parcel.size)].filter(Boolean).join(" · ")}</span>
      {#if parcel.note}<q class="note">{parcel.note}</q>{/if}
      {#if isExecutable(parcel.name)}<span class="warn"><TriangleAlert size={14} aria-hidden="true" />{t().tube.executable}</span>{/if}
      <div class="actions">
        <button type="button" class="btn primary" disabled={!parcel.holder} onclick={() => void app.tube.accept(parcel.id)}>{t().tube.accept}</button>
        <button type="button" class="btn" onclick={() => void app.tube.decline(parcel.id)}>{t().tube.decline}</button>
        <button type="button" class="btn quiet" onclick={() => app.tube.later()}>{t().tube.later}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .tube-toast {
    --color-paper: var(--color-raised);
    position: fixed; top: 88px; right: 32px; z-index: 30; width: 340px; box-sizing: border-box; display: flex; align-items: flex-start; gap: 12px;
    padding: 12px 14px; border-radius: 8px; background: var(--color-paper); color: var(--color-ink);
    box-shadow: 0 0 0 1px var(--color-raised-edge), 0 10px 28px rgb(0 56 105 / 0.25); animation: slide 220ms var(--ease-out) both;
  }
  .tube-toast.lower { top: 220px; }
  @keyframes slide { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .tube-toast { animation: none; } }
  .mini { width: 36px; height: 36px; flex: none; border-radius: 50%; background: var(--color-ink); color: var(--color-paper); display: grid; place-items: center; }
  .body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .from { font-size: 12px; font-weight: 700; color: var(--color-blue-700); }
  .name { font-weight: 700; overflow-wrap: anywhere; }
  .meta { font-size: 12px; color: var(--color-blue-700); }
  .note { font-size: 13px; font-style: italic; overflow-wrap: anywhere; }
  .warn { display: flex; align-items: flex-start; gap: 6px; margin-top: 2px; padding: 6px 8px; border: 1px solid var(--color-alert); border-radius: 4px; font-size: 12px; }
  .warn :global(svg) { flex: none; color: var(--color-alert); }
  .actions { display: flex; gap: 6px; margin-top: 8px; }
  .btn {
    min-height: 32px; padding: 0 12px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-paper);
    color: var(--color-ink); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
  }
  .btn:hover { background: var(--color-blue-100); }
  .btn.primary { border-color: var(--color-ink); background: var(--color-ink); color: var(--color-paper); }
  .btn.quiet { border-color: transparent; color: var(--color-blue-700); }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 1px; }
</style>
