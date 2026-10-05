<script lang="ts" module>
  export type { ConfirmRequest } from "./ConfirmDialog.svelte";
  export interface ShellCrumb {
    label: string;
    /** set: a parent level the viewer may jump to */
    onselect?: () => void;
  }
</script>

<script lang="ts">
  import { showModal } from "../modal.ts";
  import type { Snippet } from "svelte";
  import { t } from "../../i18n/index.svelte.ts";
  import ConfirmDialog, { type ConfirmRequest } from "./ConfirmDialog.svelte";
  import Icon from "./Icon.svelte";

  // The frame of the care dialogs, the building maintenance, "my keys" and the status (design handoff "Hausmeister"): header
  // with site plan, title, plate, breadcrumb and summary, the yellow mark and the dot raster; the body; a grey footer
  // with the house rules or a status line after an action. A confirmation opens in its own popup above (ConfirmDialog).
  let {
    title,
    level,
    glyph,
    plate,
    crumbs = [],
    summary = "",
    backLabel = "",
    onback,
    onclose,
    houseRule = "",
    status = null,
    confirm = null,
    oncancelconfirm,
    narrow = false,
    children,
  }: {
    title: string;
    /** changes when the dialog moves to another level: the title takes the focus */
    level: string;
    glyph: Snippet;
    plate?: Snippet;
    crumbs?: ShellCrumb[];
    summary?: string;
    backLabel?: string;
    onback?: () => void;
    onclose: () => void;
    houseRule?: string;
    status?: { text: string; error: boolean } | null;
    confirm?: ConfirmRequest | null;
    oncancelconfirm?: () => void;
    /** a small dialog (the status) */
    narrow?: boolean;
    children: Snippet;
  } = $props();

  let dialog: HTMLDialogElement;
  let heading = $state<HTMLHeadingElement | null>(null);
  const titleId = `care-title-${Math.random().toString(36).slice(2)}`;

  $effect(() => {
    return showModal(dialog, () => onclose());
  });
  // moving to another level: focus on the title, so screen readers announce it
  let shownLevel = "";
  $effect(() => {
    if (level !== shownLevel && shownLevel) heading?.focus();
    shownLevel = level;
  });

  /** Escape while the confirmation is open belongs to it, never closes the dialog below */
  function oncancel(e: Event): void {
    if (confirm) e.preventDefault();
  }
</script>

