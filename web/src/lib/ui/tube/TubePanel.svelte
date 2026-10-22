<script lang="ts">
  import FileIcon from "@lucide/svelte/icons/file";
  import FileOutput from "@lucide/svelte/icons/file-output";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import X from "@lucide/svelte/icons/x";
  import type { Parcel, ParcelRecipient } from "@ruumble/protocol";
  import { formatSize } from "../../board/model.ts";
  import { t } from "../../i18n/index.svelte.ts";
  import type { RuumbleState } from "../../state.svelte.ts";
  import { isExecutable, mine, typeLabel, waiting } from "../../tube/model.ts";

  // Tube mail (ADR-0022): the panel below its button in the top bar. "Incoming" with accept and decline, "Outgoing"
  // with every recipient's state and progress, "Withdraw". Escape and a click elsewhere close it.
  let { app }: { app: RuumbleState } = $props();
  const tube = $derived(app.tube);
  let panel = $state<HTMLElement | null>(null);

  const percent = (p: Parcel, r: ParcelRecipient) => Math.min(100, Math.round((r.sent / p.size) * 100));
  const meta = (p: Parcel) => [typeLabel(p.name, p.type), formatSize(p.size)].filter(Boolean).join(" · ");
  const settled = (p: Parcel) => p.ended !== null || ["received", "declined"].includes(mine(p, tube.me)?.state ?? "");

  function ownState(p: Parcel): string {
    if (p.ended && p.ended !== "done") return t().tube.ended[p.ended];
    const r = mine(p, tube.me);
    if (!r) return "";
    if (r.state === "receiving") return t().tube.own.receiving(percent(p, r));
    if (r.state === "offered" && !p.holder) return t().tube.senderAway;
    return t().tube.own[r.state];
  }

  function theirState(p: Parcel, r: ParcelRecipient): string {
    return r.state === "receiving" ? t().tube.state.receiving(percent(p, r)) : t().tube.state[r.state];
  }

  $effect(() => {
    const away = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (panel && target && !panel.contains(target) && !target.closest("[data-tube-button]") && !target.closest("dialog")) tube.closePanel();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) {
        tube.closePanel();
        document.querySelector<HTMLElement>("[data-tube-button]")?.focus();
      }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  });
</script>

