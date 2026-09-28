<script lang="ts">
  import ArrowDownUp from "@lucide/svelte/icons/arrow-down-up";
  import HeadphoneOff from "@lucide/svelte/icons/headphone-off";
  import Headphones from "@lucide/svelte/icons/headphones";
  import LocateFixed from "@lucide/svelte/icons/locate-fixed";
  import Lock from "@lucide/svelte/icons/lock";
  import Mic from "@lucide/svelte/icons/mic";
  import MicOff from "@lucide/svelte/icons/mic-off";
  import Settings from "@lucide/svelte/icons/settings";
  import { countText, initials, type Building, type Floor } from "../model/building.ts";
  import type { RuumbleState } from "../state.svelte.ts";
  import Avatar from "./Avatar.svelte";

  let { app, building, floor }: { app: RuumbleState; building: Building; floor: Floor | null } = $props();

  const reversed = $derived([...building.floors].reverse());
  const me = $derived(app.me);
  const myFloor = $derived(building.floors.find((f) => f.isSelf) ?? null);
  const myPlace = $derived.by(() => {
    const self = building.self;
    if (!self || !me) return "";
    if (self.kind === "entrance") return "Eingang";
    if (self.kind === "hidden") return "nicht darstellbarer Bereich";
    const name = app.snapshot?.channels.find((c) => c.id === me.channel)?.name ?? "";
    const place = self.kind === "corridor" ? "Flur" : name;
    return myFloor ? `${place} · Etage ${myFloor.badge}` : place;
  });
  const lockHint = { "too-deep": "Kanalstruktur zu tief", "too-many-rooms": "Zu viele Räume" };
  const muted = $derived(me ? me.selfMute || me.selfDeaf : false);
  const deaf = $derived(me?.selfDeaf ?? false);
</script>

