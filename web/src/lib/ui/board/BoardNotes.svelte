<script lang="ts">
  // Pinnwand-Grafik im Raum (ADR-0011, Variante B): zwei Zettel mit Nadeln, rechtsbündig.
  // Nur im eigenen Raum, als Schalter für die Seitenleiste; sie zeigt nie an, ob oder wie viel dort hängt.
</script>

<svg class="notes" width="56" height="38" viewBox="0 0 44 30" aria-hidden="true">
  <g transform="rotate(-7 12 15)">
    <rect x="3" y="4" width="18" height="22" class="paper" />
    <line x1="7" y1="13" x2="17" y2="13" class="line" /><line x1="7" y1="17" x2="15" y2="17" class="line" /><line x1="7" y1="21" x2="13" y2="21" class="line" />
    <circle cx="12" cy="6.5" r="2.8" class="pin a" />
  </g>
  <g transform="rotate(6 31 15)">
    <rect x="22" y="5" width="18" height="22" class="paper" />
    <line x1="26" y1="14" x2="36" y2="14" class="line" /><line x1="26" y1="18" x2="34" y2="18" class="line" /><line x1="26" y1="22" x2="32" y2="22" class="line" />
    <circle cx="31" cy="7.5" r="2.8" class="pin b" />
  </g>
</svg>

<style>
  .notes { display: block; overflow: visible; filter: drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.18)); }
  .paper { fill: var(--color-white); stroke: var(--color-blue-500); stroke-width: 1; }
  .line { stroke: var(--color-blue-500); stroke-width: 1.1; stroke-linecap: round; }
  .pin { stroke: var(--color-navy); stroke-width: 0.7; }
  .pin.a { fill: var(--color-sky); }
  .pin.b { fill: var(--color-accent); }
</style>
