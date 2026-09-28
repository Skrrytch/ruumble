<script lang="ts">
  import Code from "@lucide/svelte/icons/code";
  import SendHorizontal from "@lucide/svelte/icons/send-horizontal";
  import type { PostKind } from "@ruumble/protocol";
  import { looksLikeCode } from "../../board/model.ts";
  import { CODE_LANGUAGES } from "../../board/render.ts";

  let { onpin }: { onpin: (kind: PostKind, text: string, language?: string) => Promise<boolean> } = $props();

  let text = $state("");
  let codeMode = $state(false);
  let language = $state("");
  let suggestCode = $state(false);
  let busy = $state(false);

  function onpaste(e: ClipboardEvent) {
    const pasted = e.clipboardData?.getData("text/plain") ?? "";
    // Einfügemodus für Quellcode: automatisch vorschlagen (ideen.md, A)
    if (!codeMode && looksLikeCode(pasted)) suggestCode = true;
  }

  async function submit() {
    if (!text.trim() || busy) return;
    busy = true;
    if (await onpin(codeMode ? "code" : "text", text, codeMode ? language || undefined : undefined)) {
      text = "";
      codeMode = false;
      language = "";
      suggestCode = false;
    }
    busy = false;
  }
</script>

<form class="composer" onsubmit={(e) => { e.preventDefault(); void submit(); }}>
  {#if suggestCode}
    <div class="suggest" role="status">
      Sieht nach Code aus – als Code anheften?
      <button type="button" onclick={() => { codeMode = true; suggestCode = false; }}>Ja</button>
      <button type="button" onclick={() => (suggestCode = false)}>Nein</button>
    </div>
  {/if}
  <textarea
    bind:value={text}
    class:mono={codeMode}
    placeholder={codeMode ? "Quellcode einfügen …" : "Etwas an die Pinnwand heften …"}
    aria-label="Neuer Beitrag"
    spellcheck={!codeMode}
    {onpaste}
    onkeydown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void submit(); } }}
  ></textarea>
  <div class="bar">
    <button type="button" class="tool" aria-pressed={codeMode} aria-label="Als Code anheften" title="Code-Modus" onclick={() => (codeMode = !codeMode)}>
      <Code size={18} />
    </button>
    {#if codeMode}
      <select bind:value={language} aria-label="Sprache"><option value="">automatisch</option>{#each CODE_LANGUAGES as l (l)}<option value={l}>{l}</option>{/each}</select>
    {:else}
      <span class="hint">Markdown · Strg+Enter sendet</span>
    {/if}
    <button type="submit" class="pin" aria-label="Senden" title="Senden (Strg+Enter)" disabled={busy || !text.trim()}><SendHorizontal size={20} /></button>
  </div>
</form>

<style>
  .composer { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-top: 1px solid var(--color-blue-300); background: transparent; }
  textarea { width: 100%; min-height: 64px; max-height: 40vh; resize: vertical; padding: 8px 10px; font: inherit; font-size: 14px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); }
  textarea.mono { font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-size: 13px; }
  textarea:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 0; }
  .bar { display: flex; align-items: center; gap: 8px; }
  .tool { width: 40px; height: 40px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-white); color: var(--color-navy); display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .tool[aria-pressed="true"] { background: var(--color-navy); border-color: var(--color-navy); color: var(--color-white); }
  .hint { font-size: 12px; color: var(--color-blue-700); flex: 1; }
  select { flex: 1; min-height: 36px; font: inherit; font-size: 13px; }
  .pin { margin-left: auto; width: 44px; min-height: 40px; padding: 0; display: flex; align-items: center; justify-content: center; border: 0; border-radius: var(--radius-md); background: var(--color-navy); color: var(--color-white); font-weight: 700; cursor: pointer; }
  .pin:disabled { opacity: 0.5; cursor: default; }
  .suggest { display: flex; align-items: center; gap: 8px; font-size: 13px; background: var(--color-blue-100); padding: 6px 8px; border-radius: var(--radius-md); }
  .suggest button { min-height: 28px; padding: 0 10px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-white); cursor: pointer; }
  button:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
</style>
