<script lang="ts">
  import Code from "@lucide/svelte/icons/code";
  import Paperclip from "@lucide/svelte/icons/paperclip";
  import X from "@lucide/svelte/icons/x";
  import SendHorizontal from "@lucide/svelte/icons/send-horizontal";
  import { BOARD_IMAGE_TYPES, BOARD_LIMITS, type PostKind, type Uploaded } from "@ruumble/protocol";
  import type { BoardResult } from "../../adapter/types.ts";
  import { t } from "../../i18n/index.svelte.ts";
  import { boardErrorText } from "../../state.svelte.ts";
  import { formatSize, looksLikeCode, pastedName } from "../../board/model.ts";
  import { CODE_LANGUAGES } from "../../board/render.ts";

  let {
    onpin,
    onupload,
    onattach,
  }: {
    onpin: (kind: PostKind, text: string, language?: string) => Promise<boolean>;
    onupload: (file: Blob, name: string, onProgress: (fraction: number) => void) => Promise<BoardResult<Uploaded>>;
    onattach: (attachment: Uploaded, caption: string) => Promise<boolean>;
  } = $props();

  /** one attachment per post (AP11.3): uploaded immediately, pinned only on send */
  type Pending = { name: string; size: number; preview: string | null; progress: number; uploaded: Uploaded | null; error: string | null };
  let pending = $state<Pending | null>(null);
  let picker: HTMLInputElement;
  let uploadRun = 0;

  /** take over a file (paperclip, paste or drop onto the board) */
  export async function attach(file: File): Promise<void> {
    clearAttachment();
    const name = pastedName(file);
    const preview = (BOARD_IMAGE_TYPES as readonly string[]).includes(file.type) ? URL.createObjectURL(file) : null;
    const run = ++uploadRun;
    pending = { name, size: file.size, preview, progress: 0, uploaded: null, error: null };
    codeMode = false;
    suggestCode = false;
    if (file.size > BOARD_LIMITS.fileBytes) {
      pending.error = boardErrorText("too-large");
      return;
    }
    const r = await onupload(file, name, (f) => { if (pending && run === uploadRun) pending.progress = f; });
    if (!pending || run !== uploadRun) return; // removed or replaced in the meantime
    if (r.ok) pending.uploaded = r.value;
    else pending.error = boardErrorText(r.error);
  }

  function clearAttachment() {
    uploadRun++;
    if (pending?.preview) URL.revokeObjectURL(pending.preview);
    pending = null;
  }


  let text = $state("");
  let codeMode = $state(false);
  let language = $state("");
  let suggestCode = $state(false);
  let busy = $state(false);
  const canSend = $derived(pending ? !!pending.uploaded : !!text.trim());
  /** one line until someone starts writing: the list gets the space (tools and a taller field only then) */
  let focused = $state(false);
  const expanded = $derived(focused || !!text || !!pending || codeMode || suggestCode);

  function onpaste(e: ClipboardEvent) {
    const file = e.clipboardData?.files?.[0];
    if (file) {
      e.preventDefault();
      void attach(file);
      return;
    }
    const pasted = e.clipboardData?.getData("text/plain") ?? "";
    // paste mode for source code: suggest automatically
    if (!codeMode && looksLikeCode(pasted)) suggestCode = true;
  }

  async function submit() {
    if (!canSend || busy) return;
    busy = true;
    const ok = pending?.uploaded
      ? await onattach(pending.uploaded, text)
      : await onpin(codeMode ? "code" : "text", text, codeMode ? language || undefined : undefined);
    if (ok) {
      clearAttachment();
      text = "";
      codeMode = false;
      language = "";
      suggestCode = false;
    }
    busy = false;
  }
</script>

<form
  class="composer" class:collapsed={!expanded}
  onsubmit={(e) => { e.preventDefault(); void submit(); }}
  onfocusin={() => (focused = true)}
  onfocusout={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) focused = false; }}
