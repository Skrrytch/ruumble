<script lang="ts">
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import ListFilter from "@lucide/svelte/icons/list-filter";
  import Pin from "@lucide/svelte/icons/pin";
  import Search from "@lucide/svelte/icons/search";
  import X from "@lucide/svelte/icons/x";
  import type { Post } from "@ruumble/protocol";
  import { FILTERS, PIN_TITLE_MAX, filterPosts, suggestTitle, type BoardFilter } from "../../board/model.ts";
  import { t } from "../../i18n/index.svelte.ts";
  import type { RuumbleState } from "../../state.svelte.ts";
  import Composer from "./Composer.svelte";
  import PinnedBar from "./PinnedBar.svelte";
  import PostCard from "./PostCard.svelte";
  import PostDialog from "./PostDialog.svelte";
  import { setFileUrl } from "../../board/context.ts";
  import { SHORTCUT_KEYS } from "../../shortcuts.ts";

  let { app }: { app: RuumbleState } = $props();

  setFileUrl((a, download) => app.fileUrl(a, download));

  let openId = $state<string | null>(null);
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 30_000); // keep "N min ago" up to date
    return () => clearInterval(timer);
  });

  const board = $derived(app.board);
  const posts = $derived(board ? filterPosts(board.posts, app.boardFilter, app.boardQuery) : []);
  const narrowed = $derived(app.boardFilter !== "all" || app.boardQuery.trim() !== "");

  // filter menu: closes on choice, Escape and a click elsewhere
  let filterOpen = $state(false);
  let filterButton = $state<HTMLButtonElement | null>(null);
  $effect(() => {
    if (!filterOpen) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".filter")) filterOpen = false; };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  });
  function choose(f: BoardFilter): void {
    app.boardFilter = f;
    filterOpen = false;
    filterButton?.focus();
  }
  function clearNarrowing(): void {
    app.boardFilter = "all";
    app.boardQuery = "";
  }
  const openPost = $derived<Post | null>(board?.posts.find((p) => p.id === openId) ?? null);

  // kept on top (A3): not a second time in the list, except in search and filter results
  const pinnedPost = $derived(board?.pinned ? (board.posts.find((p) => p.id === board.pinned!.postId) ?? null) : null);
  const listed = $derived(narrowed || !pinnedPost ? posts : posts.filter((p) => p.id !== pinnedPost.id));
  // the dot on a card: take the post down, or ask for the title right where it will be kept on top
  let pinDraft = $state<{ post: Post; title: string } | null>(null);
  function pinFromDot(post: Post): void {
    if (post.id === pinnedPost?.id) void app.unpinPost();
    else pinDraft = { post, title: suggestTitle(post) };
  }
  async function confirmPin(): Promise<void> {
    if (!pinDraft?.title.trim()) return;
    if (await app.pinPost(pinDraft.post, pinDraft.title.trim())) {
      pinDraft = null;
      pinnedOpen = false;
    }
  }
  const PINNED_OPEN_KEY = "ruumble.pinnedOpen";
  let pinnedOpen = $state(readPinnedOpen());
  function readPinnedOpen(): boolean {
    try {
      return localStorage.getItem(PINNED_OPEN_KEY) === "1";
    } catch {
      return false;
    }
  }
  $effect(() => {
    try {
      localStorage.setItem(PINNED_OPEN_KEY, pinnedOpen ? "1" : "0");
    } catch {
      /* private mode: not remembered */
    }
  });

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
  <!-- one slim row: search, filter, close. The heading only for screen readers: the room is the user's own -->
  <header>
    <h2 class="sr-only">{t().board.title}</h2>
    {#if board}
      <label class="search">
        <Search size={16} aria-hidden="true" />
        <input type="search" bind:value={app.boardQuery} placeholder={t().board.searchPlaceholder(board.posts.length)} aria-label={t().board.search} />
      </label>
      <div class="filter">
        <button
          type="button" class="tool" bind:this={filterButton} class:active={app.boardFilter !== "all"} aria-haspopup="menu" aria-expanded={filterOpen}
          aria-label={t().board.filterLabel} title={t().board.filterLabel} onclick={() => (filterOpen = !filterOpen)}
        >
          <ListFilter size={18} aria-hidden="true" />
          {#if app.boardFilter !== "all"}<span class="dot" aria-hidden="true"></span>{/if}
        </button>
        {#if filterOpen}
          <div class="menu" role="menu" tabindex="-1" onkeydown={(e) => { if (e.key === "Escape") { filterOpen = false; filterButton?.focus(); } }}>
            {#each FILTERS as f, i (f)}
              <button type="button" role="menuitemradio" aria-checked={app.boardFilter === f} onclick={() => choose(f)} {@attach (el) => { if (i === 0) el.focus(); }}>
                {t().board.filters[f]}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <span class="title">{t().board.title}</span>
    {/if}
    <button
      type="button" class="tool" aria-label={t().board.hide} title={t().board.withKey(t().board.hide, SHORTCUT_KEYS.toggleBoard)}
      aria-keyshortcuts={SHORTCUT_KEYS.toggleBoard.toUpperCase()} onclick={() => app.closeBoard()}
    >
      <ChevronRight size={20} />
    </button>
  </header>
  {#if board && narrowed}
    <div class="narrowed" role="status">
      <span>{t().board.shown(posts.length, board.posts.length)}{app.boardFilter !== "all" ? ` · ${t().board.filters[app.boardFilter]}` : ""}</span>
      <button type="button" class="clear" aria-label={t().board.clearFilter} title={t().board.clearFilter} onclick={clearNarrowing}><X size={14} aria-hidden="true" /></button>
    </div>
  {/if}

  {#if app.boardError === "no-board-here"}
    <p class="empty">{t().board.onlyRooms}</p>
  {:else if app.boardError}
    <p class="empty">{t().board.unavailable}</p>
  {:else if board}
    {#if pinDraft}
      <!-- title for keeping on top, in the place where the post will then be -->
      <form class="pindraft" aria-label={t().board.pinOnTop} onsubmit={(e) => { e.preventDefault(); void confirmPin(); }}>
        <Pin size={14} aria-hidden="true" />
        <input
          bind:value={pinDraft.title} maxlength={PIN_TITLE_MAX} aria-label={t().board.pinTitle}
          onkeydown={(e) => { if (e.key === "Escape") { e.preventDefault(); pinDraft = null; } }}
          {@attach (el) => { el.focus(); el.select(); }}
        />
        <button type="submit" class="ok" title={t().board.pinOnTop} disabled={!pinDraft.title.trim()}>{t().common.ok}</button>
        <button type="button" class="cancel" aria-label={t().common.cancel} title={t().common.cancel} onclick={() => (pinDraft = null)}><X size={14} aria-hidden="true" /></button>
        {#if board.pinned && pinnedPost}<span class="replaces">{t().board.pinReplaces(board.pinned.title)}</span>{/if}
      </form>
    {:else if board.pinned && pinnedPost}
      <PinnedBar
        pinned={board.pinned}
        post={pinnedPost}
        bind:open={pinnedOpen}
        onopen={(p) => (openId = p.id)}
        onunpin={() => app.unpinPost()}
        ontoggle={(p, index, done) => app.toggleTask(p, index, done)}
      />
    {/if}
    <div class="list">
      {#each listed as post (post.id)}
        <PostCard {post} {now} avatar={app.avatarOf(post.authorName)} onopen={(p) => (openId = p.id)} onreact={(p, kind) => app.react(p, kind)} ontoggle={(p, index, done) => app.toggleTask(p, index, done)}
          pinned={post.id === pinnedPost?.id} onpin={pinFromDot} />
      {:else}
        <!-- only the post on top: nothing to say below it -->
        {#if narrowed || !pinnedPost}<p class="empty">{board.posts.length ? t().board.emptyFilter : t().board.empty}</p>{/if}
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
    ontoggle={(index, done) => app.toggleTask(openPost, index, done)}
  />
{/if}

<style>
  /* lightly tinted blue, so the board stands out from the floor plan (without the corridor's dot grid) */
  .board { --board-bg: color-mix(in srgb, var(--color-blue-100) 45%, var(--color-white)); position: relative; width: 340px; flex-shrink: 0; display: flex; flex-direction: column; background: var(--board-bg); min-height: 0; }
  header { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--color-blue-300); }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .title { flex: 1; font-weight: 700; }
  .search { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; height: 36px; padding: 0 10px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-white); color: var(--color-blue-500); }
  .search:focus-within { outline: 3px solid var(--color-sky); outline-offset: 0; }
  .search input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; font: inherit; font-size: 14px; color: var(--color-navy); }
  .tool { position: relative; width: 36px; height: 36px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-white); color: var(--color-navy); display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
  .tool.active { border-color: var(--color-navy); background: var(--color-blue-100); }
  .dot { position: absolute; top: 5px; right: 5px; width: 7px; height: 7px; border-radius: 50%; background: var(--color-navy); }
  .filter { position: relative; }
  .menu {
    position: absolute; right: 0; top: calc(100% + 4px); z-index: 3; min-width: 150px; display: flex; flex-direction: column; padding: 4px;
    border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-white); box-shadow: 0 4px 12px rgb(0 56 105 / 0.15);
  }
  .menu button { min-height: 32px; padding: 0 10px; border: 0; border-radius: var(--radius-md); background: none; color: var(--color-navy); font-size: 14px; text-align: left; cursor: pointer; }
  .menu button:hover { background: var(--color-blue-100); }
  .menu button[aria-checked="true"] { font-weight: 700; background: var(--color-blue-100); }
  .pindraft {
    display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 8px 12px 0; padding: 4px 6px 4px 10px; color: var(--color-navy);
    border: 1px solid var(--color-blue-300); border-left: 3px solid var(--color-navy); border-radius: var(--radius-md); background: var(--color-white);
  }
  .pindraft input { flex: 1; min-width: 0; height: 28px; padding: 0 6px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); font: inherit; font-size: 14px; font-weight: 700; color: var(--color-navy); }
  .pindraft input:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 0; }
  .pindraft .ok { height: 28px; padding: 0 10px; border: 0; border-radius: var(--radius-md); background: var(--color-navy); color: var(--color-white); font-size: 13px; font-weight: 700; cursor: pointer; }
  .pindraft .ok:disabled { opacity: 0.5; cursor: default; }
  .pindraft .cancel { width: 28px; height: 28px; border: 0; border-radius: var(--radius-md); background: none; color: var(--color-navy); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
  .pindraft .cancel:hover { background: var(--color-blue-100); }
  .pindraft .ok:focus-visible, .pindraft .cancel:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
  .replaces { flex-basis: 100%; font-size: 12px; color: var(--color-blue-700); }
  .narrowed { display: flex; align-items: center; gap: 6px; padding: 4px 12px; font-size: 13px; color: var(--color-blue-700); border-bottom: 1px solid var(--color-blue-100); }
  .clear { width: 24px; height: 24px; border: 0; border-radius: var(--radius-md); background: none; color: var(--color-navy); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
  .clear:hover { background: var(--color-blue-100); }
  .tool:focus-visible, .menu button:focus-visible, .clear:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
  /* same side spacing as header and input (12 px) */
  .list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding: 12px; min-height: 0; }
  .drop {
    position: absolute; inset: 8px; z-index: 2; display: flex; align-items: center; justify-content: center; pointer-events: none;
    border: 2px dashed var(--color-blue-500); border-radius: var(--radius-md); background: rgb(255 255 255 / 0.85);
    font-weight: 700; color: var(--color-navy);
  }
  .empty { margin: 16px; font-size: 14px; color: var(--color-blue-700); }
</style>
