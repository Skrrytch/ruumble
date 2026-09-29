<script lang="ts">
  import { REACTION_KINDS, type Reaction, type ReactionKind } from "@ruumble/protocol";
  import { t } from "../../i18n/index.svelte.ts";
  import { REACTION_ICONS } from "./reactionIcons.ts";

  /**
   * All quick reactions (A1) as a grid: used ones with their count, the own ones pressed. The meaning of the
   * symbol under the mouse or keyboard focus is shown in words below, with who reacted.
   */
  let { reactions, onpick, onclose }: { reactions: Reaction[]; onpick: (kind: ReactionKind) => void; onclose: () => void } = $props();

  let hovered = $state<ReactionKind | null>(null);
  const byKind = $derived(new Map(reactions.map((r) => [r.kind, r])));
  const meaning = $derived.by(() => {
    if (!hovered) return t().board.reactHint;
    const names = byKind.get(hovered)?.names ?? [];
    return names.length ? t().board.reactionTitle(t().board.reactions[hovered], names.join(", ")) : t().board.reactions[hovered];
  });

  /** keyboard: focus goes to the first symbol, Escape closes */
  function focusFirst(node: HTMLElement): void {
    node.querySelector("button")?.focus();
  }
</script>

<div class="picker" role="group" aria-label={t().board.react} use:focusFirst>
  <div class="grid">
    {#each REACTION_KINDS as kind (kind)}
      {@const Icon = REACTION_ICONS[kind]}
      {@const r = byKind.get(kind)}
      {@const label = r ? t().board.reactionTitle(t().board.reactions[kind], r.names.join(", ")) : t().board.reactions[kind]}
      <button
        type="button" class:mine={r?.mine} aria-pressed={!!r?.mine} aria-label={label} title={label}
        onclick={() => onpick(kind)} onmouseenter={() => (hovered = kind)} onfocus={() => (hovered = kind)}
        onkeydown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onclose(); } }}
      >
        <Icon size={16} aria-hidden="true" />
        {#if r}<span class="count" aria-hidden="true">{r.count}</span>{/if}
      </button>
    {/each}
  </div>
  <!-- the symbols alone should not have to be guessed -->
  <div class="meaning" aria-hidden="true">{meaning}</div>
</div>

<style>
  .picker { display: flex; flex-direction: column; gap: 6px; padding: 8px; border: 1px solid var(--color-blue-100); border-radius: var(--radius-md); background: var(--color-white); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(34px, 1fr)); gap: 4px; }
  button {
    position: relative; display: flex; align-items: center; justify-content: center; min-height: 34px; padding: 0;
    border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-white); color: var(--color-navy); cursor: pointer;
  }
  button:hover { background: var(--color-blue-100); }
  button.mine { background: var(--color-blue-100); border-color: var(--color-navy); }
  button:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
  .count {
    position: absolute; top: -6px; right: -4px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px;
    background: var(--color-navy); color: var(--color-white); font-size: 10px; font-weight: 700; line-height: 16px; text-align: center;
  }
  .meaning { min-height: 1.4em; font-size: 13px; color: var(--color-navy); }
</style>
