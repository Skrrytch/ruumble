<script lang="ts">
  import Check from "@lucide/svelte/icons/check";
  import CircleQuestionMark from "@lucide/svelte/icons/circle-question-mark";
  import Eye from "@lucide/svelte/icons/eye";
  import Plus from "@lucide/svelte/icons/plus";
  import ThumbsUp from "@lucide/svelte/icons/thumbs-up";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import { REACTION_KINDS, type Reaction, type ReactionKind } from "@ruumble/protocol";
  import { t } from "../../i18n/index.svelte.ts";

  /** Quick reactions with a fixed meaning (A1): used ones with count, the rest behind "React" */
  let { reactions, onreact }: { reactions: Reaction[]; onreact: (kind: ReactionKind) => void } = $props();

  const ICONS = { agree: ThumbsUp, looking: Eye, done: Check, broken: TriangleAlert, unclear: CircleQuestionMark };
  let picking = $state(false);
  const mine = $derived(new Set(reactions.filter((r) => r.mine).map((r) => r.kind)));

  function pick(kind: ReactionKind): void {
    picking = false;
    onreact(kind);
  }
</script>

<div class="reactions" role="group" aria-label={t().board.reactionsLabel}>
  {#each reactions as r (r.kind)}
    {@const Icon = ICONS[r.kind]}
    {@const title = t().board.reactionTitle(t().board.reactions[r.kind], r.names.join(", "))}
    <button type="button" class="chip" class:mine={r.mine} aria-pressed={r.mine} aria-label={title} {title} onclick={() => onreact(r.kind)}>
      <Icon size={14} aria-hidden="true" /><span>{r.count}</span>
    </button>
  {/each}
  <button type="button" class="add" aria-expanded={picking} aria-label={t().board.react} title={t().board.react} onclick={() => (picking = !picking)}>
    <Plus size={14} aria-hidden="true" />
  </button>
  {#if picking}
    <!-- all five with their meaning in words: the symbols alone should not have to be guessed -->
    <div class="picker">
      {#each REACTION_KINDS as kind (kind)}
        {@const Icon = ICONS[kind]}
        <button type="button" class="pick" class:mine={mine.has(kind)} aria-pressed={mine.has(kind)} onclick={() => pick(kind)}>
          <Icon size={16} aria-hidden="true" /><span>{t().board.reactions[kind]}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .reactions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  button {
    display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-height: 28px; min-width: 28px; padding: 0 8px;
    border: 1px solid var(--color-blue-300); border-radius: 999px; background: var(--color-white); color: var(--color-navy);
    font-size: 12px; font-weight: 700; cursor: pointer;
  }
  button:hover { background: var(--color-blue-100); }
  button.mine { background: var(--color-blue-100); border-color: var(--color-navy); }
  .add { padding: 0; border-style: dashed; color: var(--color-blue-500); }
  .picker { flex-basis: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
  .pick { justify-content: flex-start; font-weight: 400; font-size: 13px; padding: 0 10px; }
  button:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
</style>
