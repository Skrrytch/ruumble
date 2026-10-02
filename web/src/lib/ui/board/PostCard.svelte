<script lang="ts">
  import { copyText } from "../../board/clipboard.ts";
  import Check from "@lucide/svelte/icons/check";
  import Copy from "@lucide/svelte/icons/copy";
  import Download from "@lucide/svelte/icons/download";
  import Ellipsis from "@lucide/svelte/icons/ellipsis";
  import FaceSlightlySmilingPlus from "@lucide/svelte/icons/face-slightly-smiling-plus";
  import Maximize2 from "@lucide/svelte/icons/maximize-2";
  import ListChecks from "@lucide/svelte/icons/list-checks";
  import Pin from "@lucide/svelte/icons/pin";
  import PinOff from "@lucide/svelte/icons/pin-off";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import { parseTaskList, type Post, type ReactionKind } from "@ruumble/protocol";
  import { PREVIEW_LINES, isLong, relativeTime, summarizeReactions } from "../../board/model.ts";
  import { intlLocale, t } from "../../i18n/index.svelte.ts";
  import { initials } from "../../model/building.ts";
  import { getFileUrl } from "../../board/context.ts";
  import PostBody from "./PostBody.svelte";
  import ReactionPicker from "./ReactionPicker.svelte";
  import { REACTION_ICONS } from "./reactionIcons.ts";

  /** `avatar`: the author's image if they are currently connected and registered; otherwise initials */
  /** `pinned`: this post is the one kept on top (A3); `onpin`: the dot keeps it on top or takes it down */
  /** `arrival`: new for the user – "land" (by someone else while the board was open: pinned on from above, lights up) or "glow" (only lights up) */
  /** `ondelete`: from the "…" menu, only offered if the user may delete the post (author or Mumble admin) */
  let { post, now, avatar = null, pinned = false, arrival = null, onopen, onreact, ontoggle, onpin, ondelete }: {
    post: Post; now: number; avatar?: string | null; pinned?: boolean; arrival?: "land" | "glow" | null; onopen: (post: Post) => void; onreact: (post: Post, kind: ReactionKind) => void;
    ontoggle: (post: Post, index: number, done: boolean) => void; onpin: (post: Post) => void; ondelete: (post: Post) => void;
  } = $props();
  let avatarBroken = $state<string | null>(null);

  const fileUrl = getFileUrl();
  let copied = $state(false);
  let picking = $state(false);
  const long = $derived(!post.attachment && isLong(post.text));
  const tasks = $derived(post.kind === "text" ? parseTaskList(post.text) : null);
  const tasksDone = $derived(tasks?.tasks.filter((x) => x.done).length ?? 0);
  // reactions only as a summary with a fixed width, however many kinds there are
  const summary = $derived(summarizeReactions(post.reactions));
  const summaryLabel = $derived(
    t().board.reactionSummary(post.reactions.map((r) => t().board.reactionTitle(t().board.reactions[r.kind], r.names.join(", "))).join("; ")),
  );

  async function copy() {
    copied = await copyText(post.text);
    setTimeout(() => (copied = false), 1500);
  }

  // "…" menu: closes on choice, Escape and a click elsewhere
  let menuOpen = $state(false);
  let menuButton = $state<HTMLButtonElement | null>(null);
  $effect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".more")) menuOpen = false; };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  });
  function remove(): void {
    menuOpen = false;
    if (confirm(t().board.confirmDelete)) ondelete(post);
    else menuButton?.focus();
  }

  function pick(kind: ReactionKind): void {
    picking = false;
    onreact(post, kind);
  }
</script>

