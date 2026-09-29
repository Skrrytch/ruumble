<script lang="ts">
  import Beer from "@lucide/svelte/icons/beer";
  import Brain from "@lucide/svelte/icons/brain";
  import Cake from "@lucide/svelte/icons/cake";
  import Check from "@lucide/svelte/icons/check";
  import CircleQuestionMark from "@lucide/svelte/icons/circle-question-mark";
  import Coffee from "@lucide/svelte/icons/coffee";
  import Eye from "@lucide/svelte/icons/eye";
  import FaceGrinning from "@lucide/svelte/icons/face-grinning";
  import FaceSlightlyFrowning from "@lucide/svelte/icons/face-slightly-frowning";
  import Handshake from "@lucide/svelte/icons/handshake";
  import Hourglass from "@lucide/svelte/icons/hourglass";
  import Lightbulb from "@lucide/svelte/icons/lightbulb";
  import PartyPopper from "@lucide/svelte/icons/party-popper";
  import Pin from "@lucide/svelte/icons/pin";
  import Plus from "@lucide/svelte/icons/plus";
  import Rocket from "@lucide/svelte/icons/rocket";
  import ThumbsDown from "@lucide/svelte/icons/thumbs-down";
  import ThumbsUp from "@lucide/svelte/icons/thumbs-up";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import Wine from "@lucide/svelte/icons/wine";
  import { REACTION_KINDS, type Reaction, type ReactionKind } from "@ruumble/protocol";
  import { t } from "../../i18n/index.svelte.ts";

  /** Quick reactions with a fixed meaning (A1): used ones with count, all of them behind "React" */
  let { reactions, onreact }: { reactions: Reaction[]; onreact: (kind: ReactionKind) => void } = $props();

  // Lucide has no thinking face, clapping hands or champagne glasses: brain, party popper and a glass stand in
  const ICONS = {
    agree: ThumbsUp, disagree: ThumbsDown, looking: Eye, thinking: Brain, wait: Hourglass, done: Check, broken: TriangleAlert,
    unclear: CircleQuestionMark, important: Pin, idea: Lightbulb, release: Rocket, deal: Handshake,
    happy: FaceGrinning, sad: FaceSlightlyFrowning, applause: PartyPopper, congrats: Wine, birthday: Cake, break: Coffee, cheers: Beer,
  } satisfies Record<ReactionKind, unknown>;
  let picking = $state(false);
  /** symbol under the mouse or with keyboard focus: its meaning is shown in words below the grid */
  let hovered = $state<ReactionKind | null>(null);
  const mine = $derived(new Set(reactions.filter((r) => r.mine).map((r) => r.kind)));

  function pick(kind: ReactionKind): void {
    picking = false;
    hovered = null;
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
    <div class="picker">
      <div class="grid">
        {#each REACTION_KINDS as kind (kind)}
          {@const Icon = ICONS[kind]}
          <button
            type="button" class="pick" class:mine={mine.has(kind)} aria-pressed={mine.has(kind)} aria-label={t().board.reactions[kind]} title={t().board.reactions[kind]}
            onclick={() => pick(kind)} onmouseenter={() => (hovered = kind)} onfocus={() => (hovered = kind)}
          >
            <Icon size={16} aria-hidden="true" />
          </button>
        {/each}
      </div>
      <!-- the symbols alone should not have to be guessed -->
      <div class="meaning" aria-hidden="true">{hovered ? t().board.reactions[hovered] : t().board.reactHint}</div>
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
  .picker { flex-basis: 100%; display: flex; flex-direction: column; gap: 6px; padding: 8px; border: 1px solid var(--color-blue-100); border-radius: var(--radius-md); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(34px, 1fr)); gap: 4px; }
  .pick { padding: 0; min-height: 34px; border-radius: var(--radius-md); }
  .meaning { min-height: 1.4em; font-size: 13px; color: var(--color-navy); }
  button:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
</style>