>
  {#if suggestCode}
    <div class="suggest" role="status">
      {t().board.looksLikeCode}
      <button type="button" onclick={() => { codeMode = true; suggestCode = false; }}>{t().common.yes}</button>
      <button type="button" onclick={() => (suggestCode = false)}>{t().common.no}</button>
    </div>
  {/if}
  {#if pending}
    <div class="attachment" class:failed={!!pending.error}>
      {#if pending.preview}<img src={pending.preview} alt="" />{/if}
      <span class="meta">
        <span class="fname">{pending.name}</span>
        {#if pending.error}
          <span class="err" role="alert">{pending.error}</span>
        {:else if pending.uploaded}
          <span class="size">{t().board.ready(formatSize(pending.size))}</span>
        {:else}
          <span class="size">{t().board.uploading(Math.round(pending.progress * 100))}</span>
          <progress max="1" value={pending.progress} aria-label={t().board.uploadProgress}></progress>
        {/if}
      </span>
      <button type="button" class="remove" aria-label={t().board.removeAttachment} title={t().board.removeAttachment} onclick={clearAttachment}><X size={16} /></button>
    </div>
  {/if}
  <textarea
    bind:value={text}
    class:mono={codeMode}
    class:short={!!pending}
    placeholder={pending ? t().board.captionPlaceholder : codeMode ? t().board.placeholderCode : t().board.placeholder}
    aria-label={t().board.newPost}
    spellcheck={!codeMode}
    {onpaste}
    onkeydown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void submit(); } }}
  ></textarea>
  <div class="bar">
    <input bind:this={picker} type="file" hidden onchange={() => { const f = picker.files?.[0]; if (f) void attach(f); picker.value = ""; }} />
    <button type="button" class="tool" aria-label={t().board.attach} title={t().board.attachTitle(formatSize(BOARD_LIMITS.fileBytes))} onclick={() => picker.click()}>
      <Paperclip size={18} />
    </button>
    <button type="button" class="tool" aria-pressed={codeMode} aria-label={t().board.codeMode} title={t().board.codeMode} disabled={!!pending} onclick={() => (codeMode = !codeMode)}>
      <Code size={18} />
    </button>
    {#if codeMode}
      <select bind:value={language} aria-label={t().board.codeLanguage}><option value="">{t().common.auto}</option>{#each CODE_LANGUAGES as l (l)}<option value={l}>{l}</option>{/each}</select>
    {:else}
      <span class="hint">Markdown</span>
    {/if}
    <button type="submit" class="pin" aria-label={t().board.send} title={t().board.sendTitle} disabled={busy || !canSend}><SendHorizontal size={20} /></button>
  </div>
</form>

<style>
  .composer { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-top: 1px solid var(--color-blue-300); background: transparent; }
  textarea { width: 100%; min-height: 64px; max-height: 40vh; resize: vertical; padding: 8px 10px; font: inherit; font-size: 14px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); }
  textarea.short { min-height: 44px; }
  .collapsed textarea { min-height: 38px; height: 38px; resize: none; overflow: hidden; }
  .collapsed .bar { display: none; }
  textarea.mono { font-family: var(--font-mono); font-size: 13px; }
  textarea:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 0; }
  .bar { display: flex; align-items: center; gap: 8px; }
  .tool { width: 40px; height: 40px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-white); color: var(--color-navy); display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .tool[aria-pressed="true"] { background: var(--color-navy); border-color: var(--color-navy); color: var(--color-white); }
  .hint { font-size: 12px; color: var(--color-blue-700); flex: 1; }
  select { flex: 1; min-height: 36px; font: inherit; font-size: 13px; }
  .pin { margin-left: auto; width: 44px; min-height: 40px; padding: 0; display: flex; align-items: center; justify-content: center; border: 0; border-radius: var(--radius-md); background: var(--color-navy); color: var(--color-white); font-weight: 700; cursor: pointer; }
  .tool:disabled { opacity: 0.4; cursor: default; }
  .attachment { display: flex; align-items: center; gap: 10px; padding: 8px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-white); }
  .attachment.failed { border-color: var(--color-alert); }
  .attachment img { width: 48px; height: 48px; object-fit: cover; border-radius: 4px; flex-shrink: 0; }
  .meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; line-height: 1.3; }
  .fname { font-size: 13px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .size { font-size: 12px; color: var(--color-blue-700); }
  .err { font-size: 12px; color: var(--color-alert); }
  progress { width: 100%; height: 4px; accent-color: var(--color-navy); }
  .remove { width: 32px; height: 32px; border: 0; background: none; color: var(--color-navy); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; border-radius: var(--radius-md); flex-shrink: 0; }
  .remove:hover { background: var(--color-surface); }
  .pin:disabled { opacity: 0.5; cursor: default; }
  .suggest { display: flex; align-items: center; gap: 8px; font-size: 13px; background: var(--color-blue-100); padding: 6px 8px; border-radius: var(--radius-md); }
  .suggest button { min-height: 28px; padding: 0 10px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-white); cursor: pointer; }
  button:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
</style>