<aside class="core">
  <span class="opening" aria-hidden="true"></span>
  <div>
    <div class="sign-title">{building.name}</div>
    <div class="sign-sub">Mumble-Server</div>
  </div>

  <nav class="elevator" aria-label="Aufzug – Etagen">
    <div class="elevator-head">
      <span class="t"><span class="elevator-icon"><ArrowDownUp size={20} /></span>Aufzug</span>
      {#if floor}<span class="cur">Etage {floor.badge}</span>{/if}
    </div>
    {#each reversed as f (f.channelId)}
      {@const active = f.channelId === floor?.channelId}
      {@const blocked = f.lock !== null && !f.isSelf}
      <button
        type="button"
        class="floor"
        data-floor={f.channelId}
        class:active
        class:blocked
        aria-current={active ? "page" : undefined}
        aria-disabled={blocked || undefined}
        aria-label="{f.level}: {f.name}{f.lock ? ` – gesperrt: ${lockHint[f.lock]}` : ''}"
        title={f.lock ? lockHint[f.lock] : undefined}
        onclick={() => app.showFloor(f)}
      >
        <span class="badge">{f.badge}</span>
        <span>
          <span class="name">{f.name}</span>
          <span class="sub">
            {#if f.lock}<Lock size={11} /> gesperrt · {/if}{f.population} online
          </span>
        </span>
      </button>
    {/each}
  </nav>

  {#if building.entrance.length > 0}
    <section class="entrance" aria-label="Eingang">
      <div class="entrance-head">Eingang · {countText(building.entrance.length)}</div>
      <div class="entrance-people">
        {#each building.entrance as user (user.session)}
          <Avatar {user} talking={app.talking[user.session] ?? false} showName={false} />
        {/each}
      </div>
    </section>
  {/if}

  <div class="usermenu">
    {#if me}
      <div class="me-row">
        <span class="av-me" aria-hidden="true">{initials(me.name)}</span>
        <span><span class="n">{me.name}</span><span class="l">{myPlace}</span></span>
      </div>
    {/if}
    <div class="tools" role="toolbar" aria-label="Benutzermenü">
      <button type="button" class="tool" aria-pressed={muted} aria-label="Mikrofon stummschalten" title="Mikrofon stumm" disabled={!me} onclick={() => app.toggleMute()}>
        {#if muted}<MicOff size={20} />{:else}<Mic size={20} />{/if}
      </button>
      <button type="button" class="tool" aria-pressed={deaf} aria-label="Taub schalten" title="Taub" disabled={!me} onclick={() => app.toggleDeaf()}>
        {#if deaf}<HeadphoneOff size={20} />{:else}<Headphones size={20} />{/if}
      </button>
      <button type="button" class="tool" aria-label="Zu meiner Etage" title="Zu meiner Etage" disabled={!myFloor} onclick={() => app.goHome()}>
        <LocateFixed size={20} />
      </button>
      <button type="button" class="tool" aria-label="Einstellungen (noch ohne Funktion)" title="Einstellungen – noch ohne Funktion" aria-disabled="true">
        <Settings size={20} />
      </button>
    </div>
    <div class="versions"><span>Server {building.serverVersion}</span><span>Oberfläche {__UI_VERSION__}</span></div>
  </div>
</aside>

<style>
  .core {
    position: relative; width: 300px; flex-shrink: 0; padding: 18px; background: var(--color-surface);
    display: flex; flex-direction: column; gap: 14px; min-height: 0;
  }
  .opening { position: absolute; right: calc(-1 * var(--wall)); top: 276px; width: var(--wall); height: 110px; background: var(--color-white); }
  .sign-title { font-size: 20px; font-weight: 700; }
  .sign-sub { font-size: 13px; color: var(--color-blue-700); }

  .elevator {
    border-radius: var(--radius-md); padding: 14px; background: var(--gradient-elevator); color: var(--color-white);
    display: flex; flex-direction: column; gap: 6px; overflow-y: auto; min-height: 0; flex-shrink: 1;
  }
  .elevator-head { display: flex; align-items: center; justify-content: space-between; padding: 0 4px 8px; border-bottom: 1px solid rgb(255 255 255 / 0.2); }
  .elevator-head .t { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 700; }
  .elevator-icon { display: inline-flex; color: var(--color-sky); }
  .elevator-head .cur { font-size: 13px; color: var(--color-blue-100); }

  .floor {
    display: flex; align-items: center; gap: 12px; width: 100%; min-height: 48px; padding: 4px 10px; border: 0; flex-shrink: 0;
    border-radius: var(--radius-md); background: transparent; color: var(--color-white); text-align: left; cursor: pointer;
    transition: background var(--dur) var(--ease-out);
  }
  .floor:hover { background: rgb(255 255 255 / 0.08); }
  .floor:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
  .floor.active, .floor.active:hover { background: var(--color-white); color: var(--color-navy); }
  .floor.blocked { opacity: 0.55; cursor: not-allowed; }
  .floor.blocked:hover { background: transparent; }
  .floor .badge {
    width: 40px; height: 40px; flex-shrink: 0; border: 2px solid rgb(255 255 255 / 0.6); border-radius: 50%;
    display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px;
  }
  .floor.active .badge { border-color: var(--color-navy); background: var(--color-navy); color: var(--color-white); }
  .floor .name { font-size: 15px; font-weight: 700; display: block; }
  .floor .sub { font-size: 13px; color: var(--color-blue-100); display: flex; align-items: center; gap: 4px; white-space: nowrap; }
  .floor.active .sub { color: var(--color-blue-700); }

  .entrance { display: flex; flex-direction: column; gap: 10px; }
  .entrance-head { font-size: 13px; font-weight: 700; color: var(--color-blue-700); }
  .entrance-people { display: flex; flex-wrap: wrap; gap: 4px; }
  .entrance-people :global(.person) { width: 48px; }

  .usermenu { margin-top: auto; display: flex; flex-direction: column; gap: 12px; padding-top: 14px; border-top: 1px solid var(--color-blue-300); }
  .me-row { display: flex; align-items: center; gap: 12px; }
  .av-me {
    width: 44px; height: 44px; flex-shrink: 0; border-radius: 50%; background: var(--color-navy); color: var(--color-white);
    box-shadow: 0 0 0 3px var(--color-accent); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 15px;
  }
  .me-row .n { font-size: 15px; font-weight: 700; display: block; }
  .me-row .l { font-size: 13px; color: var(--color-blue-700); display: block; }
  .tools { display: flex; gap: 8px; }
  .tool {
    width: 44px; height: 44px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-white);
    display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--color-navy);
    transition: background var(--dur) var(--ease-out);
  }
  .tool:hover { background: var(--color-blue-100); }
  .tool:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
  .tool[aria-pressed="true"] { background: var(--color-navy); border-color: var(--color-navy); color: var(--color-white); }
  .tool:disabled, .tool[aria-disabled="true"] { opacity: 0.5; cursor: not-allowed; }
  .tool:disabled:hover, .tool[aria-disabled="true"]:hover { background: var(--color-white); }
  .versions { display: flex; justify-content: space-between; font-size: 12px; color: var(--color-blue-700); }
</style>
