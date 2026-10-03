<script lang="ts" module>
  import { t as tr } from "../i18n/index.svelte.ts";

  /** the device of a key in the UI language: the service stores "Firefox on Linux" (product names, English "on") */
  export function deviceName(device: string): string {
    if (!device) return tr().keys.unknownDevice;
    const m = /^(.+) on (.+)$/.exec(device);
    return m ? tr().keys.device(m[1]!, m[2]!) : device;
  }
</script>

<script lang="ts">
  import type { DeviceKey } from "@ruumble/protocol";
  import { relativeTime } from "../board/model.ts";
  import { locale, t } from "../i18n/index.svelte.ts";
  import Icon from "./care/Icon.svelte";

  // keys (paired browsers, ADR-0015) of one person, one line each with a revoke button; used for the own keys
  // (my keys) and for everyone else's (building maintenance). The parent asks for confirmation.
  let { keys, busy = false, onrevoke }: { keys: DeviceKey[]; busy?: boolean; onrevoke: (key: DeviceKey) => void } = $props();

  const date = $derived(new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short", year: "numeric" }));
  /** "Just now" in the middle of a line */
  const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
</script>

<ul class="list">
  {#each keys as k (k.id)}
    {@const device = deviceName(k.device)}
    <li>
      <span class="text">
        <span class="name">{device}{#if k.current}<span class="badge">{t().keys.thisBrowser}</span>{/if}</span>
        <span class="details">{t().keys.paired(date.format(k.created))}{#if k.lastUsed !== null}{" · "}{t().keys.lastUsed(lower(relativeTime(k.lastUsed)))}{/if}</span>
      </span>
      <button type="button" class="remove" aria-label={t().keys.revoke(device)} title={t().keys.revoke(device)} disabled={busy} onclick={() => onrevoke(k)}><Icon name="trash" size={16} /></button>
    </li>
  {/each}
</ul>

<style>
  .list { list-style: none; margin: 0; padding: 0; width: 100%; border: 1px solid var(--line); border-radius: 4px; }
  .list li { display: flex; align-items: center; gap: 10px; padding: 4px 6px 4px 10px; min-height: 48px; }
  .list li + li { border-top: 1px solid var(--line-soft); }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.35; }
  .name { font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .badge { font-size: 12px; font-weight: 700; padding: 0 8px; border: 1px solid var(--accent-soft); border-radius: 12px; background: var(--tint); color: var(--ink-2); }
  .details { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .remove { flex: none; width: 36px; height: 36px; display: grid; place-items: center; border: 1px solid #f0c9c5; border-radius: 4px; background: #fff; color: var(--danger); cursor: pointer; }
  .remove:hover { background: var(--danger-tint); }
  .remove:disabled { opacity: 0.45; cursor: default; }
</style>
