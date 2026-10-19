<script lang="ts">
  import { renderCode } from "../../board/render.ts";

  let { code, language, numbers = true }: { code: string; language?: string; numbers?: boolean } = $props();
  const rendered = $derived(renderCode(code, language));
  const lines = $derived(code.split(/\r?\n/).length);

  // lines wider than the block: a soft edge on the right shows that it goes on, until scrolled to the end
  let more = $state(false);
  function edge(el: HTMLElement) {
    void rendered; // measured again when the code changes
    const update = () => (more = el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    const observer = new ResizeObserver(update);
    observer.observe(el);
    el.addEventListener("scroll", update);
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", update);
    };
  }
</script>

<!-- line numbers as a separate column: highlight.js spans can span lines -->
<div class="code" class:more {@attach edge}>
  {#if numbers}<pre class="gutter" aria-hidden="true">{Array.from({ length: lines }, (_, i) => i + 1).join("\n")}</pre>{/if}
  <!-- sanitised by DOMPurify (render.ts) -->
  <pre class="hljs"><code>{@html rendered.html}</code></pre>
</div>
{#if rendered.language}<span class="lang">{rendered.language}</span>{/if}

<style>
  .code { display: flex; overflow-x: auto; background: var(--color-surface); border-radius: var(--radius-md); font-size: 12.5px; line-height: 1.5; }
  .code.more { -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent); mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent); }
  pre { margin: 0; padding: 8px 10px; font-family: var(--font-mono); }
  .gutter { color: var(--color-blue-300); text-align: right; user-select: none; border-right: 1px solid var(--color-blue-100); }
  .hljs { flex: 1; white-space: pre; }
  /* links in code (A4): keep the highlighting colour, underlined */
  .hljs :global(a.code-link) { color: inherit; text-decoration: underline; text-decoration-color: var(--color-blue-300); text-underline-offset: 2px; }
  .hljs :global(a.code-link:hover) { text-decoration-color: currentColor; }
  .lang { display: inline-block; margin-top: 4px; font-size: 11px; color: var(--color-link); }
</style>
