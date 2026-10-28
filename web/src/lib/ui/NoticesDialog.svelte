<script lang="ts">
  import Bell from "@lucide/svelte/icons/bell";
  import { LEVELS, NOTICE_KINDS } from "../notices/model.ts";
  import { t } from "../i18n/index.svelte.ts";
  import type { RuumbleState } from "../state.svelte.ts";
  import CareShell from "./care/CareShell.svelte";

  // The notices of this browser (ADR-0023), from the user menu: a level for each kind of event, desktop notifications
  // (the browser asks for the permission when they are switched on) and do not disturb. Every change is saved at once.
  let { app }: { app: RuumbleState } = $props();
  const notices = $derived(app.notices);
</script>

<CareShell title={t().notices.title} level="notices" narrow onclose={() => (app.noticesOpen = false)} houseRule={t().notices.doNotDisturbHint} status={null}>
  {#snippet glyph()}<span class="glyph"><Bell size={30} /></span>{/snippet}
  <p class="intro">{t().notices.intro}</p>
  <div class="grid">
    {#each NOTICE_KINDS as kind (kind)}
      <label for="notice-{kind}">{t().notices.kinds[kind]}</label>
      <select id="notice-{kind}" value={notices.settings.levels[kind]} onchange={(e) => notices.setLevel(kind, LEVELS.find((l) => l === e.currentTarget.value) ?? "quiet")}>
        {#each LEVELS as level (level)}<option value={level}>{t().notices.levels[level]}</option>{/each}
      </select>
    {/each}
  </div>
  <p class="intro">{t().notices.levelHelp}</p>
  <div class="checks">
    <label class="check">
      <input type="checkbox" checked={notices.settings.doNotDisturb} onchange={(e) => notices.setDoNotDisturb(e.currentTarget.checked)} />{t().notices.doNotDisturb}
    </label>
    <label class="check">
      <input type="checkbox" checked={notices.settings.desktop} disabled={notices.permission === "unsupported"} onchange={(e) => void notices.setDesktop(e.currentTarget.checked)} />{t().notices.desktop}
    </label>
    {#if notices.permission === "denied"}<p class="error" role="status">{t().notices.desktopDenied}</p>{/if}
    {#if notices.permission === "unsupported"}<p class="intro">{t().notices.desktopUnsupported}</p>{/if}
    <label class="check indent">
      <input type="checkbox" checked={notices.settings.desktopText} disabled={!notices.settings.desktop} onchange={(e) => notices.setDesktopText(e.currentTarget.checked)} />{t().notices.desktopText}
    </label>
  </div>
</CareShell>

<style>
  .glyph { display: inline-flex; color: var(--ink); }
  p { margin: 0; }
  .intro { font-size: 13px; color: var(--muted); }
  .error { color: var(--danger); font-size: 13px; }
  .grid { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 10px 16px; }
  label { font-size: 14px; font-weight: 700; }
  select { height: 40px; padding: 0 10px; border: 1px solid var(--control); border-radius: 4px; font: inherit; color: var(--ink); background: var(--paper); }
  .checks { display: flex; flex-direction: column; gap: 10px; }
  .check { display: flex; align-items: flex-start; gap: 10px; font-weight: 400; }
  .check input { margin-top: 3px; width: 18px; height: 18px; flex: none; }
  .indent { margin-left: 28px; }
</style>
