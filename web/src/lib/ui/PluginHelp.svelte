<script lang="ts">
  import Download from "@lucide/svelte/icons/download";
  import { t } from "../i18n/index.svelte.ts";

  const h = $derived(t().pluginHelp);
</script>

<!-- Quick guide on the notice pages: plugins can show neither buttons nor links in Mumble (ADR-0010). -->
<!-- Menu and button names as Mumble shows them in the respective language; highlighted: every second piece -->
<section class="help" aria-label={h.label}>
  <a class="download" href="/download" download>
    <Download size={18} /> {h.download}
  </a>
  <ol>
    <li>{h.step1[0]}<em>{h.step1[1]}</em>{h.step1[2]}<em>{h.step1[3]}</em>{h.step1[4]}</li>
    <li>{h.step2[0]}<strong>{h.step2[1]}</strong>{h.step2[2]}<em>{h.step2[3]}</em>{h.step2[4]}</li>
    <li>{h.step3}</li>
  </ol>
</section>

<style>
  .help { display: flex; flex-direction: column; align-items: center; gap: 12px; margin-top: 16px; max-width: 560px; }
  .download {
    display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 10px 16px;
    border-radius: var(--radius-md); background: var(--color-navy); color: var(--color-white);
    font-weight: 700; text-decoration: none;
  }
  .download:hover { background: var(--color-navy-light); }
  .download:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
  ol { margin: 0; padding-left: 20px; text-align: left; font-size: 14px; line-height: 1.6; color: var(--color-blue-700); }
</style>
