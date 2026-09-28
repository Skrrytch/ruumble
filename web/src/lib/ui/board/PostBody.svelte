<script lang="ts">
  import type { Post } from "@ruumble/protocol";
  import { renderMarkdown } from "../../board/render.ts";
  import CodeBlock from "./CodeBlock.svelte";

  let { post }: { post: Post } = $props();
  const html = $derived(post.kind === "text" ? renderMarkdown(post.text) : "");
</script>

{#if post.kind === "code"}
  <CodeBlock code={post.text} language={post.language} />
{:else if post.kind === "text"}
  <!-- von markdown-it (ohne HTML) erzeugt und mit DOMPurify bereinigt (render.ts) -->
  <div class="md">{@html html}</div>
{/if}

<style>
  .md { font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
  .md :global(p) { margin: 0 0 6px; }
  .md :global(h1), .md :global(h2), .md :global(h3) { font-size: 15px; margin: 4px 0 6px; }
  .md :global(ul), .md :global(ol) { margin: 0 0 6px; padding-left: 20px; }
  .md :global(a) { color: var(--color-blue-500); }
  .md :global(code) { background: var(--color-surface); padding: 0 3px; border-radius: 3px; font-size: 13px; }
  .md :global(pre) { background: var(--color-surface); padding: 8px; border-radius: var(--radius-md); overflow-x: auto; font-size: 12.5px; }
  .md :global(table) { border-collapse: collapse; font-size: 13px; }
  .md :global(th), .md :global(td) { border: 1px solid var(--color-blue-300); padding: 2px 6px; }
  .md :global(blockquote) { margin: 0 0 6px; padding-left: 8px; border-left: 3px solid var(--color-blue-300); color: var(--color-blue-700); }
</style>
