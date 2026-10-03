<script lang="ts">
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import type { DeviceKey } from "@ruumble/protocol";
  import { relativeTime } from "../board/model.ts";
  import { locale, t } from "../i18n/index.svelte.ts";

  // keys (paired browsers, ADR-0015) of one person, one line each with a revoke button; used for the own keys
  // (user menu) and for everyone else's (building maintenance). `owner`: whose keys, null for the own ones.
  let { keys, owner = null, busy = false, onrevoke }: { keys: DeviceKey[]; owner?: string | null; busy?: boolean; onrevoke: (id: string) => void } = $props();

  const date = $derived(new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short", year: "numeric" }));
  const device = (k: DeviceKey) => k.device || t().keys.unknownDevice;
  /** "Just now" in the middle of a line */
  const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

  function revoke(k: DeviceKey): void {
    const c = t().keys;
    const question = k.current ? c.confirmRevokeCurrent : owner ? c.confirmRevokeOther(device(k), owner) : c.confirmRevoke(device(k));
    if (confirm(question)) onrevoke(k.id);
  }
</script>

<ul class="list">
  {#each keys as k (k.id)}
    <li>
      <span class="text">
        <span class="name">{device(k)}{#if k.current}<span class="badge">{t().keys.thisBrowser}</span>{/if}</span>
        <span class="details">{t().keys.paired(date.format(k.created))}{#if k.lastUsed !== null}{" · "}{t().keys.lastUsed(lower(relativeTime(k.lastUsed)))}{/if}</span>
      </span>
      <button type="button" class="icon" aria-label={t().keys.revoke(device(k))} title={t().keys.revoke(device(k))} disabled={busy} onclick={() => revoke(k)}><Trash2 size={16} /></button>
    </li>
  {/each}
</ul>

<style>
  .list { list-style: none; margin: 0; padding: 0; width: 100%; border: 1px solid var(--color-blue-100); border-radius: var(--radius-md); }
  .list li { display: flex; align-items: center; gap: 10px; padding: 6px 4px 6px 10px; }
  .list li + li { border-top: 1px solid var(--color-blue-100); }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .name { font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .badge { font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 8px; background: var(--color-blue-100); color: var(--color-blue-700); }
  .details { font-size: 13px; color: var(--color-blue-700); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  button { border: 0; background: transparent; min-height: 36px; min-width: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--color-alert); cursor: pointer; border-radius: var(--radius-md); }
  button:disabled { opacity: 0.5; cursor: default; }
  button:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
</style>
