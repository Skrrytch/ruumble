<script lang="ts">
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Maximize2 from "@lucide/svelte/icons/maximize-2";
  import Pin from "@lucide/svelte/icons/pin";
  import PinOff from "@lucide/svelte/icons/pin-off";
  import { parseTaskList, type Pinned, type Post } from "@ruumble/protocol";
  import { t } from "../../i18n/index.svelte.ts";
  import PostBody from "./PostBody.svelte";

  /**
   * The post kept on top (A3): one slim row with title and progress; a click unfolds the post right below,
   * with its own scrolling so the list stays visible. `open` is remembered by the board panel.
   */
  let {
    pinned,
    post,
    open = $bindable(false),
    onopen,
    onunpin,
    ontoggle,
  }: {
    pinned: Pinned;
    post: Post;
    open?: boolean;
    onopen: (post: Post) => void;
    onunpin: () => void;
    ontoggle: (post: Post, index: number, done: boolean) => void;
  } = $props();

  const tasks = $derived(post.kind === "text" ? parseTaskList(post.text) : null);
  const done = $derived(tasks?.tasks.filter((x) => x.done).length ?? 0);
</script>

<section class="pinned" class:open aria-label={t().board.pinned(pinned.title)}>
  <button type="button" class="bar" aria-expanded={open} aria-controls="pinned-content" onclick={() => (open = !open)}>
    <Pin size={14} aria-hidden="true" />
    <span class="title">{pinned.title}</span>
    {#if tasks}<span class="progress" aria-label={t().board.taskProgress(done, tasks.tasks.length)}>{done}/{tasks.tasks.length}</span>{/if}
    <span class="chevron" aria-hidden="true"><ChevronDown size={16} /></span>
  </button>
  {#if open}
    <div id="pinned-content" class="content">
      <PostBody {post} ontoggle={(index, d) => ontoggle(post, index, d)} />
    </div>
    <footer>
      <button type="button" class="link" onclick={() => onopen(post)}><Maximize2 size={13} aria-hidden="true" /> {t().board.open}</button>
      <span class="by">{t().board.pinnedBy(pinned.pinnedByName)}</span>
      <button type="button" class="icon-btn" aria-label={t().board.unpin} title={t().board.unpin} onclick={onunpin}><PinOff size={15} aria-hidden="true" /></button>
    </footer>
  {/if}
</section>

<style>
  .pinned { margin: 8px 12px 0; border: 1px solid var(--color-blue-300); border-left: 3px solid var(--color-navy); border-radius: var(--radius-md); background: var(--color-white); }
  .bar {
    width: 100%; display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 0 10px; border: 0; background: none;
    color: var(--color-navy); font: inherit; font-size: 14px; text-align: left; cursor: pointer; border-radius: var(--radius-md);
  }
  .bar:hover { background: var(--color-blue-100); }
  .bar :global(svg) { flex-shrink: 0; }
  .title { flex: 1; min-width: 0; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .progress { font-size: 12px; font-weight: 700; color: var(--color-blue-700); }
  .chevron { display: inline-flex; color: var(--color-blue-500); transition: transform 0.15s; }
  .open .chevron { transform: rotate(180deg); }
  .content { max-height: 40vh; overflow-y: auto; padding: 4px 12px 8px; border-top: 1px solid var(--color-blue-100); }
  footer { display: flex; align-items: center; gap: 8px; padding: 2px 6px 4px 12px; }
  .by { flex: 1; min-width: 0; font-size: 11px; color: var(--color-blue-700); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .link { border: 0; background: none; padding: 4px 0; min-height: 28px; display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: var(--color-blue-500); cursor: pointer; }
  .icon-btn { width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: var(--radius-md); background: none; color: var(--color-blue-500); cursor: pointer; }
  .icon-btn:hover { background: var(--color-blue-100); color: var(--color-navy); }
  .bar:focus-visible, .link:focus-visible, .icon-btn:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .chevron { transition: none; } }
</style>
