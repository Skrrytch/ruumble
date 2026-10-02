<script lang="ts">
  import { copyText } from "../../board/clipboard.ts";
  import Check from "@lucide/svelte/icons/check";
  import Copy from "@lucide/svelte/icons/copy";
  import Download from "@lucide/svelte/icons/download";
  import Ellipsis from "@lucide/svelte/icons/ellipsis";
  import Forward from "@lucide/svelte/icons/forward";
  import FaceSlightlySmilingPlus from "@lucide/svelte/icons/face-slightly-smiling-plus";
  import Maximize2 from "@lucide/svelte/icons/maximize-2";
  import ListChecks from "@lucide/svelte/icons/list-checks";
  import Pin from "@lucide/svelte/icons/pin";
  import PinOff from "@lucide/svelte/icons/pin-off";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import { parseTaskList, type Post, type ReactionKind } from "@ruumble/protocol";
  import { PREVIEW_LINES, isLong, relativeTime, summarizeReactions, type CopyTarget, type CopyTargets } from "../../board/model.ts";
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
  /** `targets`, `oncopy`: "Copy to room …" in the "…" menu, the rooms per floor (copyTargets) */
  /** `head`: show the author header (first post of a group, postGroups); `next`: the following card continues the group */
  let { post, now, avatar = null, pinned = false, arrival = null, targets = [], head = true, next = false, onopen, onreact, ontoggle, onpin, ondelete, oncopy }: {
    post: Post; now: number; avatar?: string | null; pinned?: boolean; arrival?: "land" | "glow" | null; targets?: CopyTargets; head?: boolean; next?: boolean;
    onopen: (post: Post) => void; onreact: (post: Post, kind: ReactionKind) => void;
    ontoggle: (post: Post, index: number, done: boolean) => void; onpin: (post: Post) => void; ondelete: (post: Post) => void; oncopy: (post: Post, target: CopyTarget) => void;
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

  const created = $derived(new Date(post.createdAt).toLocaleString(intlLocale()));
  const copiedFrom = $derived(
    post.copiedFrom && (post.copiedFrom.authorName === post.authorName ? t().board.copiedFrom(post.copiedFrom.roomName) : t().board.copiedFromBy(post.copiedFrom.roomName, post.copiedFrom.authorName)),
  );

  // "…" menu: closes on choice, Escape and a click elsewhere; "Copy to room …" turns it into the list of rooms
  let menuOpen = $state(false);
  let choosing = $state(false);
  let menuButton = $state<HTMLButtonElement | null>(null);
  let more = $state<HTMLElement | null>(null);
  const hasTargets = $derived(targets.length > 0);
  $effect(() => {
    if (!menuOpen) {
      choosing = false;
      return;
    }
    // only this card's menu counts as inside: the "…" of another card closes this one
    const close = (e: MouseEvent) => { if (!more?.contains(e.target as Node)) menuOpen = false; };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  });
  function copyTo(target: CopyTarget): void {
    menuOpen = false;
    menuButton?.focus();
    oncopy(post, target);
  }
  const focus = (el: HTMLElement) => el.focus();
  /** open the menu where there is more room in the scrolling list (again when it turns into the list of rooms), scroll inside beyond that */
  function fit(menu: HTMLElement): void {
    const area = menu.closest(".list")?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
    const button = menu.parentElement!.getBoundingClientRect();
    const below = area.bottom - button.bottom - 8, above = button.top - area.top - 8;
    const up = menu.scrollHeight > below && above > below;
    menu.classList.toggle("up", up);
    menu.style.maxHeight = `${Math.max(160, up ? above : below)}px`;
  }

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

<!-- compact: one header line, only for the first post of a group; the actions appear on hover and keyboard focus -->
<article
  class="card" class:cont={!head} class:joined={next} class:active={menuOpen || picking || copied}
  class:land={arrival === "land"} class:glow={arrival === "glow"} aria-label={t().board.postBy(post.authorName)}
>
  <!-- the pin dot is also the handle for "keep on top": it grows into a button on hover and keyboard focus -->
  <button type="button" class="pin" class:pinned aria-label={pinned ? t().board.unpin : t().board.pinOnTop} title={pinned ? t().board.unpin : t().board.pinOnTop} onclick={() => onpin(post)}>
    <span class="dot" aria-hidden="true"></span>
    <span class="glyph" aria-hidden="true">{#if pinned}<PinOff size={12} />{:else}<Pin size={12} />{/if}</span>
  </button>
  {#if head}
    <header>
      <span class="av" class:me={post.mine} aria-hidden="true">
        {#if avatar && avatarBroken !== avatar}<img src={avatar} alt="" onerror={() => (avatarBroken = avatar)} />{:else}{initials(post.authorName)}{/if}
      </span>
      <span class="who" title={copiedFrom ? `${created} · ${copiedFrom}` : created}>
        <strong>{post.authorName}</strong><span class="when">{` · ${relativeTime(post.createdAt, now)}`}{#if copiedFrom}{` · ${copiedFrom}`}{/if}</span>
      </span>
      {@render badges()}
    </header>
  {/if}
  <div class="row">
    <div class="body" class:clamped={long} style:--lines={PREVIEW_LINES}>
      <PostBody {post} ontoggle={(index, done) => ontoggle(post, index, done)} />
    </div>
    {#if !head && (tasks || summary.total)}<span class="side">{@render badges()}</span>{/if}
  </div>
  {#if post.updatedByName}
    <div class="edited">{t().board.editedBy(post.updatedByName)} · {relativeTime(post.updatedAt, now)}</div>
  {/if}
  <div class="tools">
    {#if !head}<span class="stamp" title={created}>{relativeTime(post.createdAt, now)}</span>{/if}
    <button type="button" class="icon-btn" aria-label={t().board.open} title={t().board.open} onclick={() => onopen(post)}><Maximize2 size={15} aria-hidden="true" /></button>
    <button type="button" class="icon-btn react" aria-expanded={picking} aria-label={t().board.react} title={t().board.react} onclick={() => (picking = !picking)}>
      <FaceSlightlySmilingPlus size={17} aria-hidden="true" />
    </button>
    {#if post.kind === "file"}
      <!-- files have their download in the body -->
    {:else if post.attachment}
      <a class="icon-btn" href={fileUrl(post.attachment, true)} download={post.attachment.name || t().board.fallbackName} aria-label={t().common.download} title={t().common.download}><Download size={15} aria-hidden="true" /></a>
    {:else}
      <button type="button" class="icon-btn" aria-label={copied ? t().common.copied : t().common.copy} title={copied ? t().common.copied : t().common.copy} onclick={copy}>
        {#if copied}<Check size={15} aria-hidden="true" />{:else}<Copy size={15} aria-hidden="true" />{/if}
      </button>
    {/if}
    <span class="more" bind:this={more}>
      <button
        type="button" class="icon-btn" bind:this={menuButton} aria-haspopup="menu" aria-expanded={menuOpen}
        aria-label={t().board.moreActions} title={t().board.moreActions} onclick={() => (menuOpen = !menuOpen)}
      >
        <Ellipsis size={16} aria-hidden="true" />
      </button>
      {#if menuOpen}
        <div class="menu" role="menu" tabindex="-1" {@attach (el) => { void choosing; fit(el); }} aria-label={choosing ? t().board.copyToRoomTitle : t().board.moreActions} onkeydown={(e) => { if (e.key === "Escape") { e.stopPropagation(); menuOpen = false; menuButton?.focus(); } }}>
          {#if choosing}
            <div class="menu-title" aria-hidden="true">{t().board.copyToRoomTitle}</div>
            {#each targets as group, g (group.floorId)}
              {#if targets.length > 1}<div class="floor" aria-hidden="true">{group.floor}</div>{/if}
              {#each group.rooms as room, r (room.channelId)}
                <button type="button" role="menuitem" onclick={() => copyTo(room)} {@attach g === 0 && r === 0 && focus}>{room.name}</button>
              {/each}
            {/each}
          {:else}
            <!-- stopPropagation: the menu changes its content, the click must not count as one outside it -->
            <button type="button" role="menuitem" aria-disabled={!hasTargets} aria-label={t().board.copyToRoom} title={hasTargets ? t().board.copyToRoom : t().board.copyNoRooms}
              onclick={(e) => { e.stopPropagation(); if (hasTargets) choosing = true; }} {@attach focus}>
              <Forward size={15} aria-hidden="true" />{t().board.copyToRoomShort}
            </button>
            {#if post.canDelete}
              <button type="button" role="menuitem" class="danger" onclick={remove}>
                <Trash2 size={15} aria-hidden="true" />{t().common.delete}
              </button>
            {/if}
          {/if}
        </div>
      {/if}
    </span>
  </div>
  {#if picking}
    <ReactionPicker reactions={post.reactions} onpick={pick} onclose={() => (picking = false)} />
  {/if}
</article>

{#snippet badges()}
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
{/snippet}

<style>
  .card { position: relative; background: var(--color-white); border: 1px solid var(--color-blue-100); border-radius: var(--radius-md); padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; }
  /* a group (postGroups): the cards join, a hairline between the posts */
  .card.joined { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
  .card.cont { margin-top: -9px; border-top-color: var(--color-blue-100); border-top-style: dashed; border-top-left-radius: 0; border-top-right-radius: 0; }
  /* 24 px hit area around the 7 px dot, centred on the top edge */
  .pin { position: absolute; top: -12px; left: 50%; width: 24px; height: 24px; margin-left: -12px; padding: 0; border: 0; background: none; cursor: pointer; z-index: 1; }
  .pin .dot, .pin .glyph { position: absolute; left: 50%; top: 50%; border-radius: 50%; transform: translate(-50%, -50%); }
  .pin .dot { width: 7px; height: 7px; background: var(--color-navy); transition: width 0.12s, height 0.12s; }
  /* like the actions: only on hover and keyboard focus, so a column of short posts stays calm */
  .pin { opacity: 0; transition: opacity 0.1s; pointer-events: none; }
  .card:hover .pin, .card:focus-within .pin, .card.active .pin { opacity: 1; pointer-events: auto; }
  .pin .glyph { display: flex; align-items: center; justify-content: center; color: var(--color-white); opacity: 0; transition: opacity 0.12s; }
  .pin:hover .dot, .pin:focus-visible .dot { width: 22px; height: 22px; }
  .pin:hover .glyph, .pin:focus-visible .glyph { opacity: 1; }
  .pin:focus-visible { outline: none; }
  .pin:focus-visible .dot { box-shadow: 0 0 0 3px var(--color-sky); }
  @media (prefers-reduced-motion: reduce) { .pin, .pin .dot, .pin .glyph { transition: none; } }
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
  header { display: flex; align-items: center; gap: 6px; min-height: 22px; }
  .av { width: 20px; height: 20px; border-radius: 50%; background: var(--color-blue-500); color: var(--color-white); font-size: 9px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; }
  .av img { width: 100%; height: 100%; object-fit: cover; }
  .av.me { background: var(--color-navy); box-shadow: 0 0 0 2px var(--color-accent); }
  .who { line-height: 1.2; font-size: 13px; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .when { font-size: 12px; color: var(--color-blue-700); }
  .progress { margin-left: auto; display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0; font-size: 12px; font-weight: 700; color: var(--color-blue-700); }
  .progress.complete { color: var(--color-navy); }
  .progress + .summary { margin-left: 0; }
  .summary {
    margin-left: auto; display: inline-flex; align-items: center; gap: 4px; min-height: 22px; padding: 0 8px 0 4px; flex-shrink: 0;
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
  .row { display: flex; align-items: flex-start; gap: 8px; }
  .row .body { flex: 1; min-width: 0; }
  .side { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .side .summary, .side .progress { margin-left: 0; }
  .edited { font-size: 11px; color: var(--color-blue-700); }
  /* the post being pointed at stands out a little, so it is clear what the actions apply to (also within a group) */
  .card:hover, .card:focus-within, .card.active { background: color-mix(in srgb, var(--color-blue-100) 35%, var(--color-white)); }
  /* actions: float on the bottom edge of the post they belong to, shown on hover, keyboard focus and while a menu or the picker is open */
  .tools {
    position: absolute; bottom: -19px; right: 8px; z-index: 2; display: inline-flex; align-items: center; gap: 1px; padding: 1px;
    border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-white); box-shadow: 0 2px 6px rgb(0 56 105 / 0.12);
    opacity: 0; transition: opacity 0.1s; pointer-events: none; /* hidden, it must not catch clicks meant for the next post */
  }
  .card:hover .tools, .card:focus-within .tools, .card.active .tools { opacity: 1; pointer-events: auto; }
  @media (prefers-reduced-motion: reduce) { .tools { transition: none; } }
  .tools .icon-btn { width: 26px; height: 26px; }
  .stamp { padding: 0 6px; font-size: 12px; color: var(--color-blue-700); white-space: nowrap; }
  .icon-btn {
    width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: var(--radius-md);
    background: none; color: var(--color-blue-500); cursor: pointer;
  }
  .icon-btn:hover { background: var(--color-blue-100); color: var(--color-navy); }
  .more { position: relative; display: inline-flex; }
  .more .icon-btn[aria-expanded="true"] { background: var(--color-blue-100); color: var(--color-navy); }
  .menu {
    position: absolute; right: 0; top: calc(100% + 4px); z-index: 3; min-width: 170px; display: flex; flex-direction: column; padding: 4px;
    border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-white); box-shadow: 0 4px 12px rgb(0 56 105 / 0.15);
  }
  .menu button { white-space: nowrap; display: flex; align-items: center; gap: 8px; min-height: 32px; padding: 0 10px; border: 0; border-radius: var(--radius-md); background: none; color: var(--color-navy); font-size: 14px; text-align: left; cursor: pointer; }
  .menu button:hover { background: var(--color-blue-100); }
  .menu .danger { color: var(--color-alert); }
  .menu [aria-disabled="true"] { color: var(--color-blue-700); cursor: default; }
  .menu [aria-disabled="true"]:hover { background: none; }
  .menu-title { padding: 6px 10px 4px; font-size: 12px; font-weight: 700; color: var(--color-blue-700); white-space: nowrap; }
  .floor { padding: 6px 10px 2px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-blue-500); }
  .menu { overflow-y: auto; }
  .menu:global(.up) { top: auto; bottom: calc(100% + 4px); }
  .menu button:focus-visible { outline: 3px solid var(--color-sky); outline-offset: -3px; }
  .react[aria-expanded="true"] { background: var(--color-blue-100); color: var(--color-navy); }
  .icon-btn:focus-visible, .summary:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
</style>
