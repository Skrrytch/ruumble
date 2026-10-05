<script lang="ts">
  import { showModal } from "../modal.ts";
  import { copyText } from "../../board/clipboard.ts";
  import X from "@lucide/svelte/icons/x";
  import type { Post } from "@ruumble/protocol";
  import { relativeTime } from "../../board/model.ts";
  import { t } from "../../i18n/index.svelte.ts";
  import { CODE_LANGUAGES } from "../../board/render.ts";
  import LinkList from "./LinkList.svelte";
  import PostBody from "./PostBody.svelte";

  let {
    post,
    onclose,
    onsave,
    ondelete,
    ontoggle,
  }: {
    post: Post;
    onclose: () => void;
    onsave: (text: string, language?: string) => Promise<boolean>;
    ondelete: () => Promise<boolean>;
    /** tick a task of a task list (A2) */
    ontoggle: (index: number, done: boolean) => void;
  } = $props();

  let dialog: HTMLDialogElement;
  let editing = $state(false);
  let draft = $state("");
  let language = $state("");
  let busy = $state(false);
  let copied = $state(false);
  // images and files: the caption is what gets edited, it may be empty
  const hasAttachment = $derived(post.kind === "image" || post.kind === "file");

  $effect(() => {
    return showModal(dialog, () => onclose());
  });

  function startEdit() {
    draft = post.text;
    language = post.language ?? "";
    editing = true;
  }

  async function save() {
    busy = true;
    if (await onsave(draft, post.kind === "code" ? language || undefined : undefined)) editing = false;
    busy = false;
  }

  async function remove() {
    if (!confirm(t().board.confirmDelete)) return;
    busy = true;
    if (await ondelete()) onclose();
    busy = false;
  }

  async function copy() {
    copied = await copyText(post.text);
    setTimeout(() => (copied = false), 1500);
  }
</script>

<dialog bind:this={dialog} aria-label={t().board.postBy(post.authorName)} onkeydown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && editing) void save(); }}>
  <header>
    <span><strong>{post.authorName}</strong> · {t().board.kinds[post.kind]} · {relativeTime(post.createdAt)}</span>
    <button type="button" class="icon" aria-label={t().common.close} onclick={onclose}><X size={18} /></button>
  </header>
  <div class="content">
    {#if editing}
      {#if post.kind === "code"}
        <label class="lang">{t().board.codeLanguage}
          <select bind:value={language}><option value="">{t().common.auto}</option>{#each CODE_LANGUAGES as l (l)}<option value={l}>{l}</option>{/each}</select>
        </label>
      {/if}
      <textarea bind:value={draft} class:mono={post.kind === "code"} class:short={hasAttachment} aria-label={hasAttachment ? t().board.editDescription : t().board.editPost} placeholder={hasAttachment ? t().board.captionPlaceholder : ""} spellcheck={post.kind !== "code"}></textarea>
    {:else}
      <PostBody {post} numbers large {ontoggle} />
      {#if post.kind === "code"}<div class="links"><LinkList text={post.text} /></div>{/if}
    {/if}
  </div>
  {#if post.updatedByName}<p class="edited">{t().board.editedBy(post.updatedByName)}</p>{/if}
  <footer>
    {#if post.canDelete}<button type="button" class="danger" disabled={busy} onclick={remove}>{t().common.delete}</button>{/if}
    <span class="spacer"></span>
    {#if editing}
      <button type="button" disabled={busy} onclick={() => (editing = false)}>{t().common.cancel}</button>
      <button type="button" class="primary" disabled={busy || (!hasAttachment && !draft.trim())} onclick={save}>{t().common.save}</button>
    {:else}
      {#if post.text.trim()}<button type="button" onclick={copy}>{copied ? t().common.copied : t().common.copy}</button>{/if}
      <button type="button" class="primary" onclick={startEdit}>{hasAttachment ? t().board.editDescription : t().common.edit}</button>
    {/if}
  </footer>
</dialog>

<style>
  dialog { width: min(820px, 92vw); max-height: 86vh; border: 0; border-radius: var(--radius-md); padding: 0; color: var(--color-navy); display: flex; flex-direction: column; }
  dialog::backdrop { background: rgb(0 56 105 / 0.45); }
  header, footer { display: flex; align-items: center; gap: 8px; padding: 12px 16px; }
  header { border-bottom: 1px solid var(--color-blue-100); font-size: 14px; justify-content: space-between; }
  footer { border-top: 1px solid var(--color-blue-100); }
  .content { padding: 16px; overflow: auto; flex: 1; }
  .spacer { flex: 1; }
  textarea { width: 100%; min-height: 50vh; font: inherit; font-size: 14px; padding: 10px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); resize: vertical; }
  textarea.short { min-height: 96px; }
  textarea.mono { font-family: var(--font-mono); font-size: 13px; }
  .lang { display: flex; gap: 8px; align-items: center; font-size: 13px; margin-bottom: 8px; }
  .links { margin-top: 8px; }
  .edited { margin: 0 16px 8px; font-size: 12px; color: var(--color-blue-700); }
  button { min-height: 36px; padding: 0 14px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-white); color: var(--color-navy); font-size: 14px; cursor: pointer; }
  button.primary { background: var(--color-navy); border-color: var(--color-navy); color: var(--color-white); font-weight: 700; }
  button.danger { border-color: var(--color-alert); color: var(--color-alert); }
  button.icon { border: 0; min-height: 36px; min-width: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
  button:disabled { opacity: 0.5; cursor: default; }
  button:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
</style>