<section bind:this={panel} class="tube-panel" aria-labelledby="tube-title">
  <header>
    <h2 id="tube-title"><FileOutput size={18} aria-hidden="true" />{t().tube.title}</h2>
    <button type="button" class="compose" onclick={() => tube.compose()}>{t().tube.compose}</button>
    <button type="button" class="icon" aria-label={t().screens.dismissNotice} title={t().screens.dismissNotice} onclick={() => tube.closePanel()}><X size={16} /></button>
  </header>

  {#if !tube.incoming.length && !tube.outgoing.length}
    <p class="empty"><strong>{t().tube.empty}</strong>{t().tube.emptyHint}</p>
  {/if}

  {#if tube.incoming.length}
    <h3>{t().tube.incoming}</h3>
    <ul>
      {#each tube.incoming as p (p.id)}
        {@const open = waiting(p, tube.me)}
        <li class="parcel" class:faded={settled(p)}>
          <div class="head">
            <FileIcon size={20} aria-hidden="true" />
            <span class="name">{p.name}</span>
            {#if settled(p)}<button type="button" class="icon" aria-label={t().tube.dismiss} title={t().tube.dismiss} onclick={() => tube.dismiss(p.id)}><X size={14} /></button>{/if}
          </div>
          <span class="meta">{meta(p)} · {t().tube.from(p.fromName)}</span>
          {#if p.note}<q class="note">{p.note}</q>{/if}
          {#if open && isExecutable(p.name)}<span class="warn"><TriangleAlert size={14} aria-hidden="true" />{t().tube.executable}</span>{/if}
          <div class="foot">
            <span class="state" role="status">{ownState(p)}</span>
            {#if open}
              <button type="button" class="btn" onclick={() => void tube.decline(p.id)}>{t().tube.decline}</button>
              <button type="button" class="btn primary" disabled={!p.holder} onclick={() => void tube.accept(p.id)}>{t().tube.accept}</button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  {#if tube.outgoing.length}
    <h3>{t().tube.outgoing}</h3>
    <ul>
      {#each tube.outgoing as p (p.id)}
        <li class="parcel" class:faded={p.ended !== null}>
          <div class="head">
            <FileIcon size={20} aria-hidden="true" />
            <span class="name">{p.name}</span>
            {#if p.ended}<button type="button" class="icon" aria-label={t().tube.dismiss} title={t().tube.dismiss} onclick={() => tube.dismiss(p.id)}><X size={14} /></button>{/if}
          </div>
          <span class="meta">{meta(p)}{#if p.ended && p.ended !== "done"}{" · "}{t().tube.ended[p.ended]}{/if}</span>
          {#if p.note}<q class="note">{p.note}</q>{/if}
          <ul class="recipients">
            {#each p.recipients as r (r.person)}
              <li class={r.state}>
                <span class="rname">{r.name}</span>
                <span class="rstate">{theirState(p, r)}</span>
                {#if r.state === "receiving"}<span class="bar" aria-hidden="true"><span style:width={`${percent(p, r)}%`}></span></span>{/if}
              </li>
            {/each}
          </ul>
          {#if !p.ended}
            <div class="foot">
              <span class="state">{t().tube.keepOpen}</span>
              <button type="button" class="btn" onclick={() => void tube.withdraw(p.id)}>{t().tube.withdraw}</button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .tube-panel {
    --color-paper: var(--color-raised);
    position: fixed; top: 88px; right: 32px; z-index: 25; width: 380px; max-height: calc(100vh - 120px); overflow-y: auto; box-sizing: border-box;
    display: flex; flex-direction: column; gap: 8px; padding: 12px 14px 14px; border-radius: 8px; background: var(--color-paper); color: var(--color-ink);
    box-shadow: 0 0 0 1px var(--color-raised-edge), 0 10px 28px rgb(0 56 105 / 0.25); animation: drop 160ms var(--ease-out) both; transform-origin: top right;
  }
  @keyframes drop { from { opacity: 0; transform: translateY(-6px) scale(0.98); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .tube-panel { animation: none; } }
  header { display: flex; align-items: center; gap: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--color-blue-100); }
  h2 { display: flex; align-items: center; gap: 8px; margin: 0 auto 0 0; font-size: 16px; }
  h3 { margin: 6px 0 0; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-blue-700); }
  ul { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
  .empty { display: flex; flex-direction: column; gap: 4px; margin: 4px 0; font-size: 13px; color: var(--color-blue-700); }
  .empty strong { font-size: 14px; color: var(--color-ink); }
  .parcel { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border: 1px solid var(--color-blue-100); border-radius: var(--radius-md); }
  .parcel.faded { opacity: 0.75; }
  .head { display: flex; align-items: center; gap: 8px; }
  .name { flex: 1; min-width: 0; font-weight: 700; overflow-wrap: anywhere; }
  .meta { font-size: 12px; color: var(--color-blue-700); }
  .note { font-size: 13px; font-style: italic; overflow-wrap: anywhere; }
  .warn { display: flex; align-items: flex-start; gap: 6px; padding: 6px 8px; border-radius: 4px; border: 1px solid var(--color-alert); color: var(--color-ink); font-size: 12px; }
  .warn :global(svg) { flex: none; color: var(--color-alert); }
  .foot { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
  .state { flex: 1; min-width: 0; font-size: 12px; color: var(--color-blue-700); }
  .recipients { gap: 2px; margin-top: 4px; }
  .recipients li { display: grid; grid-template-columns: 1fr auto; align-items: center; column-gap: 8px; font-size: 13px; }
  .rname { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rstate { font-size: 12px; color: var(--color-blue-700); font-variant-numeric: tabular-nums; }
  .received .rstate { color: var(--color-ink); font-weight: 700; }
  .declined .rstate, .failed .rstate { opacity: 0.8; }
  .bar { grid-column: 1 / -1; height: 4px; margin: 2px 0 4px; border-radius: 2px; background: var(--color-blue-100); overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--color-blue-500); transition: width 400ms var(--ease-out); }
  .btn, .compose {
    min-height: 32px; padding: 0 12px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-paper);
    color: var(--color-ink); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap;
  }
  .btn:hover, .compose:hover { background: var(--color-blue-100); }
  .btn.primary { border-color: var(--color-ink); background: var(--color-ink); color: var(--color-paper); }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .icon { width: 30px; height: 30px; flex: none; display: grid; place-items: center; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--color-blue-700); cursor: pointer; }
  .icon:hover { background: var(--color-blue-100); }
  .btn:focus-visible, .compose:focus-visible, .icon:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 1px; }
</style>
