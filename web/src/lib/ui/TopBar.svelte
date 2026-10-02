<script lang="ts">
  import ArrowDownUp from "@lucide/svelte/icons/arrow-down-up";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import HeadphoneOff from "@lucide/svelte/icons/headphone-off";
  import Headphones from "@lucide/svelte/icons/headphones";
  import Languages from "@lucide/svelte/icons/languages";
  import LocateFixed from "@lucide/svelte/icons/locate-fixed";
  import Lock from "@lucide/svelte/icons/lock";
  import Mic from "@lucide/svelte/icons/mic";
  import MicOff from "@lucide/svelte/icons/mic-off";
  import UserIcon from "@lucide/svelte/icons/user";
  import Users from "@lucide/svelte/icons/users";
  import { locale, setLocale, t } from "../i18n/index.svelte.ts";
  import { countText, initials, type Building, type Floor } from "../model/building.ts";
  import type { RuumbleState } from "../state.svelte.ts";
  import Avatar from "./Avatar.svelte";

  // Top bar instead of the elevator column: left the current floor with the elevator as a dropdown,
  // in the middle the building (server name, everyone online), right mute, deafen and the user menu.
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
  const deaf = $derived(me?.selfDeaf ?? false);
  const myAvatar = $derived(me ? app.avatarOf(me.name) : null);
  let avatarBroken = $state<string | null>(null); // URL that could not be loaded → initials
  const hidden = $derived(building.self?.kind === "hidden");

  // one dropdown at a time; closes on a choice, Escape (focus back to its button) and a click elsewhere
  let open = $state<"floors" | "user" | null>(null);
  let floorsButton = $state<HTMLButtonElement | null>(null);
  let userButton = $state<HTMLButtonElement | null>(null);
  $effect(() => {
    if (!open) return;
    const which = open;
    const onclick = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(`[data-dropdown="${which}"]`)) open = null; };
    const onkeydown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      open = null;
      (which === "floors" ? floorsButton : userButton)?.focus();
    };
    window.addEventListener("click", onclick);
    window.addEventListener("keydown", onkeydown);
    return () => {
      window.removeEventListener("click", onclick);
      window.removeEventListener("keydown", onkeydown);
    };
  });
  const toggle = (which: "floors" | "user") => (open = open === which ? null : which);

  function choose(f: Floor): void {
    app.showFloor(f);
    if (f.lock === null || f.isSelf) open = null;
  }
  /** keyboard: focus on the active floor or the first entry when a dropdown opens */
  function focusFirst(node: HTMLElement): void {
    (node.querySelector<HTMLElement>("[aria-current='page']") ?? node.querySelector<HTMLElement>("button:not([aria-disabled])"))?.focus();
  }
</script>

