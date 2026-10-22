<script lang="ts">
  import DoorOpen from "@lucide/svelte/icons/door-open";
  import Eraser from "@lucide/svelte/icons/eraser";
  import Tag from "@lucide/svelte/icons/tag";
  import MessagesSquare from "@lucide/svelte/icons/messages-square";
  import SendHorizontal from "@lucide/svelte/icons/send-horizontal";
  import SmilePlus from "@lucide/svelte/icons/smile-plus";
  import X from "@lucide/svelte/icons/x";
  import { CHAT_LIMITS } from "@ruumble/protocol";
  import { t } from "../../i18n/index.svelte.ts";
  import { initials } from "../../model/building.ts";
  import { buildDirectory } from "../../model/overview.ts";
  import { SHORTCUT_KEYS } from "../../shortcuts.ts";
  import type { RuumbleState } from "../../state.svelte.ts";
  import { untilTime } from "../../status.ts";
  import { reactionsOf, tintOf, type ChatItem } from "../../chat/model.ts";
  import Avatar from "../Avatar.svelte";
  import ReactionPicker from "../board/ReactionPicker.svelte";
  import { REACTION_ICONS } from "../board/reactionIcons.ts";

  // Direct chat (ADR-0021): a window docked at the bottom right, over the floor plan and the board, with one tab per
  // person. The head of a conversation says where the other one is right now (from the snapshot), with the way to go
  // there; below the messages, the reactions of the board (A1) and the invitation to the own room ("come over").
  // Closed, the button in the top bar counts what is unread, and P brings the window back.
  let { app }: { app: RuumbleState } = $props();

  const chat = $derived(app.chat);
  const conversation = $derived(chat.conversation);
  /** everyone in the building with their place, as on the directory board */
  const people = $derived(
    app.snapshot && app.building ? buildDirectory(app.snapshot, app.building, app.avatarOptions).flatMap((g) => g.people.map((entry) => ({ entry, group: g }))) : [],
  );
  const partner = $derived(conversation ? (people.find((p) => p.entry.user.person === conversation.person) ?? null) : null);
  const place = $derived.by(() => {
    if (!partner) return t().chat.notInHouse;
    const { entry, group } = partner;
    return group.kind === "floor" && group.badge ? `${entry.place} · ${t().floors.floor(group.badge)}` : entry.place;
  });
  const myName = $derived(app.me?.name ?? "");
  const draft = $derived(conversation ? (chat.drafts[conversation.person] ?? "") : "");
  const nearLimit = $derived(draft.length > CHAT_LIMITS.textChars - 200);
  const tint = $derived(conversation ? tintOf(conversation.person) : 1);

  let picker = $state<string | null>(null);
  let panel = $state<HTMLElement | null>(null);
  let list = $state<HTMLElement | null>(null);
  let input = $state<HTMLTextAreaElement | null>(null);
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 30_000); // "Mon 09:00" once a message is from yesterday
    return () => clearInterval(timer);
  });

  // the newest message in view: when one arrives and when another tab is chosen
  const count = $derived(conversation?.items.length ?? 0);
  const person = $derived(conversation?.person ?? null);
  $effect(() => {
    void count;
    void person;
    if (list) list.scrollTop = list.scrollHeight;
  });
  $effect(() => {
    void person;
    picker = null;
  });
  // the text field to write, or the chosen tab to go on with the keyboard (ChatState.focus)
  $effect(() => {
    const { target } = chat.focus;
    if (!panel) return;
    if (target === "composer" && input) input.focus();
    else panel.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
  });

  /** the tabs as a tab list: arrow keys move between them */
  function ontabkey(e: KeyboardEvent): void {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    chat.cycle(e.key === "ArrowRight" ? 1 : -1);
  }

  /** an invitation: go there, already there, not allowed in by Mumble, or the room is gone */
  function inviteState(item: ChatItem): "go" | "there" | "locked" | "gone" {
    const id = item.channelId;
    if (id === null || !app.snapshot?.channels.some((c) => c.id === id)) return "gone";
    if (app.me?.channel === id) return "there";
    return app.snapshot.canEnter[String(id)] === false ? "locked" : "go";
  }

  function grow(): void {
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
  }

  async function send(): Promise<void> {
    if (await chat.sendText()) queueMicrotask(grow);
  }

  function onkeydown(e: KeyboardEvent): void {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  /** Escape anywhere in the window closes it, the focus goes back to its button (the reaction picker closes first) */
  function onpanelkey(e: KeyboardEvent): void {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    if (picker) {
      picker = null;
      return;
    }
    chat.closePanel();
    document.querySelector<HTMLElement>("[data-chat-button]")?.focus();
  }
</script>

{#if chat.panel === "open"}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <section class="chat tint-{tint}" aria-label={t().chat.title} bind:this={panel} onkeydown={onpanelkey}>
    <header class="bar">
      <MessagesSquare size={18} aria-hidden="true" />
      <h2>{t().chat.title}</h2>
      <button type="button" class="bar-btn" aria-label={t().common.close} title={`${t().common.close} (P, Esc)`} onclick={() => chat.closePanel()}><X size={18} /></button>
    </header>

    {#if chat.tabs.length}
      <div class="tabs" role="tablist" aria-label={t().chat.tabs}>
        {#each chat.tabs as c (c.person)}
          {@const active = c.person === chat.active}
          <div class="tab tint-{tintOf(c.person)}" class:active>
            <button
              type="button" role="tab" class="tab-btn" aria-selected={active} aria-controls="chat-conversation" tabindex={active ? 0 : -1}
              onclick={() => chat.select(c.person)} onkeydown={ontabkey}
            >
              <span class="mini" aria-hidden="true">{initials(c.name)}</span>
              <span class="tab-name">{c.name}</span>
              {#if c.unread && !active}<span class="badge" aria-label={t().chat.unread(c.unread)}>{c.unread}</span>{/if}
            </button>
            <button type="button" class="tab-close" aria-label={t().chat.closeTab(c.name)} title={t().chat.closeTab(c.name)} onclick={() => chat.close(c.person)}><X size={13} /></button>
          </div>
        {/each}
      </div>
    {/if}

    {#if conversation}
      <div class="conversation" id="chat-conversation" role="tabpanel" aria-label={conversation.name}>
        <div class="who">
          {#if partner}
            <Avatar user={partner.entry.user} talking={app.talking[partner.entry.user.session] ?? false} showName={false} />
          {:else}
            <span class="mini big away" aria-hidden="true">{initials(conversation.name)}</span>
          {/if}
          <div class="who-text">
            <span class="who-name">{conversation.name}</span>
            <span class="who-place"><DoorOpen size={13} aria-hidden="true" />{place}</span>
            {#if partner?.entry.user.status}
              <span class="who-status"><Tag size={11} aria-hidden="true" />{partner.entry.user.status.text}</span>
            {/if}
          </div>
          {#if partner?.entry.canGo}
            <button type="button" class="go" title={t().overview.goTo(conversation.name, partner.entry.place)} onclick={() => app.visit(partner!.entry.channelId)}>{t().chat.go}</button>
          {:else if partner?.entry.blocked === "here"}
            <span class="same">{t().chat.sameRoom}</span>
          {/if}
          <button type="button" class="icon-btn" aria-label={t().chat.forgetLabel(conversation.name)} title={t().chat.forget} onclick={() => chat.forget(conversation!.person)}><Eraser size={16} /></button>
        </div>

        <div class="messages" bind:this={list}>
          {#each conversation.items as item (item.id)}
            {@const reactions = reactionsOf(item, myName, conversation.name)}
            <div class="row" class:mine={item.mine}>
              {#if item.kind === "text"}
                <div class="bubble">{item.text}</div>
              {:else}
                {@const reach = inviteState(item)}
                <div class="bubble invite">
                  <span class="invite-head"><DoorOpen size={16} aria-hidden="true" />{t().chat.comeOver}</span>
                  <span class="invite-text">{item.mine ? t().chat.invited(conversation.name, item.channelName) : t().chat.invitesYou(conversation.name, item.channelName)}</span>
                  {#if !item.mine}
                    {#if reach === "go"}
                      <button type="button" class="go solid" aria-label={t().chat.goTo(item.channelName)} onclick={() => app.visit(item.channelId!)}>{t().chat.go}</button>
                    {:else}
                      <span class="invite-note">{reach === "there" ? t().chat.there : reach === "locked" ? t().chat.noEntry : t().chat.gone}</span>
                    {/if}
                  {/if}
                </div>
              {/if}
              <div class="meta">
                <time datetime={new Date(item.at).toISOString()}>{untilTime(item.at, now)}</time>
                {#each reactions as r (r.kind)}
                  {@const Icon = REACTION_ICONS[r.kind]}
                  {@const label = t().board.reactionTitle(t().board.reactions[r.kind], r.names.join(", "))}
                  <button type="button" class="chip" class:pressed={r.mine} aria-pressed={r.mine} aria-label={label} title={label} onclick={() => void chat.react(item, r.kind)}>
                    <Icon size={13} aria-hidden="true" />{#if r.count > 1}<span>{r.count}</span>{/if}
                  </button>
                {/each}
                {#if !item.mine}
                  <button type="button" class="chip add" aria-label={t().chat.react} title={t().chat.react} aria-expanded={picker === item.id} onclick={() => (picker = picker === item.id ? null : item.id)}>
                    <SmilePlus size={14} aria-hidden="true" />
                  </button>
                {/if}
              </div>
              {#if picker === item.id}
                <div class="picker">
                  <ReactionPicker {reactions} onpick={(kind) => { picker = null; void chat.react(item, kind); }} onclose={() => (picker = null)} />
                </div>
              {/if}
            </div>
          {:else}
            <p class="first">{t().chat.first(conversation.name)}</p>
          {/each}
        </div>

        <div class="compose">
          {#if partner?.entry.canChat}
            <div class="compose-row">
              <label class="sr" for="chat-input">{t().chat.label(conversation.name)}</label>
              <textarea
                id="chat-input" bind:this={input} rows="1" value={draft} placeholder={t().chat.placeholder(conversation.name)} maxlength={CHAT_LIMITS.textChars + 200}
                oninput={(e) => { chat.setDraft(conversation!.person, e.currentTarget.value); grow(); }} {onkeydown}
              ></textarea>
              <button type="button" class="round" aria-label={t().chat.invite(conversation.name)} title={t().chat.invite(conversation.name)} disabled={chat.busy} onclick={() => void chat.invite()}><DoorOpen size={18} /></button>
              <button type="button" class="round solid" aria-label={t().chat.send} title={`${t().chat.send} (Enter)`} disabled={chat.busy || !draft.trim()} onclick={() => void send()}><SendHorizontal size={17} /></button>
            </div>
            {#if nearLimit}<span class="chars" class:over={draft.length > CHAT_LIMITS.textChars}>{t().chat.chars(draft.length, CHAT_LIMITS.textChars)}</span>{/if}
          {:else}
            <p class="away-note">{t().chat.away(conversation.name)}</p>
          {/if}
          <p class="hint">
            <span><kbd>{SHORTCUT_KEYS.chat.toUpperCase()}</kbd> {t().chat.keyToggle}</span>
            <span><kbd>{SHORTCUT_KEYS.chatPrev}</kbd> <kbd>{SHORTCUT_KEYS.chatNext}</kbd> {t().chat.keyTabs}</span>
            <span><kbd>Esc</kbd> {t().chat.keyClose}</span>
          </p>
          <p class="hint">{t().chat.keep}</p>
        </div>
      </div>
    {:else}
      <div class="empty">
        <MessagesSquare size={36} aria-hidden="true" />
        <strong>{t().chat.none}</strong>
        <span>{t().chat.noneHint}</span>
      </div>
    {/if}
  </section>
{/if}

<style>
  /* the tint of a person: the bubbles of the other one and the line under their tab */
  .tint-1 { --tint: var(--chat-1); --tint-line: var(--chat-1-line); }
  .tint-2 { --tint: var(--chat-2); --tint-line: var(--chat-2-line); }
  .tint-3 { --tint: var(--chat-3); --tint-line: var(--chat-3-line); }
  .tint-4 { --tint: var(--chat-4); --tint-line: var(--chat-4-line); }
  .tint-5 { --tint: var(--chat-5); --tint-line: var(--chat-5-line); }
  .tint-6 { --tint: var(--chat-6); --tint-line: var(--chat-6-line); }

  .chat {
    --color-paper: var(--color-raised);
    position: fixed; right: 32px; bottom: 24px; z-index: 20; width: 384px; height: min(580px, calc(100vh - 120px));
    display: flex; flex-direction: column; overflow: hidden; border-radius: 10px; background: var(--color-paper); color: var(--color-ink);
    box-shadow: 0 0 0 1px var(--color-raised-edge), 0 16px 48px rgb(0 56 105 / 0.28), 0 2px 6px rgb(0 56 105 / 0.15);
    animation: rise 200ms var(--ease-out) both;
  }
  @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .chat, .row { animation: none; } }

  .bar { display: flex; align-items: center; gap: 8px; height: 44px; flex: none; padding: 0 6px 0 14px; background: var(--color-wall); color: var(--color-white); }
  h2 { margin: 0; flex: 1; font-size: 14px; font-weight: 700; letter-spacing: 0.02em; }
  .bar-btn { width: 36px; height: 36px; display: grid; place-items: center; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--color-plate-muted); cursor: pointer; }
  .bar-btn:hover { background: rgb(255 255 255 / 0.12); color: var(--color-white); }

  .tabs { display: flex; gap: 2px; flex: none; padding: 6px 8px 0; overflow-x: auto; background: var(--color-blue-50); scrollbar-width: thin; }
  .tab { display: flex; align-items: center; flex: none; max-width: 160px; border-radius: 6px 6px 0 0; }
  .tab.active { background: var(--color-paper); box-shadow: inset 0 -3px 0 var(--tint-line); }
  .tab-btn { display: flex; align-items: center; gap: 7px; min-width: 0; height: 38px; padding: 0 4px 0 9px; border: 0; background: transparent; color: var(--color-ink); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
  .tab:not(.active) .tab-btn:hover { color: var(--color-link); }
  .tab-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tab-close { width: 26px; height: 26px; margin-right: 3px; display: grid; place-items: center; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--color-blue-700); cursor: pointer; }
  .tab-close:hover { background: var(--color-blue-100); }

  .mini {
    width: 24px; height: 24px; flex: none; border-radius: 50%; background: var(--color-blue-500); color: var(--color-white);
    display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700;
  }
  .mini.big { width: 44px; height: 44px; font-size: 15px; }
  .mini.away { opacity: 0.45; }
  .badge {
    min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box; border-radius: 9px; background: var(--color-ink); color: var(--color-paper);
    font-size: 11px; font-weight: 700; line-height: 18px; text-align: center; font-variant-numeric: tabular-nums;
  }

  .conversation { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .who { display: flex; align-items: center; gap: 14px; flex: none; padding: 10px 10px 10px 14px; border-bottom: 1px solid var(--color-blue-100); }
  .who :global(.person) { width: 44px; }
  .who-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .who-name { font-size: 15px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .who-place, .who-status { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--color-blue-700); min-width: 0; }
  .who-status { font-style: italic; overflow-wrap: anywhere; }
  .same { flex: none; font-size: 12px; color: var(--color-blue-700); }
  .go {
    flex: none; min-height: 32px; padding: 0 12px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-paper);
    color: var(--color-ink); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
  }
  .go:hover { background: var(--color-blue-100); }
  .go.solid { align-self: flex-start; border-color: var(--color-ink); background: var(--color-ink); color: var(--color-paper); }
  .go.solid:hover { background: var(--color-ink-soft); }
  .icon-btn { flex: none; width: 32px; height: 32px; display: grid; place-items: center; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--color-blue-700); cursor: pointer; }
  .icon-btn:hover { background: var(--color-blue-100); color: var(--color-ink); }

  .messages { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding: 14px; scrollbar-width: thin; }
  .row { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; animation: rise 200ms var(--ease-out) both; }
  .row.mine { align-items: flex-end; }
  .bubble {
    max-width: 86%; box-sizing: border-box; padding: 8px 12px; border-radius: 14px 14px 14px 4px; background: var(--tint); color: var(--color-ink);
    font-size: 14px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere;
  }
  .row.mine .bubble { border-radius: 14px 14px 4px 14px; background: var(--color-ink); color: var(--color-paper); }
  .bubble.invite { display: flex; flex-direction: column; gap: 6px; padding: 10px 14px; box-shadow: inset 0 0 0 1px var(--tint-line); }
  .row.mine .bubble.invite { box-shadow: none; }
  .invite-head { display: flex; align-items: center; gap: 7px; font-weight: 700; }
  .invite-text { font-size: 13px; }
  .invite-note { font-size: 12px; color: var(--color-blue-700); }
  .meta { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; font-size: 11px; color: var(--color-blue-700); }
  .row.mine .meta { flex-direction: row-reverse; }
  .meta time { margin: 0 4px; font-variant-numeric: tabular-nums; }
  .chip {
    display: inline-flex; align-items: center; gap: 3px; height: 24px; padding: 0 7px; border: 1px solid var(--color-blue-300); border-radius: 12px;
    background: var(--color-paper); color: var(--color-ink); font: inherit; font-size: 11px; font-weight: 700; cursor: pointer;
  }
  .chip.pressed { border-color: var(--color-ink); background: var(--color-blue-100); }
  .chip.add { border-color: transparent; background: transparent; color: var(--color-blue-700); padding: 0 5px; }
  .chip:hover { background: var(--color-blue-100); }
  .picker { width: 100%; max-width: 300px; }
  .first { margin: auto; font-size: 13px; color: var(--color-blue-700); text-align: center; }

  .compose { flex: none; display: flex; flex-direction: column; gap: 4px; padding: 10px 10px 8px; border-top: 1px solid var(--color-blue-100); }
  .compose-row { display: flex; align-items: flex-end; gap: 6px; }
  textarea {
    flex: 1; min-width: 0; min-height: 40px; max-height: 132px; box-sizing: border-box; padding: 9px 14px; border: 1px solid var(--color-blue-300); border-radius: 20px;
    background: var(--color-paper); color: var(--color-ink); font: inherit; font-size: 14px; line-height: 20px; resize: none;
  }
  textarea:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 1px; }
  .round {
    width: 40px; height: 40px; flex: none; display: grid; place-items: center; border: 1px solid var(--color-blue-300); border-radius: 50%;
    background: var(--color-paper); color: var(--color-ink); cursor: pointer;
  }
  .round:hover:not(:disabled) { background: var(--color-blue-100); }
  .round.solid { border-color: var(--color-ink); background: var(--color-ink); color: var(--color-paper); }
  .round.solid:hover:not(:disabled) { background: var(--color-ink-soft); }
  .round:disabled { opacity: 0.45; cursor: default; }
  .chars { align-self: flex-end; padding-right: 92px; font-size: 11px; color: var(--color-blue-700); }
  .chars.over { color: var(--color-alert); font-weight: 700; }
  .away-note { margin: 0; padding: 8px 10px; border-radius: var(--radius-md); background: var(--color-surface); font-size: 13px; color: var(--color-blue-700); }
  .hint { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 0; padding: 0 6px; font-size: 11px; color: var(--color-blue-700); }
  kbd { min-width: 14px; padding: 0 4px; border: 1px solid var(--color-blue-300); border-radius: 3px; font: inherit; font-weight: 700; text-align: center; }

  .empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 32px; text-align: center; color: var(--color-blue-700); font-size: 13px; line-height: 1.5; }
  .empty strong { color: var(--color-ink); font-size: 15px; }
  .empty :global(svg) { color: var(--color-blue-300); }


  .bar-btn:focus-visible, .tab-btn:focus-visible, .tab-close:focus-visible, .go:focus-visible, .icon-btn:focus-visible, .chip:focus-visible, .round:focus-visible {
    outline: 3px solid var(--color-sky); outline-offset: 1px;
  }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
