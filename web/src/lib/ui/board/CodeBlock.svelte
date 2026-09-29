<script lang="ts">
  import { renderCode } from "../../board/render.ts";

  let { code, language, numbers = true }: { code: string; language?: string; numbers?: boolean } = $props();
  const rendered = $derived(renderCode(code, language));
  const lines = $derived(code.split(/\r?\n/).length);
</script>

<!-- line numbers as a separate column: highlight.js spans can span lines -->
<div class="code">
  {#if numbers}<pre class="gutter" aria-hidden="true">{Array.from({ length: lines }, (_, i) => i + 1).join("\n")}</pre>{/if}
  <!-- sanitised by DOMPurify (render.ts) -->
  <pre class="hljs"><code>{@html rendered.html}</code></pre>
</div>
{#if rendered.language}<span class="lang">{rendered.language}</span>{/if}

<style>
  .code { display: flex; overflow-x: auto; background: var(--color-surface); border-radius: var(--radius-md); font-size: 12.5px; line-height: 1.5; }
  pre { margin: 0; padding: 8px 10px; font-family: var(--font-mono); }
  .gutter { color: var(--color-blue-300); text-align: right; user-select: none; border-right: 1px solid var(--color-blue-100); }
  .hljs { flex: 1; white-space: pre; }
  .lang { display: inline-block; margin-top: 4px; font-size: 11px; color: var(--color-blue-500); }
</style>
