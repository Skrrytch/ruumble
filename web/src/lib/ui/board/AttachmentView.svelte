<script lang="ts">
  // attachment of a post (AP11.3): image as preview (click → full screen), file with icon, size and download
  import Download from "@lucide/svelte/icons/download";
  import File from "@lucide/svelte/icons/file";
  import FileArchive from "@lucide/svelte/icons/file-archive";
  import FileImage from "@lucide/svelte/icons/file-image";
  import FileMusic from "@lucide/svelte/icons/file-music";
  import FilePlay from "@lucide/svelte/icons/file-play";
  import FileText from "@lucide/svelte/icons/file-text";
  import type { Post } from "@ruumble/protocol";
  import { getFileUrl } from "../../board/context.ts";
  import { fileKind, formatSize } from "../../board/model.ts";
  import Lightbox from "./Lightbox.svelte";
  import { t } from "../../i18n/index.svelte.ts";

  let { post, large = false }: { post: Post; large?: boolean } = $props();

  const fileUrl = getFileUrl();
  const a = $derived(post.attachment!);
  const name = $derived(a.name || t().board.fallbackName);
  let zoomed = $state(false);
  const ICONS = { image: FileImage, pdf: FileText, text: FileText, archive: FileArchive, audio: FileMusic, video: FilePlay, other: File };
  const Icon = $derived(ICONS[fileKind(a.mime, name)]);
</script>

{#if post.kind === "image"}
  <button type="button" class="thumb" class:large aria-label={t().board.showImage(name)} onclick={() => (zoomed = true)}>
    <img src={fileUrl(a)} alt={post.text || name} loading="lazy" width={a.width} height={a.height} />
  </button>
  {#if zoomed}<Lightbox src={fileUrl(a)} downloadUrl={fileUrl(a, true)} {name} onclose={() => (zoomed = false)} />{/if}
{:else}
  <a class="file" href={fileUrl(a, true)} download={name} title={t().board.downloadFile(name)}>
    <span class="icon" aria-hidden="true"><Icon size={26} /></span>
    <span class="meta"><span class="fname">{name}</span><span class="size">{formatSize(a.size)}</span></span>
    <span class="dl" aria-hidden="true"><Download size={18} /></span>
  </a>
{/if}

<style>
  .thumb { display: block; width: 100%; padding: 0; border: 1px solid var(--color-blue-100); border-radius: var(--radius-md); background: var(--color-surface); cursor: zoom-in; overflow: hidden; }
  .thumb img { display: block; width: 100%; height: auto; max-height: 200px; object-fit: contain; }
  .thumb.large img { max-height: 60vh; }
  .thumb:focus-visible, .file:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
  .file { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--color-blue-100); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-navy); text-decoration: none; }
  .file:hover { border-color: var(--color-blue-300); }
  .icon { display: inline-flex; color: var(--color-blue-500); }
  .meta { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.3; }
  .fname { font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .size { font-size: 12px; color: var(--color-blue-700); }
  .dl { display: inline-flex; color: var(--color-blue-500); }
</style>
