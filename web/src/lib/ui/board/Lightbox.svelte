<script lang="ts">
  // full-screen view of an image (AP11.3): zoom via mouse wheel, keys or two fingers, pan by dragging,
  // double-click toggles between fitted and 2.5x. Esc closes (native <dialog>).
  import Download from "@lucide/svelte/icons/download";
  import Scan from "@lucide/svelte/icons/scan";
  import X from "@lucide/svelte/icons/x";
  import ZoomIn from "@lucide/svelte/icons/zoom-in";
  import ZoomOut from "@lucide/svelte/icons/zoom-out";
  import { t } from "../../i18n/index.svelte.ts";

  let { src, downloadUrl, name, onclose }: { src: string; downloadUrl: string; name: string; onclose: () => void } = $props();

  const MIN = 1;
  const MAX = 8;
  let dialog: HTMLDialogElement;
  let stage: HTMLDivElement;
  let scale = $state(1);
  let tx = $state(0);
  let ty = $state(0);
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStart: { dist: number; scale: number } | null = null;

  $effect(() => {
    dialog.showModal();
    return () => dialog.close();
  });

  /** zoom to `next`, keeping the point (px, py) relative to the stage centre under the pointer */
  function zoomTo(next: number, px = 0, py = 0) {
    const s = Math.min(MAX, Math.max(MIN, next));
    tx = px - ((px - tx) * s) / scale;
    ty = py - ((py - ty) * s) / scale;
    scale = s;
    if (s === MIN) tx = ty = 0;
  }

  function fromCenter(e: { clientX: number; clientY: number }) {
    const r = stage.getBoundingClientRect();
    return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2] as const;
  }

  function onwheel(e: WheelEvent) {
    e.preventDefault();
    zoomTo(scale * Math.exp(-e.deltaY * 0.0015), ...fromCenter(e));
  }

  function ondblclick(e: MouseEvent) {
    zoomTo(scale > 1 ? 1 : 2.5, ...fromCenter(e));
  }

  function onpointerdown(e: PointerEvent) {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), scale };
    }
  }

  function onpointermove(e: PointerEvent) {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const mid = { clientX: (a!.x + b!.x) / 2, clientY: (a!.y + b!.y) / 2 };
      zoomTo((pinchStart.scale * Math.hypot(a!.x - b!.x, a!.y - b!.y)) / pinchStart.dist, ...fromCenter(mid));
    } else if (scale > 1) {
      tx += e.clientX - prev.x;
      ty += e.clientY - prev.y;
    }
  }

  function onpointerup(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "+" || e.key === "=") zoomTo(scale * 1.25);
    else if (e.key === "-") zoomTo(scale / 1.25);
    else if (e.key === "0") zoomTo(1);
  }
</script>

<dialog bind:this={dialog} class="lightbox" aria-label={t().board.image(name)} onclose={onclose} {onkeydown}>
  <div class="bar">
    <span class="name">{name}</span>
    <span class="zoom" aria-live="polite">{Math.round(scale * 100)} %</span>
    <button type="button" aria-label={t().board.zoomOut} title="{t().board.zoomOut} (−)" disabled={scale <= MIN} onclick={() => zoomTo(scale / 1.25)}><ZoomOut size={18} /></button>
    <button type="button" aria-label={t().board.zoomIn} title="{t().board.zoomIn} (+)" disabled={scale >= MAX} onclick={() => zoomTo(scale * 1.25)}><ZoomIn size={18} /></button>
    <button type="button" aria-label={t().board.fit} title="{t().board.fit} (0)" disabled={scale === 1} onclick={() => zoomTo(1)}><Scan size={18} /></button>
    <a class="btn" href={downloadUrl} download={name} aria-label={t().common.download} title={t().common.download}><Download size={18} /></a>
    <button type="button" aria-label={t().common.close} title="{t().common.close} (Esc)" onclick={onclose}><X size={20} /></button>
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="stage"
    class:grab={scale > 1}
    bind:this={stage}
    {onwheel}
    {ondblclick}
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={onpointerup}
  >
    <img {src} alt={name} draggable="false" style:transform="translate({tx}px, {ty}px) scale({scale})" />
  </div>
</dialog>

<style>
  .lightbox { width: 100vw; height: 100vh; max-width: none; max-height: none; margin: 0; padding: 0; border: 0; background: rgb(0 20 40 / 0.97); color: var(--color-white); display: flex; flex-direction: column; }
  .lightbox::backdrop { background: transparent; }
  .bar { position: relative; z-index: 1; display: flex; align-items: center; gap: 6px; padding: 10px 16px; background: var(--color-navy); }
  .name { flex: 1; font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .zoom { font-size: 13px; min-width: 52px; text-align: right; font-variant-numeric: tabular-nums; color: var(--color-blue-100); }
  button, .btn { width: 40px; height: 40px; border: 0; border-radius: var(--radius-md); background: rgb(255 255 255 / 0.12); color: var(--color-white); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
  button:hover, .btn:hover { background: rgb(255 255 255 / 0.22); }
  button:disabled { opacity: 0.4; cursor: default; }
  button:focus-visible, .btn:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
  .stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; touch-action: none; user-select: none; }
  .stage.grab { cursor: grab; }
  .stage.grab:active { cursor: grabbing; }
  img { max-width: calc(100% - 32px); max-height: calc(100% - 16px); object-fit: contain; transform-origin: center; }
</style>
