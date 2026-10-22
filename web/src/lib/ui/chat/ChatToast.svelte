<script lang="ts">
  import MessagesSquare from "@lucide/svelte/icons/messages-square";
  import X from "@lucide/svelte/icons/x";
  import { t } from "../../i18n/index.svelte.ts";
  import { initials } from "../../model/building.ts";
  import type { RuumbleState } from "../../state.svelte.ts";

  // A new direct message while its conversation is not in view (ADR-0021): who it is from and the start of it, below the top
  // bar on the right; "Reply" opens the conversation. It goes by itself after a few seconds.
  let { app }: { app: RuumbleState } = $props();
  const toast = $derived(app.chat.toast);
</script>

{#if toast}
  <div class="chat-toast" role="status">
    <span class="mini" aria-hidden="true">{initials(toast.name)}</span>
    <div class="body">
      <span class="from"><MessagesSquare size={13} aria-hidden="true" />{t().chat.from(toast.name)}</span>
      <span class="text">{toast.text}</span>
      <button type="button" class="reply" onclick={() => app.chat.open(toast.person, toast.name)}>{t().chat.reply}</button>
    </div>
    <button type="button" class="close" aria-label={t().screens.dismissNotice} title={t().screens.dismissNotice} onclick={() => app.chat.dismissToast()}><X size={16} /></button>
  </div>
{/if}

<style>
  .chat-toast {
    --color-paper: var(--color-raised);
    position: fixed; top: 88px; right: 32px; z-index: 30; width: 320px; box-sizing: border-box; display: flex; align-items: flex-start; gap: 12px;
    padding: 12px 8px 12px 14px; border-radius: 8px; background: var(--color-paper); color: var(--color-ink);
    box-shadow: 0 0 0 1px var(--color-raised-edge), 0 10px 28px rgb(0 56 105 / 0.25); animation: slide 220ms var(--ease-out) both;
  }
  @keyframes slide { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .chat-toast { animation: none; } }
  .mini {
    width: 36px; height: 36px; flex: none; border-radius: 50%; background: var(--color-blue-500); color: var(--color-white);
    display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700;
  }
  .body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .from { display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 700; color: var(--color-blue-700); }
  .text { font-size: 14px; line-height: 1.4; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .reply {
    align-self: flex-start; margin-top: 5px; min-height: 30px; padding: 0 12px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md);
    background: var(--color-paper); color: var(--color-ink); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
  }
  .reply:hover { background: var(--color-blue-100); }
  .close { width: 32px; height: 32px; flex: none; display: grid; place-items: center; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--color-blue-700); cursor: pointer; }
  .close:hover { background: var(--color-blue-100); }
  .reply:focus-visible, .close:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 1px; }
</style>