<article class="card" class:land={arrival === "land"} class:glow={arrival === "glow"} aria-label={t().board.postBy(post.authorName)}>
  <!-- the pin dot is also the handle for "keep on top": it grows into a button on hover and keyboard focus -->
  <button type="button" class="pin" class:pinned aria-label={pinned ? t().board.unpin : t().board.pinOnTop} title={pinned ? t().board.unpin : t().board.pinOnTop} onclick={() => onpin(post)}>
    <span class="dot" aria-hidden="true"></span>
    <span class="glyph" aria-hidden="true">{#if pinned}<PinOff size={12} />{:else}<Pin size={12} />{/if}</span>
  </button>
  <header>
    <span class="av" class:me={post.mine} aria-hidden="true">
      {#if avatar && avatarBroken !== avatar}<img src={avatar} alt="" onerror={() => (avatarBroken = avatar)} />{:else}{initials(post.authorName)}{/if}
    </span>
    <span class="who">
      <strong>{post.authorName}</strong>
      <span class="when" title={new Date(post.createdAt).toLocaleString(intlLocale())}>{relativeTime(post.createdAt, now)}</span>
    </span>
    {#if tasks}
      <span class="progress" class:complete={tasksDone === tasks.tasks.length} role="img" aria-label={t().board.taskProgress(tasksDone, tasks.tasks.length)} title={t().board.taskProgress(tasksDone, tasks.tasks.length)}>
        <ListChecks size={13} aria-hidden="true" />{tasksDone}/{tasks.tasks.length}
      </span>
    {/if}
    {#if summary.total}
      <button type="button" class="summary" class:mine={summary.mine} aria-expanded={picking} aria-label={summaryLabel} title={summaryLabel} onclick={() => (picking = !picking)}>
        <span class="icons">
          {#each summary.top as kind (kind)}
            {@const Icon = REACTION_ICONS[kind]}
            <span class="icon"><Icon size={12} aria-hidden="true" /></span>
          {/each}
        </span>
        <span>{summary.total}</span>
      </button>
    {/if}
  </header>
  <div class="body" class:clamped={long} style:--lines={PREVIEW_LINES}>
    <PostBody {post} ontoggle={(index, done) => ontoggle(post, index, done)} />
  </div>
  {#if post.updatedByName}
    <div class="edited">{t().board.editedBy(post.updatedByName)} · {relativeTime(post.updatedAt, now)}</div>
  {/if}
  <!-- one row, whatever the post: open left, react in the middle, the main action for the content right -->
  <footer>
    <button type="button" class="link" onclick={() => onopen(post)}><Maximize2 size={13} aria-hidden="true" /> {t().board.open}</button>
    <button type="button" class="icon-btn react" aria-expanded={picking} aria-label={t().board.react} title={t().board.react} onclick={() => (picking = !picking)}>
      <FaceSlightlySmilingPlus size={18} aria-hidden="true" />
    </button>
    <span class="end">
      {#if post.kind === "file"}
        <!-- files have their download in the body -->
      {:else if post.attachment}
        <a class="icon-btn" href={fileUrl(post.attachment, true)} download={post.attachment.name || t().board.fallbackName} aria-label={t().common.download} title={t().common.download}><Download size={16} aria-hidden="true" /></a>
      {:else}
        <button type="button" class="icon-btn" aria-label={copied ? t().common.copied : t().common.copy} title={copied ? t().common.copied : t().common.copy} onclick={copy}>
          {#if copied}<Check size={16} aria-hidden="true" />{:else}<Copy size={16} aria-hidden="true" />{/if}
        </button>
      {/if}
      {#if post.canDelete}
        <span class="more">
          <button
            type="button" class="icon-btn" bind:this={menuButton} aria-haspopup="menu" aria-expanded={menuOpen}
            aria-label={t().board.moreActions} title={t().board.moreActions} onclick={() => (menuOpen = !menuOpen)}
          >
            <Ellipsis size={16} aria-hidden="true" />
          </button>
          {#if menuOpen}
            <div class="menu" role="menu" tabindex="-1" onkeydown={(e) => { if (e.key === "Escape") { e.stopPropagation(); menuOpen = false; menuButton?.focus(); } }}>
              <button type="button" role="menuitem" class="danger" onclick={remove} {@attach (el) => el.focus()}>
                <Trash2 size={15} aria-hidden="true" />{t().common.delete}
              </button>
            </div>
          {/if}
        </span>
      {/if}
    </span>
  </footer>
  {#if picking}
    <ReactionPicker reactions={post.reactions} onpick={pick} onclose={() => (picking = false)} />
  {/if}
</article>

<style>
  .card { position: relative; background: var(--color-white); border: 1px solid var(--color-blue-100); border-radius: var(--radius-md); padding: 12px 12px 8px; display: flex; flex-direction: column; gap: 8px; }
  /* 28 px hit area around the 9 px dot, centred on the top edge */
  .pin { position: absolute; top: -14px; left: 50%; width: 28px; height: 28px; margin-left: -14px; padding: 0; border: 0; background: none; cursor: pointer; z-index: 1; }
  .pin .dot, .pin .glyph { position: absolute; left: 50%; top: 50%; border-radius: 50%; transform: translate(-50%, -50%); }
  .pin .dot { width: 9px; height: 9px; background: var(--color-navy); transition: width 0.12s, height 0.12s; }
  .pin .glyph { display: flex; align-items: center; justify-content: center; color: var(--color-white); opacity: 0; transition: opacity 0.12s; }
  .pin:hover .dot, .pin:focus-visible .dot { width: 24px; height: 24px; }
  .pin:hover .glyph, .pin:focus-visible .glyph { opacity: 1; }
  .pin:focus-visible { outline: none; }
  .pin:focus-visible .dot { box-shadow: 0 0 0 3px var(--color-sky); }
  @media (prefers-reduced-motion: reduce) { .pin .dot, .pin .glyph { transition: none; } }
  /* new post: pinned on from above, then a yellow glow that fades (the colour of the note on the closed toggle) */
  .card.land { animation: card-land 480ms var(--ease-out) both, card-glow 3s ease-out; }
  .card.glow { animation: card-glow 3s ease-out; }
  @keyframes card-land {
    0% { transform: translateY(-18px) rotate(-2.5deg) scale(1.03); opacity: 0; }
    55% { transform: translateY(2px) rotate(0.6deg); opacity: 1; }
    100% { transform: none; }
  }
  @keyframes card-glow {
    0%, 25% { border-color: var(--color-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 55%, transparent); background: color-mix(in srgb, var(--color-accent) 18%, var(--color-white)); }
    100% { border-color: var(--color-blue-100); box-shadow: 0 0 0 3px transparent; background: var(--color-white); }
  }
  header { display: flex; align-items: center; gap: 8px; }
  .av { width: 26px; height: 26px; border-radius: 50%; background: var(--color-blue-500); color: var(--color-white); font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; }
  .av img { width: 100%; height: 100%; object-fit: cover; }
  .av.me { background: var(--color-navy); box-shadow: 0 0 0 2px var(--color-accent); }
  .who { display: flex; flex-direction: column; line-height: 1.2; font-size: 13px; min-width: 0; }
  .when { font-size: 12px; color: var(--color-blue-700); }
  .progress { margin-left: auto; display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0; font-size: 12px; font-weight: 700; color: var(--color-blue-700); }
  .progress.complete { color: var(--color-navy); }
  .progress + .summary { margin-left: 0; }
  .summary {
    margin-left: auto; display: inline-flex; align-items: center; gap: 4px; min-height: 26px; padding: 0 8px 0 4px; flex-shrink: 0;
    border: 1px solid var(--color-blue-300); border-radius: 999px; background: var(--color-white); color: var(--color-navy);
    font-size: 12px; font-weight: 700; cursor: pointer;
  }
  .summary:hover { background: var(--color-blue-100); }
  .summary.mine { border-color: var(--color-navy); background: var(--color-blue-100); }
  .icons { display: inline-flex; }
  /* slightly overlapping, like a stack */
  .icon { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: var(--color-white); border: 1px solid var(--color-blue-100); }
  .icon + .icon { margin-left: -5px; }
  .body.clamped { max-height: calc(var(--lines) * 1.5em); overflow: hidden; -webkit-mask-image: linear-gradient(to bottom, #000 70%, transparent); mask-image: linear-gradient(to bottom, #000 70%, transparent); }
  .edited { font-size: 11px; color: var(--color-blue-700); }
  footer { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; }
  .end { justify-self: end; display: inline-flex; }
  .link { justify-self: start; text-decoration: none; border: 0; background: none; padding: 4px 0; min-height: 28px; display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: var(--color-blue-500); cursor: pointer; }
  .icon-btn {
    width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: var(--radius-md);
    background: none; color: var(--color-blue-500); cursor: pointer;
  }
  .icon-btn:hover { background: var(--color-blue-100); color: var(--color-navy); }
  .more { position: relative; display: inline-flex; }
  .more .icon-btn[aria-expanded="true"] { background: var(--color-blue-100); color: var(--color-navy); }
  .menu {
    position: absolute; right: 0; top: calc(100% + 4px); z-index: 3; min-width: 140px; display: flex; flex-direction: column; padding: 4px;
    border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-white); box-shadow: 0 4px 12px rgb(0 56 105 / 0.15);
  }
  .menu button { display: flex; align-items: center; gap: 8px; min-height: 32px; padding: 0 10px; border: 0; border-radius: var(--radius-md); background: none; color: var(--color-navy); font-size: 14px; text-align: left; cursor: pointer; }
  .menu button:hover { background: var(--color-blue-100); }
  .menu .danger { color: var(--color-alert); }
  .menu button:focus-visible { outline: 3px solid var(--color-sky); outline-offset: -3px; }
  .react[aria-expanded="true"] { background: var(--color-blue-100); color: var(--color-navy); }
  .link:focus-visible, .icon-btn:focus-visible, .summary:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
</style>
