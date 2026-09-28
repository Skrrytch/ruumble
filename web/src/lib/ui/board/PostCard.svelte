<script lang="ts">
  import Maximize2 from "@lucide/svelte/icons/maximize-2";
  import type { Post } from "@ruumble/protocol";
  import { KIND_LABEL, isLong, relativeTime } from "../../board/model.ts";
  import { initials } from "../../model/building.ts";
  import { getFileUrl } from "../../board/context.ts";
  import PostBody from "./PostBody.svelte";

  let { post, now, onopen }: { post: Post; now: number; onopen: (post: Post) => void } = $props();

  const fileUrl = getFileUrl();
  let copied = $state(false);
  const long = $derived(!post.attachment && isLong(post.text));

  async function copy() {
    await navigator.clipboard?.writeText(post.text).catch(() => {});
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<article class="card" aria-label="Beitrag von {post.authorName}">
  <span class="pin" aria-hidden="true"></span>
  <header>
    <span class="av" class:me={post.mine} aria-hidden="true">{initials(post.authorName)}</span>
    <span class="who">
      <strong>{post.authorName}</strong>
      <span class="when" title={new Date(post.createdAt).toLocaleString("de-DE")}>{relativeTime(post.createdAt, now)}</span>
    </span>
    <span class="kind">{KIND_LABEL[post.kind]}</span>
  </header>
  <div class="body" class:clamped={long}>
    <PostBody {post} />
  </div>
  {#if post.updatedByName}
    <div class="edited">zuletzt bearbeitet von {post.updatedByName} · {relativeTime(post.updatedAt, now)}</div>
  {/if}
  <footer>
    <button type="button" class="link" onclick={() => onopen(post)}><Maximize2 size={13} /> Öffnen · bearbeiten</button>
    {#if post.kind === "file"}
      <span></span>
    {:else if post.attachment}
      <a class="link strong" href={fileUrl(post.attachment, true)} download={post.attachment.name || "datei"}>Herunterladen</a>
    {:else}
      <button type="button" class="link strong" onclick={copy}>{copied ? "Kopiert" : "Kopieren"}</button>
    {/if}
  </footer>
</article>

<style>
  .card { position: relative; background: var(--color-white); border: 1px solid var(--color-blue-100); border-radius: var(--radius-md); padding: 12px 12px 10px; display: flex; flex-direction: column; gap: 8px; }
  .pin { position: absolute; top: -5px; left: 50%; width: 9px; height: 9px; margin-left: -4.5px; border-radius: 50%; background: var(--color-navy); }
  header { display: flex; align-items: center; gap: 8px; }
  .av { width: 26px; height: 26px; border-radius: 50%; background: var(--color-blue-500); color: var(--color-white); font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .av.me { background: var(--color-navy); box-shadow: 0 0 0 2px var(--color-accent); }
  .who { display: flex; flex-direction: column; line-height: 1.2; font-size: 13px; }
  .when { font-size: 12px; color: var(--color-blue-700); }
  .kind { margin-left: auto; font-size: 12px; color: var(--color-blue-500); }
  .body.clamped { max-height: calc(8 * 1.5em); overflow: hidden; -webkit-mask-image: linear-gradient(to bottom, #000 70%, transparent); mask-image: linear-gradient(to bottom, #000 70%, transparent); }
  .edited { font-size: 11px; color: var(--color-blue-700); }
  footer { display: flex; justify-content: space-between; }
  .link { text-decoration: none; border: 0; background: none; padding: 4px 0; min-height: 28px; display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: var(--color-blue-500); cursor: pointer; }
  .link.strong { font-weight: 700; }
  .link:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
</style>
