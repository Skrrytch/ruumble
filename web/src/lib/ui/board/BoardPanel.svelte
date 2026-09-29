<script lang="ts">
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import StickyNote from "@lucide/svelte/icons/sticky-note";
  import type { Post } from "@ruumble/protocol";
  import { FILTERS, filterPosts } from "../../board/model.ts";
  import { t } from "../../i18n/index.svelte.ts";
  import type { RuumbleState } from "../../state.svelte.ts";
  import Composer from "./Composer.svelte";
  import PostCard from "./PostCard.svelte";
  import PostDialog from "./PostDialog.svelte";
  import { setFileUrl } from "../../board/context.ts";

  let { app }: { app: RuumbleState } = $props();

  setFileUrl((a, download) => app.fileUrl(a, download));

  let openId = $state<string | null>(null);
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 30_000); // keep "N min ago" up to date
    return () => clearInterval(timer);
  });

  const board = $derived(app.board);
  const posts = $derived(board ? filterPosts(board.posts, app.boardFilter) : []);
  const openPost = $derived<Post | null>(board?.posts.find((p) => p.id === openId) ?? null);

  // drag files onto the board (AP11.3); the counter keeps the highlight stable over child elements
  let composer = $state<{ attach: (file: File) => Promise<void> } | null>(null);
  let dragDepth = $state(0);
  const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
  function ondragenter(e: DragEvent) {
    if (!board || !hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
  }
  function ondragover(e: DragEvent) {
    if (!board || !hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = "copy";
  }
  function ondragleave() {
    dragDepth = Math.max(0, dragDepth - 1);
  }
  function ondrop(e: DragEvent) {
    dragDepth = 0;
    const file = e.dataTransfer?.files?.[0];
    if (!board || !file) return;
    e.preventDefault();
    void composer?.attach(file);
  }
</script>

<aside id="board-panel" class="board" aria-label={t().board.title} {ondragenter} {ondragover} {ondragleave} {ondrop}>
  {#if dragDepth > 0}<div class="drop" aria-hidden="true">{t().board.dropHere}</div>{/if}
  <!-- compact: the room is the user's own (marked in the floor plan), hence no room name -->
  <header>
    <h2><StickyNote size={18} aria-hidden="true" /> {t().board.title}</h2>
    {#if board}<span class="sub">{t().board.count(board.posts.length)}</span>{/if}
    <button type="button" class="close" aria-label={t().board.hide} title={t().board.hide} onclick={() => app.closeBoard()}>
      <ChevronRight size={20} />
    </button>
  </header>

  {#if app.boardError === "no-board-here"}
    <p class="empty">{t().board.onlyRooms}</p>
  {:else if app.boardError}
    <p class="empty">{t().board.unavailable}</p>
  {:else if board}
    <div class="filters" role="toolbar" aria-label={t().board.filterLabel}>
      {#each FILTERS as f (f)}
        <button type="button" aria-pressed={app.boardFilter === f} onclick={() => (app.boardFilter = f)}>{t().board.filters[f]}</button>
      {/each}
    </div>
    <div class="list">
      {#each posts as post (post.id)}
        <PostCard {post} {now} avatar={app.avatarOf(post.authorName)} onopen={(p) => (openId = p.id)} />
      {:else}
        <p class="empty">{board.posts.length ? t().board.emptyFilter : t().board.empty}</p>
      {/each}
    </div>
    <Composer
      bind:this={composer}
      onpin={(kind, text, language) => app.pin(kind, text, language)}
      onupload={(file, name, progress) => app.upload(file, name, progress)}
      onattach={(attachment, caption) => app.pinAttachment(attachment, caption)}
    />
  {/if}
</aside>

{#if openPost}
  <PostDialog
    post={openPost}
    onclose={() => (openId = null)}
    onsave={(text, language) => app.editPost(openPost.id, text, language)}
    ondelete={() => app.deletePost(openPost.id)}
  />
{/if}

<style>
  /* lightly tinted blue, so the board stands out from the floor plan (without the corridor's dot grid) */
  .board { --board-bg: color-mix(in srgb, var(--color-blue-100) 45%, var(--color-white)); position: relative; width: 340px; flex-shrink: 0; display: flex; flex-direction: column; background: var(--board-bg); min-height: 0; }
  header { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--color-blue-300); }
  /* as large as the room titles in the floor plan */
  h2 { margin: 0; display: flex; align-items: center; gap: 6px; font-size: 16px; font-weight: 700; }
  h2 :global(svg) { color: var(--color-blue-500); }
  .sub { flex: 1; font-size: 13px; color: var(--color-blue-700); }
  .close { width: 36px; height: 36px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-white); color: var(--color-navy); display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
  .close:focus-visible, .filters button:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
  .filters { display: flex; flex-wrap: wrap; gap: 4px; padding: 10px 12px; }
  .filters button { min-height: 32px; padding: 0 10px; border: 1px solid var(--color-blue-300); border-radius: 999px; background: var(--color-white); color: var(--color-navy); font-size: 13px; cursor: pointer; }
  .filters button[aria-pressed="true"] { background: var(--color-navy); border-color: var(--color-navy); color: var(--color-white); }
  /* same side spacing as header and input (12 px) */
  .list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding: 12px; min-height: 0; }
  .drop {
    position: absolute; inset: 8px; z-index: 2; display: flex; align-items: center; justify-content: center; pointer-events: none;
    border: 2px dashed var(--color-blue-500); border-radius: var(--radius-md); background: rgb(255 255 255 / 0.85);
    font-weight: 700; color: var(--color-navy);
  }
  .empty { margin: 16px; font-size: 14px; color: var(--color-blue-700); }
</style>