<dialog bind:this={dialog} class="care" class:narrow aria-labelledby={titleId} {oncancel}>
  <header>
    <div class="raster" aria-hidden="true"></div>
    {#if onback}
      <button type="button" class="head-icon" aria-label={backLabel} title={backLabel} onclick={onback}><Icon name="back" size={18} /></button>
    {/if}
    {@render glyph()}
    <div class="heading">
      <div class="title-row">
        <h2 id={titleId} bind:this={heading} tabindex="-1">{title}</h2>
        {#if plate}{@render plate()}{/if}
      </div>
      {#if crumbs.length || summary}
        <div class="sub">
          {#if crumbs.length}
            <nav aria-label={t().care.crumbs} class="crumbs">
              <Icon name="plant" size={13} color="var(--accent)" />
              {#each crumbs as crumb, i (i)}
                {#if i > 0}<span aria-hidden="true">›</span>{/if}
                {#if crumb.onselect}
                  <button type="button" class="link" onclick={crumb.onselect}>{crumb.label}</button>
                {:else}
                  <span class:current={i === crumbs.length - 1} aria-current={i === crumbs.length - 1 ? "page" : undefined}>{crumb.label}</span>
                {/if}
              {/each}
            </nav>
          {/if}
          {#if summary}<span class="summary">{crumbs.length ? "· " : ""}{summary}</span>{/if}
        </div>
      {/if}
    </div>
    <button type="button" class="head-icon" aria-label={t().common.close} title={t().common.close} onclick={onclose}><Icon name="close" size={18} /></button>
    <div class="mark" aria-hidden="true"></div>
  </header>

  <main class:confirming={!!confirm}>
    {@render children()}
  </main>

  <footer class="bar">
    {#if status}
      <span class="status" class:error={status.error} role={status.error ? "alert" : "status"}>
        <Icon name={status.error ? "warning" : "check"} size={15} color={status.error ? "var(--danger)" : "var(--accent)"} />{status.text}
      </span>
    {:else if houseRule}
      <span class="rule"><Icon name="rules" size={15} color="var(--accent)" /><span><strong>{t().care.houseRule}</strong> · {houseRule}</span></span>
    {:else}
      <span></span>
    {/if}
    <button type="button" class="btn primary close" onclick={onclose}>{t().common.close}</button>
  </footer>

  {#if confirm}
    <ConfirmDialog request={confirm} oncancel={() => oncancelconfirm?.()} />
  {/if}
</dialog>

<style>
  .care {
    --ink: #003869; --ink-2: #00508c; --muted: #4d6b88; --disabled: #7d8fa3; --accent: #5aa6e7; --accent-soft: #9ccaf1;
    --tint: #eef5fc; --raster: #cee4f8; --link: #0078be; --line: #d5dfe9; --line-soft: #eef2f6; --control: #b9ccdd;
    --surface: #f5f5f5; --mark: var(--color-accent); --danger: var(--color-alert); --danger-tint: #fdf3f2; --danger-ink: #7a160f;
    width: min(800px, calc(100vw - 32px)); max-height: 90vh; padding: 0; border: 1px solid var(--line); border-radius: 8px;
    color: var(--ink); background: #fff; font-size: 14px; line-height: 1.5; display: flex; flex-direction: column; overflow: hidden;
  }
  .care.narrow { width: min(560px, calc(100vw - 32px)); }
  .care::backdrop { background: rgb(0 56 105 / 0.45); }
  header { position: relative; display: flex; gap: 12px; align-items: center; padding: 14px 12px; border-bottom: 1px solid var(--line); flex: none; }
  .raster {
    position: absolute; inset: 0 0 0 auto; width: 320px; pointer-events: none;
    background-image: radial-gradient(circle, var(--raster) 2px, transparent 2.4px); background-size: 8px 8px;
    mask-image: linear-gradient(to left, #000 10%, transparent);
  }
  .mark { position: absolute; left: 0; bottom: -1px; width: 96px; height: 4px; background: var(--mark); }
  .heading { position: relative; flex: 1; min-width: 0; }
  .title-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
  h2 { margin: 0; font-size: 18px; font-weight: 700; line-height: 1.2; flex: none; outline: none; }
  .sub { margin-top: 2px; display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); min-width: 0; flex-wrap: wrap; }
  .crumbs { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .crumbs .current { color: var(--ink); }
  .link { border: 0; padding: 0; background: none; font: inherit; color: var(--link); cursor: pointer; }
  .link:hover { color: var(--ink-2); text-decoration: underline; }
  .head-icon { position: relative; flex: none; width: 40px; height: 40px; display: grid; place-items: center; border: 0; border-radius: 4px; background: transparent; color: var(--ink); cursor: pointer; }
  .head-icon:hover { background: var(--tint); }
  main { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 24px; display: flex; flex-direction: column; gap: 18px; }
  main.confirming :global(.faded) { opacity: 0.45; }
  .bar { flex: none; display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 12px 24px; border-top: 1px solid var(--line); background: var(--surface); }
  .rule, .status { display: flex; gap: 8px; align-items: center; font-size: 12px; color: var(--ink-2); min-width: 0; }
  .status { font-size: 13px; font-weight: 700; color: var(--ink); }
  .status.error { color: var(--danger); }
  /* buttons of the care dialogs, also used by the views (global within .care) */
  .care :global(.btn) {
    height: 40px; display: inline-flex; align-items: center; gap: 8px; padding: 0 14px; border: 1px solid var(--control); border-radius: 4px;
    background: #fff; color: var(--ink); font: inherit; font-weight: 700; cursor: pointer; white-space: nowrap; flex: none;
    transition: background 150ms ease-out, opacity 150ms ease-out;
  }
  .care :global(.btn.primary) { border-color: var(--ink); background: var(--ink); color: #fff; }
  .care :global(.btn.secondary:hover) { background: var(--tint); }
  .care :global(.btn.danger) { border-color: var(--danger); color: var(--danger); }
  .care :global(.btn.danger:hover) { background: var(--danger-tint); }
  .care :global(.btn.danger-solid) { border-color: var(--danger); background: var(--danger); color: #fff; }
  .care :global(.btn:disabled) { opacity: 0.45; cursor: default; }
  .care :global(.btn.close) { padding: 0 22px; }
  .care :global(button:focus-visible), .care :global(select:focus-visible), .care :global(input:focus-visible), .care :global(label:focus-within) {
    outline: 2px solid var(--link); outline-offset: 2px;
  }
  .care :global(h3) { margin: 0 0 8px; font-size: 15px; font-weight: 700; }
  .care :global(.small) { margin: 6px 0 0; font-size: 12px; color: var(--muted); }
  @media (prefers-reduced-motion: reduce) { .care :global(*) { transition: none !important; } }
</style>