<header class="topbar">
  <div class="left">
    <div class="dropdown" data-dropdown="floors">
      <button
        type="button" class="current" bind:this={floorsButton} aria-expanded={open === "floors"} aria-controls="elevator"
        aria-label={floor ? t().core.currentFloor(floor.level, floor.name, floor.population) : t().core.elevator}
        onclick={() => toggle("floors")}
      >
        <span class="badge" aria-hidden="true">{#if floor}{floor.badge}{:else}<ArrowDownUp size={16} />{/if}</span>
        <h1>{floor?.name ?? t().screens.vacancyTitle}</h1>
        {#if floor}
          <span class="count" title={t().header.onFloorTitle} aria-hidden="true"><Users size={15} />{floor.population}</span>
        {/if}
        <ChevronDown size={18} class="chevron" aria-hidden="true" />
      </button>
      {#if open === "floors"}
        <!-- elevator panel: highest floor at the top, the entrance below the ground floor -->
        <nav id="elevator" class="elevator" aria-label={t().core.elevatorLabel} {@attach focusFirst}>
          <div class="elevator-head"><span class="elevator-icon"><ArrowDownUp size={18} /></span>{t().core.elevator}</div>
          {#each reversed as f (f.channelId)}
            {@const active = f.channelId === floor?.channelId}
            {@const blocked = f.lock !== null && !f.isSelf}
            <button
              type="button" class="floor" data-floor={f.channelId} class:active class:blocked class:mine={f.isSelf}
              aria-current={active ? "page" : undefined} aria-disabled={blocked || undefined}
              aria-label={t().core.floorButton(f.level, f.name, f.lock ? lockHint[f.lock] : null)}
              title={f.lock ? lockHint[f.lock] : undefined}
              onclick={() => choose(f)}
            >
              <span class="fbadge">{f.badge}</span>
              <span class="ftext">
                <span class="name">{f.name}</span>
                <span class="sub">{#if f.lock}<Lock size={11} /> {`${t().core.lockedShort} · `}{/if}{t().header.online(f.population)}</span>
              </span>
            </button>
          {/each}
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
        </nav>
      {/if}
    </div>
    {#if app.readonly}<span class="note">{t().header.preview}</span>{/if}
    {#if hidden}<span class="note">{t().common.notShown}</span>{/if}
  </div>

  <div class="center" title={t().header.onlineTitle}>
    <span class="building">{building.name}</span>
    <span class="online"><span class="dot" aria-hidden="true"></span>{t().header.online(building.online)}</span>
  </div>

  <div class="right">
    <button type="button" class="tool" aria-pressed={muted} aria-label={t().core.mute} title={t().core.mute} disabled={!me} onclick={() => app.toggleMute()}>
      {#if muted}<MicOff size={20} />{:else}<Mic size={20} />{/if}
    </button>
    <button type="button" class="tool" aria-pressed={deaf} aria-label={t().core.deaf} title={t().core.deaf} disabled={!me} onclick={() => app.toggleDeaf()}>
      {#if deaf}<HeadphoneOff size={20} />{:else}<Headphones size={20} />{/if}
    </button>
    <div class="dropdown" data-dropdown="user">
      <button type="button" class="me" bind:this={userButton} aria-expanded={open === "user"} aria-controls="user-menu" aria-label={t().core.userMenu} title={t().core.userMenu} onclick={() => toggle("user")}>
        <span class="av-me" aria-hidden="true">
          {#if me && myAvatar && avatarBroken !== myAvatar}<img src={myAvatar} alt="" onerror={() => (avatarBroken = myAvatar)} />{:else if me}{initials(me.name)}{:else}<UserIcon size={18} />{/if}
        </span>
        {#if me}<span class="me-name">{me.name}</span>{/if}
        <ChevronDown size={18} class="chevron" aria-hidden="true" />
      </button>
      {#if open === "user"}
        <div id="user-menu" class="menu" role="group" aria-label={t().core.userMenu} {@attach focusFirst}>
          {#if me}
            <div class="me-row"><span class="n">{me.name}</span><span class="l">{myPlace}</span></div>
          {/if}
          <button type="button" class="item" disabled={!myFloor} onclick={() => { app.goHome(); open = null; }}>
            <LocateFixed size={18} aria-hidden="true" />{t().core.home}
          </button>
          <!-- language: German or English (browser setting), switchable here and remembered -->
          <button type="button" class="item" onclick={() => setLocale(other)}>
            <Languages size={18} aria-hidden="true" />{t().core.switchLanguage(t().core.languageName[other])}
          </button>
          <div class="versions"><span>{t().core.server(building.serverVersion)}</span><span>{t().core.ui(__UI_VERSION__)}</span></div>
        </div>
      {/if}
    </div>
  </div>
</header>

<style>
  .topbar { position: relative; z-index: 5; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; min-height: 52px; }
  .left, .right { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .right { justify-self: end; }
  .dropdown { position: relative; min-width: 0; }
  .note { font-size: 13px; font-weight: 700; color: var(--color-blue-500); white-space: nowrap; }

  /* current floor: the button that opens the elevator */
  .current {
    display: flex; align-items: center; gap: 10px; max-width: 100%; height: 48px; padding: 0 12px 0 6px; border: 0; border-radius: var(--radius-md);
    background: transparent; color: var(--color-navy); cursor: pointer; transition: background var(--dur) var(--ease-out);
  }
  .current:hover, .current[aria-expanded="true"] { background: var(--color-blue-100); }
  .current:focus-visible, .me:focus-visible, .tool:focus-visible, .item:focus-visible, .floor:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }
  .badge {
    width: 36px; height: 36px; flex-shrink: 0; border-radius: 50%; background: var(--color-navy); color: var(--color-white);
    display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px;
  }
  h1 { margin: 0; font-size: 22px; line-height: 1.2; font-weight: 700; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .count {
    display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px; border-radius: 999px; flex-shrink: 0;
    background: var(--color-blue-100); font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums;
  }
  .current[aria-expanded="true"] .count { background: var(--color-white); }
  .current :global(.chevron), .me :global(.chevron) { flex-shrink: 0; color: var(--color-blue-500); transition: transform var(--dur) var(--ease-out); }
  .current[aria-expanded="true"] :global(.chevron), .me[aria-expanded="true"] :global(.chevron) { transform: rotate(180deg); }

  /* the elevator panel as a dropdown */
  .elevator {
    position: absolute; left: 0; top: calc(100% + 6px); width: 300px; max-height: calc(100vh - 120px); overflow-y: auto;
    border-radius: var(--radius-md); padding: 12px; background: var(--gradient-elevator); color: var(--color-white);
    display: flex; flex-direction: column; gap: 6px; box-shadow: 0 10px 28px rgb(0 56 105 / 0.35);
    transform-origin: top left; animation: drop 160ms var(--ease-out) both;
  }
  @keyframes drop { from { opacity: 0; transform: translateY(-6px) scale(0.98); } to { opacity: 1; transform: none; } }
  .elevator-head { display: flex; align-items: center; gap: 10px; padding: 2px 6px 8px; border-bottom: 1px solid rgb(255 255 255 / 0.2); font-size: 15px; font-weight: 700; }
  .elevator-icon { display: inline-flex; color: var(--color-sky); }
  .floor {
    display: flex; align-items: center; gap: 12px; width: 100%; min-height: 48px; padding: 4px 10px; border: 0; flex-shrink: 0;
    border-radius: var(--radius-md); background: transparent; color: var(--color-white); text-align: left; cursor: pointer;
    transition: background var(--dur) var(--ease-out);
  }
  .floor:hover { background: rgb(255 255 255 / 0.08); }
  .floor.active, .floor.active:hover { background: var(--color-white); color: var(--color-navy); }
  .floor.blocked { opacity: 0.55; cursor: not-allowed; }
  .floor.blocked:hover { background: transparent; }
  .fbadge {
    width: 40px; height: 40px; flex-shrink: 0; border: 2px solid rgb(255 255 255 / 0.6); border-radius: 50%;
    display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px;
  }
  /* own floor: the yellow ring of the own avatar */
  .floor.mine .fbadge { box-shadow: 0 0 0 2px var(--color-accent); }
  .floor.active .fbadge { border-color: var(--color-navy); background: var(--color-navy); color: var(--color-white); }
  .ftext { min-width: 0; }
  .name { font-size: 15px; font-weight: 700; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { font-size: 13px; color: var(--color-blue-100); display: flex; align-items: center; gap: 4px; white-space: nowrap; }
  .floor.active .sub { color: var(--color-blue-700); }
  .entrance { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; padding: 10px 6px 2px; border-top: 1px solid rgb(255 255 255 / 0.2); }
  .entrance-head { font-size: 13px; font-weight: 700; color: var(--color-blue-100); }
  .entrance-people { display: flex; flex-wrap: wrap; gap: 4px; }
  .entrance-people :global(.person) { width: 48px; }

  /* the building: server name and everyone online */
  .center { display: flex; align-items: center; gap: 10px; white-space: nowrap; }
  .building { font-size: 15px; font-weight: 700; }
  .online {
    display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 999px;
    background: var(--color-blue-100); color: var(--color-navy); font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums;
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-sky); box-shadow: 0 0 0 3px rgb(255 255 255 / 0.7); }

  .tool {
    width: 40px; height: 40px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-white);
    display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--color-navy); flex-shrink: 0;
    transition: background var(--dur) var(--ease-out);
  }
  .tool:hover { background: var(--color-blue-100); }
  .tool[aria-pressed="true"] { background: var(--color-navy); border-color: var(--color-navy); color: var(--color-white); }
  .tool:disabled { opacity: 0.5; cursor: not-allowed; }
  .tool:disabled:hover { background: var(--color-white); }

  .me {
    display: flex; align-items: center; gap: 10px; height: 48px; padding: 0 8px 0 6px; margin-left: 4px; border: 0; border-radius: var(--radius-md);
    background: transparent; color: var(--color-navy); cursor: pointer; transition: background var(--dur) var(--ease-out);
  }
  .me:hover, .me[aria-expanded="true"] { background: var(--color-blue-100); }
  .av-me {
    width: 36px; height: 36px; flex-shrink: 0; border-radius: 50%; background: var(--color-navy); color: var(--color-white);
    box-shadow: 0 0 0 3px var(--color-accent); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; overflow: hidden;
  }
  .av-me img { width: 100%; height: 100%; object-fit: cover; }
  .me-name { font-size: 15px; font-weight: 700; white-space: nowrap; }
  .menu {
    position: absolute; right: 0; top: calc(100% + 6px); min-width: 260px; display: flex; flex-direction: column; gap: 2px; padding: 6px;
    border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-white); box-shadow: 0 10px 28px rgb(0 56 105 / 0.2);
    transform-origin: top right; animation: drop 160ms var(--ease-out) both;
  }
  .me-row { display: flex; flex-direction: column; padding: 8px 10px 10px; margin-bottom: 4px; border-bottom: 1px solid var(--color-blue-100); }
  .me-row .n { font-size: 15px; font-weight: 700; }
  .me-row .l { font-size: 13px; color: var(--color-blue-700); }
  .item {
    display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 10px; border: 0; border-radius: var(--radius-md);
    background: none; color: var(--color-navy); font-size: 14px; text-align: left; cursor: pointer;
  }
  .item:hover { background: var(--color-blue-100); }
  .item:disabled { opacity: 0.5; cursor: not-allowed; }
  .item:disabled:hover { background: none; }
  .versions { display: flex; justify-content: space-between; gap: 12px; padding: 10px 10px 4px; margin-top: 4px; border-top: 1px solid var(--color-blue-100); font-size: 12px; color: var(--color-blue-700); }
</style>
