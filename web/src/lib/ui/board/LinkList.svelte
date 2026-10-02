<script lang="ts">
  // the links of a code post as a compact list (A4), in their short form (A5); duplicates removed
  import CircleDot from "@lucide/svelte/icons/circle-dot";
  import CirclePlay from "@lucide/svelte/icons/circle-play";
  import FileText from "@lucide/svelte/icons/file-text";
  import GitCommitHorizontal from "@lucide/svelte/icons/git-commit-horizontal";
  import GitPullRequest from "@lucide/svelte/icons/git-pull-request";
  import Link from "@lucide/svelte/icons/link";
  import MessageCircleQuestionMark from "@lucide/svelte/icons/message-circle-question-mark";
  import Ticket from "@lucide/svelte/icons/ticket";
  import { describeLink, type LinkKind } from "../../board/links.ts";
  import { uniqueLinks } from "../../board/render.ts";
  import { t } from "../../i18n/index.svelte.ts";

  /** `limit`: at most this many, then "+ N more", which opens the post (`onmore`) */
  let { text, limit = Infinity, onmore }: { text: string; limit?: number; onmore?: () => void } = $props();

  const ICONS: Record<LinkKind, typeof Link> = {
    pr: GitPullRequest, issue: CircleDot, commit: GitCommitHorizontal, ci: CirclePlay, ticket: Ticket, page: FileText, question: MessageCircleQuestionMark, other: Link,
  };
  const links = $derived(uniqueLinks(text).map((href) => ({ href, ...describeLink(href)! })));
  const shown = $derived(links.slice(0, limit));
  const rest = $derived(links.length - shown.length);
</script>

{#if links.length}
  <ul class="links" aria-label={t().board.linksInPost}>
    {#each shown as link (link.href)}
      {@const Icon = ICONS[link.kind]}
      <li><a href={link.href} target="_blank" rel="noopener noreferrer nofollow" title={link.href}><Icon size={13} aria-hidden="true" /><span>{link.label}</span></a></li>
    {/each}
    {#if rest > 0}
      <li>{#if onmore}<button type="button" onclick={onmore}>{t().board.moreLinks(rest)}</button>{:else}<span class="rest">{t().board.moreLinks(rest)}</span>{/if}</li>
    {/if}
  </ul>
{/if}

<style>
  .links { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px; }
  li { display: inline-flex; min-width: 0; max-width: 100%; }
  a, button, .rest {
    display: inline-flex; align-items: center; gap: 4px; min-width: 0; min-height: 22px; padding: 0 8px; border-radius: 999px;
    font-size: 12px; line-height: 1; white-space: nowrap;
  }
  a { border: 1px solid var(--color-blue-100); background: var(--color-surface); color: var(--color-blue-500); text-decoration: none; }
  a span { overflow: hidden; text-overflow: ellipsis; }
  a:hover { border-color: var(--color-blue-300); color: var(--color-navy); }
  button { border: 0; background: none; color: var(--color-blue-700); cursor: pointer; }
  button:hover { color: var(--color-navy); text-decoration: underline; }
  .rest { color: var(--color-blue-700); }
  a:focus-visible, button:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
</style>
