<script lang="ts">
  import Download from "@lucide/svelte/icons/download";
</script>

<!-- Kurzanleitung auf den Hinweisseiten: Plugins können in Mumble weder Knöpfe noch Links anzeigen (ADR-0010). -->
<section class="help" aria-label="Ruumble-Plugin einrichten">
  <a class="download" href="/download" download>
    <Download size={18} /> Ruumble-Plugin herunterladen
  </a>
  <ol>
    <li>In Mumble: <em>Konfigurieren → Einstellungen → Plugins → „Plugin installieren“</em> und die Datei wählen.</li>
    <li>Bei <strong>Ruumble</strong> den Haken <em>„Aktivieren“</em> setzen und mit OK schließen.</li>
    <li>Mit dem Server verbinden. Beim ersten Mal öffnet sich diese Seite mit einem Kopplungslink.</li>
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
