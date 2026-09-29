<script lang="ts">
  import ArrowDownUp from "@lucide/svelte/icons/arrow-down-up";
  import HeadphoneOff from "@lucide/svelte/icons/headphone-off";
  import Headphones from "@lucide/svelte/icons/headphones";
  import LocateFixed from "@lucide/svelte/icons/locate-fixed";
  import Lock from "@lucide/svelte/icons/lock";
  import Mic from "@lucide/svelte/icons/mic";
  import MicOff from "@lucide/svelte/icons/mic-off";
  import Languages from "@lucide/svelte/icons/languages";
  import { locale, setLocale, t } from "../i18n/index.svelte.ts";
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
    if (self.kind === "entrance") return t().common.entrance;
    if (self.kind === "hidden") return t().core.hiddenPlace;
    const name = app.snapshot?.channels.find((c) => c.id === me.channel)?.name ?? "";
    const place = self.kind === "corridor" ? t().common.corridor : name;
    return myFloor ? `${place} · ${t().floors.floor(myFloor.badge)}` : place;
  });
  const lockHint = $derived(t().core.lockReason);
  const other = $derived(locale() === "de" ? "en" : "de");
  const muted = $derived(me ? me.selfMute || me.selfDeaf : false);
  const myAvatar = $derived(me ? app.avatarOf(me.name) : null);
  let avatarBroken = $state<string | null>(null); // URL that could not be loaded → initials
  const deaf = $derived(me?.selfDeaf ?? false);
</script>

<aside class="core">
  <span class="opening" aria-hidden="true"></span>
  <div>
    <div class="sign-title">{building.name}</div>
    <div class="sign-sub">{t().core.mumbleServer}</div>
  </div>

  <nav class="elevator" aria-label={t().core.elevatorLabel}>
    <div class="elevator-head">
      <span class="t"><span class="elevator-icon"><ArrowDownUp size={20} /></span>{t().core.elevator}</span>
      {#if floor}<span class="cur">{t().floors.floor(floor.badge)}</span>{/if}
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
        aria-label={t().core.floorButton(f.level, f.name, f.lock ? lockHint[f.lock] : null)}
        title={f.lock ? lockHint[f.lock] : undefined}
        onclick={() => app.showFloor(f)}
      >
        <span class="badge">{f.badge}</span>
        <span>
          <span class="name">{f.name}</span>
          <span class="sub">
            {#if f.lock}<Lock size={11} /> {`${t().core.lockedShort} · `}{/if}{t().header.online(f.population)}
          </span>
        </span>
      </button>
    {/each}
  </nav>

  {#if building.entrance.length > 0}
    <section class="entrance" aria-label={t().common.entrance}>
      <div class="entrance-head">{t().common.entrance} · {countText(building.entrance.length)}</div>
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
        <span class="av-me" aria-hidden="true">
          {#if myAvatar && avatarBroken !== myAvatar}<img src={myAvatar} alt="" onerror={() => (avatarBroken = myAvatar)} />{:else}{initials(me.name)}{/if}
        </span>
        <span><span class="n">{me.name}</span><span class="l">{myPlace}</span></span>
      </div>
    {/if}
    <div class="tools" role="toolbar" aria-label={t().core.userMenu}>
      <button type="button" class="tool" aria-pressed={muted} aria-label={t().core.mute} title={t().core.mute} disabled={!me} onclick={() => app.toggleMute()}>
        {#if muted}<MicOff size={20} />{:else}<Mic size={20} />{/if}
      </button>
      <button type="button" class="tool" aria-pressed={deaf} aria-label={t().core.deaf} title={t().core.deaf} disabled={!me} onclick={() => app.toggleDeaf()}>
        {#if deaf}<HeadphoneOff size={20} />{:else}<Headphones size={20} />{/if}
      </button>
      <button type="button" class="tool" aria-label={t().core.home} title={t().core.home} disabled={!myFloor} onclick={() => app.goHome()}>
        <LocateFixed size={20} />
      </button>
      <!-- language: German or English (browser setting), switchable here and remembered -->
      <button type="button" class="tool lang" aria-label={t().core.switchLanguage(t().core.languageName[other])} title={t().core.switchLanguage(t().core.languageName[other])} onclick={() => setLocale(other)}>
        <Languages size={16} /><span>{locale().toUpperCase()}</span>
      </button>
    </div>
    <div class="versions"><span>{t().core.server(building.serverVersion)}</span><span>{t().core.ui(__UI_VERSION__)}</span></div>
  </div>
</aside>

<style>
  .core {
    position: relative; width: 300px; flex-shrink: 0; padding: 18px; background: var(--color-surface);
    display: flex; flex-direction: column; gap: 14px; min-height: 0;
  }
  /* opening to the corridor: the corridor (110 px) sits centred between two equally tall rows of rooms */
  .opening { position: absolute; right: calc(-1 * var(--wall)); top: calc(50% - 55px); width: var(--wall); height: 110px; background: var(--color-white); }
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
  .tool.lang { gap: 2px; font-size: 11px; font-weight: 700; flex-direction: column; }
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
    overflow: hidden;
  }
  .av-me img { width: 100%; height: 100%; object-fit: cover; }
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
  .tool:disabled { opacity: 0.5; cursor: not-allowed; }
  .tool:disabled:hover { background: var(--color-white); }
  .versions { display: flex; justify-content: space-between; font-size: 12px; color: var(--color-blue-700); }
</style>
