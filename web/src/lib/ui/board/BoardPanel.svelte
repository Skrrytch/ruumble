<script lang="ts">
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import StickyNote from "@lucide/svelte/icons/sticky-note";
  import type { Post } from "@ruumble/protocol";
  import { FILTERS, countLabel, filterPosts } from "../../board/model.ts";
  import type { RuumbleState } from "../../state.svelte.ts";
  import Composer from "./Composer.svelte";
  import PostCard from "./PostCard.svelte";
  import PostDialog from "./PostDialog.svelte";

  let { app }: { app: RuumbleState } = $props();

  let openId = $state<string | null>(null);
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 30_000); // „vor N Min.“ aktuell halten
    return () => clearInterval(t);
  });

  const board = $derived(app.board);
  const posts = $derived(board ? filterPosts(board.posts, app.boardFilter) : []);
  const openPost = $derived<Post | null>(board?.posts.find((p) => p.id === openId) ?? null);
</script>

<aside id="board-panel" class="board" aria-label="Pinnwand">
  <header>
    <div>
      <div class="kicker"><StickyNote size={14} /> Pinnwand</div>
      {#if board}
        <h2>{board.channelName}</h2>
        <div class="sub">{countLabel(board.posts.length)} · sichtbar für alle im Raum</div>
      {/if}
    </div>
    <button type="button" class="close" aria-label="Pinnwand ausblenden" title="Pinnwand ausblenden" onclick={() => app.closeBoard()}>
      <ChevronRight size={20} />
    </button>
  </header>

  {#if app.boardError === "no-board-here"}
    <p class="empty">Pinnwände gibt es nur in Räumen. Geh in einen Raum, um dort etwas anzuheften.</p>
  {:else if app.boardError}
    <p class="empty">Die Pinnwand ist gerade nicht erreichbar.</p>
  {:else if board}
    <div class="filters" role="toolbar" aria-label="Beiträge filtern">
      {#each FILTERS as f (f.id)}
        <button type="button" aria-pressed={app.boardFilter === f.id} onclick={() => (app.boardFilter = f.id)}>{f.label}</button>
      {/each}
    </div>
    <div class="list raster">
      {#each posts as post (post.id)}
        <PostCard {post} {now} onopen={(p) => (openId = p.id)} />
      {:else}
        <p class="empty">{board.posts.length ? "Nichts in diesem Filter." : "Noch hängt hier nichts. Heft den ersten Zettel an!"}</p>
      {/each}
    </div>
    <Composer onpin={(kind, text, language) => app.pin(kind, text, language)} />
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
  .board { width: 340px; flex-shrink: 0; display: flex; flex-direction: column; background: var(--color-white); min-height: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; padding: 16px 16px 12px; border-bottom: 1px solid var(--color-blue-100); }
  .kicker { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--color-blue-500); }
  h2 { margin: 2px 0 0; font-size: 20px; }
  .sub { font-size: 13px; color: var(--color-blue-700); }
  .close { width: 40px; height: 40px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-white); color: var(--color-navy); display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
  .close:focus-visible, .filters button:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
  .filters { display: flex; flex-wrap: wrap; gap: 4px; padding: 12px 16px; }
  .filters button { min-height: 32px; padding: 0 10px; border: 1px solid var(--color-blue-300); border-radius: 999px; background: var(--color-white); color: var(--color-navy); font-size: 13px; cursor: pointer; }
  .filters button[aria-pressed="true"] { background: var(--color-navy); border-color: var(--color-navy); color: var(--color-white); }
  .list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding: 16px; min-height: 0; }
  .raster { background-color: var(--color-white); background-image: radial-gradient(var(--raster-dot) 2px, transparent 2.4px); background-size: 10px 10px; }
  .empty { margin: 16px; font-size: 14px; color: var(--color-blue-700); }
</style>
