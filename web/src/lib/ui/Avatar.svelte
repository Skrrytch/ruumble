<script lang="ts">
  import HeadphoneOff from "@lucide/svelte/icons/headphone-off";
  import Tag from "@lucide/svelte/icons/tag";
  import MicOff from "@lucide/svelte/icons/mic-off";
  import Unplug from "@lucide/svelte/icons/unplug";
  import type { UserView } from "../model/building.ts";
  import { t } from "../i18n/index.svelte.ts";
  import { personLabel, statusText } from "../status.ts";

  let {
    user,
    talking = false,
    showName = true,
    tooltip = true,
    dropTarget = false,
    action,
  }: {
    user: UserView;
    talking?: boolean;
    showName?: boolean;
    /** false: a card shows who it is instead (nudge, ADR-0020) */
    tooltip?: boolean;
    /** a file is dragged over this person: tube mail goes to them alone (ADR-0022) */
    dropTarget?: boolean;
    /** a click on the avatar does something (the own one: the status): said in the tooltip, shown by the pointer */
    action?: string;
  } = $props();

  // image not loadable → initials (AP9)
  let failedUrl = $state<string | null>(null);
  const imageUrl = $derived(user.avatarUrl && user.avatarUrl !== failedUrl ? user.avatarUrl : null);
  // whoever is talking is active – whatever idlesecs says (AP10)
  const presence = $derived(talking ? "active" : user.presence);

  const p = $derived(t().people);
  // status (B, ADR-0018): a tag at the top right, its text in the tooltip
  const status = $derived(user.status ? statusText(user.status) : null);
  const label = $derived(personLabel(user, talking));
  const title = $derived(action ? `${label} – ${action}` : label);
  /** same words as in the label, capitalised as the badge tooltip */
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
</script>

<span class="person" class:action={!!action} title={tooltip ? title : undefined} aria-label={label} role="img" data-session={user.session}>
  <span class="av {presence}" class:me={user.isSelf} class:talking class:drop={dropTarget} aria-hidden="true">
    {#if imageUrl}
      <img src={imageUrl} alt="" onerror={() => (failedUrl = imageUrl)} />
    {:else}
      {user.initials}
    {/if}
    {#if !user.usesRuumble}
      <span class="plain" title={cap(p.withoutRuumble)}><Unplug size={10} strokeWidth={2.5} /></span>
    {/if}
    {#if status}
      <span class="status-tag" title={status}><Tag size={12} strokeWidth={2.5} /></span>
    {/if}
    {#if user.recording}
      <span class="rec" title={cap(p.recording)}></span>
    {/if}
    {#if user.serverMuted}
      <span class="flag server" title={cap(p.serverMuted)}><MicOff size={12} strokeWidth={2.5} /></span>
    {:else if user.selfDeafened}
      <span class="flag" title={cap(p.deaf)}><HeadphoneOff size={12} strokeWidth={2.5} /></span>
    {:else if user.selfMuted}
      <span class="flag" title={cap(p.muted)}><MicOff size={12} strokeWidth={2.5} /></span>
    {/if}
  </span>
  {#if showName}<span class="name" aria-hidden="true">{user.name}</span>{/if}
</span>

<style>
  /* a tile of 60 × 63: avatar, 3 px, a name line of 16 px (PERSON_TILE in model/building.ts) */
  .person { display: flex; flex-direction: column; align-items: center; gap: 3px; width: 60px; font-size: 11px; line-height: 16px; } /* 11 px: names like "SuperUser" fit whole */
  .name { max-width: 60px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .av {
    position: relative; width: 44px; height: 44px; flex-shrink: 0; border-radius: 50%;
    background: var(--color-blue-500); color: var(--color-white);
    display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 15px;
    transition: opacity var(--dur) var(--ease-out);
  }
  .av img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
  /* presence (AP10): only the opacity, so ring and badges stay readable */
  .av.quiet { opacity: 0.7; }
  .av.away { opacity: 0.4; }
  /* own user: the only yellow element */
  .av.me { background: var(--color-ink); color: var(--color-paper); box-shadow: 0 0 0 3px var(--color-accent); }
  /* talking indicator: pulsing ring in medium blue (docs/internal/charter.md) */
  .av.talking::after {
    content: ""; position: absolute; inset: -7px; border-radius: 50%;
    border: 3px solid var(--color-sky); animation: pulse 1.2s var(--ease-out) infinite;
  }
  .av.me.talking::after { inset: -10px; }
  @keyframes pulse { 0% { opacity: 1; transform: scale(0.92); } 100% { opacity: 0.35; transform: scale(1.06); } }
  .rec {
    position: absolute; left: -3px; top: -3px; width: 12px; height: 12px; border-radius: 50%;
    background: var(--color-alert); border: 2px solid var(--color-paper);
  }
  /* without Ruumble (no plugin connected, the rarer case): a small plug at the bottom left, quieter than the state badges */
  .plain {
    position: absolute; left: -5px; bottom: -5px; width: 18px; height: 18px; border-radius: 50%;
    background: var(--color-paper); border: 1px solid var(--color-blue-300); color: var(--color-link);
    display: flex; align-items: center; justify-content: center;
  }
  /* a file dragged over the person (tube mail): a dashed ring */
  .av.drop { outline: 3px dashed var(--color-blue-500); outline-offset: 3px; }
  .person.action { cursor: pointer; }
  /* a set status stands out: a filled tag, cut out from the avatar by a ring in the page colour */
  .status-tag {
    position: absolute; right: -8px; top: -8px; width: 24px; height: 24px; border-radius: 50%; box-sizing: border-box;
    background: var(--color-ink); border: 2px solid var(--color-paper); color: var(--color-paper);
    display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 3px rgb(0 56 105 / 0.35);
  }
  .flag {
    position: absolute; right: -6px; bottom: -6px; width: 22px; height: 22px; border-radius: 50%;
    background: var(--color-paper); border: 1px solid var(--color-blue-300); color: var(--color-ink);
    display: flex; align-items: center; justify-content: center;
  }
  .flag.server { background: var(--color-ink); border-color: var(--color-ink); color: var(--color-paper); }
</style>
