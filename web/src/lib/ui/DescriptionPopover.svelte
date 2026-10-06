<script lang="ts">
  // description of a room or corridor as maintained in Mumble: the binders open it as a popover (top layer, so
  // neither the scrolling floor plan nor the room's container clip it). Escape, a click beside it or on a link closes
  // it; links open in a new tab (renderDescription). A click beside it only closes it: it enters no room.
  import { renderDescription } from "../board/render.ts";
  import { t } from "../i18n/index.svelte.ts";
  import Binders from "./Binders.svelte";

  let { channelId, name, description, size = 26 }: { channelId: number; name: string; description: string; size?: number } = $props();

  const id = $derived(`description-${channelId}`);
  const html = $derived(renderDescription(description));
  const label = $derived(t().space.showDescription(name));
  let button = $state<HTMLButtonElement | null>(null);
  let popover = $state<HTMLElement | null>(null);
  let open = $state(false);

  /** next to the binders, inside the window: opens towards the middle of the window, below if it fits, else above */
  function place(): void {
    if (!button || !popover) return;
    const margin = 16;
    const gap = 6;
    const anchor = button.getBoundingClientRect();
    const { width, height } = popover.getBoundingClientRect();
    const clamp = (value: number, max: number) => Math.max(margin, Math.min(value, max - margin));
    const left = anchor.left + anchor.width / 2 > innerWidth / 2 ? anchor.right - width : anchor.left;
    const below = anchor.bottom + gap;
    const top = below + height <= innerHeight - margin ? below : anchor.top - gap - height;
    popover.style.left = `${clamp(left, innerWidth - width)}px`;
    popover.style.top = `${clamp(top, innerHeight - height)}px`;
  }

  // the toggle event comes a moment after the popover is shown: until then it stays invisible, not in the corner
  function onbeforetoggle(e: ToggleEvent): void {
    if (e.newState === "open" && popover) popover.style.visibility = "hidden";
  }

  function ontoggle(e: ToggleEvent): void {
    open = e.newState === "open";
    if (!open || !popover) return;
    place();
    popover.style.visibility = "";
    popover.focus();
  }

  // light dismiss lets the click through to what lies below: swallow the click a press beside the popover ends in.
  // Dropped after that press in any case, so a press that ends without a click (dragged away) swallows nothing later
  const swallow = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  $effect(() => {
    if (!open) return;
    const onpointerdown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (popover?.contains(target) || button?.contains(target)) return;
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.addEventListener("pointerup", () => setTimeout(() => window.removeEventListener("click", swallow, { capture: true })), { capture: true, once: true });
    };
    window.addEventListener("pointerdown", onpointerdown, { capture: true });
    return () => window.removeEventListener("pointerdown", onpointerdown, { capture: true });
  });

  function onclick(e: MouseEvent): void {
    if ((e.target as HTMLElement).closest("a")) popover?.hidePopover();
  }
</script>

<button
  bind:this={button}
  type="button"
  class="binders-toggle"
  aria-label={label}
  title={label}
  aria-expanded={open}
  aria-controls={id}
  popovertarget={id}
>
  <Binders {size} />
</button>
<!-- the click only closes it after a link was followed (Enter on a link is a click too) -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<div bind:this={popover} {id} class="description" popover="auto" role="dialog" aria-label={label} tabindex="-1" {onbeforetoggle} {ontoggle} {onclick}>
  <div class="body">{@html html}</div>
</div>

<style>
  .binders-toggle {
    border: 0; background: transparent; padding: 4px; margin: -4px; border-radius: var(--radius-md); cursor: pointer;
    min-width: 40px; min-height: 40px; display: flex; align-items: center; justify-content: center;
    transition: transform var(--dur) var(--ease-out);
  }
  .binders-toggle:hover, .binders-toggle[aria-expanded="true"] { transform: translateY(-2px) rotate(-3deg) scale(1.06); }
  .binders-toggle:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 0; }

  /* a third of the window wide, at most 80 % of its height; longer descriptions scroll inside */
  .description {
    position: fixed; inset: auto; margin: 0; box-sizing: border-box;
    width: max(320px, 33vw); max-width: calc(100vw - 32px); max-height: 80vh; overflow: auto;
    padding: 16px 20px; border: 0; border-radius: var(--radius-md); border-top: 4px solid var(--color-blue-500);
    background: var(--color-white); color: var(--color-navy); box-shadow: 0 10px 28px rgb(0 56 105 / 0.35);
    font-size: 14px; line-height: 1.5;
  }
  .description:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 0; }
  .body { overflow-wrap: anywhere; }
  .body :global(:first-child) { margin-top: 0; }
  .body :global(:last-child) { margin-bottom: 0; }
  .body :global(p) { margin: 0 0 0.6em; }
  .body :global(a) { color: var(--color-blue-500); }
  .body :global(img) { max-width: 100%; height: auto; }
  .body :global(table) { border-collapse: collapse; }
  .body :global(th), .body :global(td) { padding: 2px 8px; border: 1px solid var(--color-blue-100); text-align: left; }
  .body :global(h1), .body :global(h2), .body :global(h3) { font-size: 16px; margin: 0.8em 0 0.4em; }
</style>
