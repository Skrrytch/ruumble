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
  import { countText, initials, ownPlace, type Building, type Floor } from "../model/building.ts";
  import type { RuumbleState } from "../state.svelte.ts";
  import Avatar from "./Avatar.svelte";
  import Key from "./Key.svelte";
  import Plant from "./Plant.svelte";
  import Wrench from "./Wrench.svelte";

  // Top bar instead of the elevator column, made of signs: left the floor sign (opens the elevator, which shows
  // the server and everyone online in its status bar), in the middle the sign of the own room, right mute,
  // deafen and the name badge (opens the user menu).
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
  const place = $derived(app.snapshot ? ownPlace(building, app.snapshot) : null);
  // viewing another floor: the room sign leads back
  const away = $derived(!!myFloor && floor?.channelId !== myFloor.channelId);
  // the plant at the entrance is a button for whoever may tend the whole building (ADR-0014)
  const tendBuilding = $derived(building.canTendBuilding && !app.readonly);

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
      <!-- the floor sign: a plate with the floor and its people, the elevator buttons on the right -->
      <button
        type="button" class="sign floor-sign" bind:this={floorsButton} aria-expanded={open === "floors"} aria-controls="elevator"
        aria-label={floor ? t().core.currentFloor(floor.level, floor.name, floor.population) : t().core.elevator}
        title={t().core.chooseFloor} onclick={() => toggle("floors")}
      >
        <span class="badge" aria-hidden="true">{#if floor}{floor.badge}{:else}<ArrowDownUp size={16} />{/if}</span>
        <span class="plate-text">
          {#if floor}<span class="caption" aria-hidden="true">{floor.level}</span>{/if}
          <span class="plate-name">
            <h1>{floor?.name ?? t().screens.vacancyTitle}</h1>
            {#if floor}<span class="people" title={t().header.onFloorTitle} aria-hidden="true"><Users size={15} />{floor.population}</span>{/if}
          </span>
        </span>
        <span class="call" aria-hidden="true"><ChevronDown size={18} class="chevron" /></span>
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
                <span class="fname"><span class="name">{f.name}</span><span class="fpeople" aria-hidden="true"><Users size={13} />{f.population}</span></span>
                {#if f.lock}<span class="sub"><Lock size={11} /> {t().core.lockedShort} · {lockHint[f.lock]}</span>{/if}
              </span>
            </button>
          {/each}
          {#if building.entrance.length > 0 || tendBuilding}
            <section class="entrance" aria-label={t().common.entrance}>
              <div class="entrance-head">
                <span>{t().common.entrance} · {countText(building.entrance.length)}</span>
                <span class="fixtures">
                  <!-- the wrench: building maintenance, settings and everyone's keys, for admins (ADR-0016) -->
                  {#if tendBuilding}
                    <button type="button" class="plant tend" aria-label={t().maintenance.title} title={t().maintenance.title} onclick={() => { open = null; void app.openMaintenance(); }}><Wrench size={28} /></button>
                  {/if}
                  <!-- the plant at the entrance: building care (ADR-0014) -->
                  {#if tendBuilding}
                    <button type="button" class="plant tend" aria-label={t().care.buildingPlant} title={t().care.buildingPlant} onclick={() => { open = null; void app.openCare({ kind: "building" }); }}><Plant size={26} /></button>
                  {:else}
                    <span class="plant"><Plant size={26} /></span>
                  {/if}
                </span>
              </div>
              {#if building.entrance.length > 0}
                <div class="entrance-people">
                  {#each building.entrance as user (user.session)}
                    <Avatar {user} talking={app.talking[user.session] ?? false} showName={false} />
                  {/each}
                </div>
              {/if}
            </section>
          {/if}
          <!-- status bar of the elevator: the whole building -->
          <footer class="status" title={t().header.onlineTitle}>
            <span class="online"><span class="dot" aria-hidden="true"></span>{t().header.online(building.online)}</span>
            <span class="building">{building.name}</span>
          </footer>
        </nav>
      {/if}
    </div>
    {#if app.readonly}<span class="note">{t().header.preview}</span>{/if}
    {#if hidden}<span class="note">{t().common.notShown}</span>{/if}
  </div>

  <!-- the sign of the own room; from another floor it leads back -->
  <div class="center">
    {#if place}
      {@const label = t().core.ownPlace(place.name, countText(place.people))}
      {#if away}
        <button type="button" class="sign room-sign" aria-label={`${label} – ${t().core.home}`} title={t().core.home} onclick={() => app.goHome()}>
          <span class="caption">{t().core.youAreHere}</span>
          <span class="plate-name"><span class="room-name">{place.name}</span><LocateFixed size={15} class="back" /></span>
        </button>
      {:else}
        <div class="sign room-sign" role="status" aria-label={label}>
          <span class="caption">{t().core.youAreHere}</span>
          <span class="plate-name"><span class="room-name">{place.name}</span></span>
        </div>
      {/if}
    {/if}
  </div>

  <div class="right">
    <button type="button" class="tool" aria-pressed={muted} aria-label={t().core.mute} title={t().core.mute} disabled={!me} onclick={() => app.toggleMute()}>
      {#if muted}<MicOff size={20} />{:else}<Mic size={20} />{/if}
    </button>
    <button type="button" class="tool" aria-pressed={deaf} aria-label={t().core.deaf} title={t().core.deaf} disabled={!me} onclick={() => app.toggleDeaf()}>
      {#if deaf}<HeadphoneOff size={20} />{:else}<Headphones size={20} />{/if}
    </button>
    <div class="dropdown" data-dropdown="user">
      <!-- the name badge: yellow band like the ring around the own avatar, on a clip -->
      <button type="button" class="me" bind:this={userButton} aria-expanded={open === "user"} aria-controls="user-menu" aria-label={t().core.userMenu} title={t().core.userMenu} onclick={() => toggle("user")}>
        <span class="av-me" aria-hidden="true">
          {#if me && myAvatar && avatarBroken !== myAvatar}<img src={myAvatar} alt="" onerror={() => (avatarBroken = myAvatar)} />{:else if me}{initials(me.name)}{:else}<UserIcon size={18} />{/if}
        </span>
        <span class="me-text"><span class="caption">{t().core.nameTag}</span><span class="me-name">{me?.name ?? t().header.preview}</span></span>
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
          <!-- my keys: the own paired browsers (ADR-0015) -->
          <button type="button" class="item" disabled={!me} onclick={() => { open = null; void app.openKeys(); }}>
            <span class="key-icon" aria-hidden="true"><Key size={18} /></span>{t().keys.myKeys}
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
  .topbar { position: relative; z-index: 5; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; min-height: var(--topbar-height); }
  .left, .right { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .right { justify-self: end; }
  .dropdown { position: relative; min-width: 0; }
  .note { font-size: 13px; font-weight: 700; color: var(--color-blue-500); white-space: nowrap; }
  .caption { display: block; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; line-height: 1.2; }
  .plate-name { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
  .people { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .sign:focus-visible, .me:focus-visible, .tool:focus-visible, .item:focus-visible, .floor:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 2px; }

  /* signs: plates with a screw in every corner */
  .sign {
    position: relative; border-radius: 6px; text-align: left; font: inherit;
    --screw: radial-gradient(circle, var(--screw-color) 1.6px, transparent 2.2px);
    background-image: var(--screw), var(--screw), var(--screw), var(--screw), var(--plate);
    background-size: 10px 10px, 10px 10px, 10px 10px, 10px 10px, 100% 100%;
    background-position: 2px 2px, calc(100% - 2px) 2px, 2px calc(100% - 2px), calc(100% - 2px) calc(100% - 2px), 0 0;
    background-repeat: no-repeat;
  }

  /* floor sign: dark like the elevator panel; on the right the elevator buttons make the action obvious */
  .floor-sign {
    --plate: var(--gradient-elevator); --screw-color: rgb(255 255 255 / 0.45);
    display: flex; align-items: center; gap: 12px; max-width: 100%; min-height: 56px; padding: 6px 6px 6px 12px; border: 0;
    color: var(--color-white); cursor: pointer; box-shadow: 0 2px 0 rgb(0 30 60 / 0.35), 0 4px 10px rgb(0 56 105 / 0.18);
    transition: transform var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out);
  }
  .floor-sign:hover { transform: translateY(-1px); box-shadow: 0 3px 0 rgb(0 30 60 / 0.35), 0 6px 14px rgb(0 56 105 / 0.25); }
  .floor-sign[aria-expanded="true"] { transform: translateY(1px); box-shadow: 0 1px 0 rgb(0 30 60 / 0.35); }
  .badge {
    width: 38px; height: 38px; flex-shrink: 0; border-radius: 50%; border: 2px solid rgb(255 255 255 / 0.7);
    display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 15px;
  }
  .plate-text { min-width: 0; }
  .floor-sign .caption { color: var(--color-blue-100); }
  h1 { margin: 0; font-size: 20px; line-height: 1.2; font-weight: 700; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .floor-sign .people { color: var(--color-blue-100); }
  .call {
    display: flex; align-items: center; justify-content: center; width: 28px; height: 44px; margin-left: 2px; flex-shrink: 0;
    border-radius: var(--radius-md); background: rgb(255 255 255 / 0.14); color: var(--color-white);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.25);
  }
  .floor-sign:hover .call { background: rgb(255 255 255 / 0.22); }
  .call :global(.chevron), .me :global(.chevron) { flex-shrink: 0; transition: transform var(--dur) var(--ease-out); }
  .floor-sign[aria-expanded="true"] :global(.chevron), .me[aria-expanded="true"] :global(.chevron) { transform: rotate(180deg); }

  /* the elevator panel as a dropdown */
  .elevator {
    position: absolute; left: 0; top: calc(100% + 8px); width: 320px; max-height: calc(100vh - 120px); overflow-y: auto;
    border-radius: var(--radius-md); padding: 12px 12px 0; background: var(--gradient-elevator); color: var(--color-white);
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
  .fname { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
  .name { font-size: 15px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fpeople { display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0; font-size: 13px; font-weight: 700; color: var(--color-blue-100); font-variant-numeric: tabular-nums; }
  .floor.active .fpeople { color: var(--color-blue-700); }
  .sub { font-size: 12px; color: var(--color-blue-100); display: flex; align-items: center; gap: 4px; white-space: nowrap; }
  .floor.active .sub { color: var(--color-blue-700); }
  .entrance { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; padding: 10px 6px 2px; border-top: 1px solid rgb(255 255 255 / 0.2); }
  .entrance-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 36px; font-size: 13px; font-weight: 700; color: var(--color-blue-100); }
  .key-icon { display: inline-flex; }
  .fixtures { display: flex; align-items: flex-end; gap: 2px; }
  .plant { display: inline-flex; align-items: flex-end; justify-content: center; min-width: 40px; min-height: 40px; padding: 2px; border: 0; background: transparent; border-radius: var(--radius-md); }
  .plant.tend { cursor: pointer; transition: transform var(--dur) var(--ease-out); }
  .plant.tend:hover { transform: translateY(-2px) rotate(3deg) scale(1.08); }
  .plant.tend:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 0; }
  .entrance-people { display: flex; flex-wrap: wrap; gap: 4px; }
  .entrance-people :global(.person) { width: 48px; }
  /* status bar at the bottom of the elevator, like the display in a lift */
  .status {
    position: sticky; bottom: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px;
    margin: 6px -12px 0; padding: 10px 18px; background: rgb(0 20 45 / 0.45); border-top: 1px solid rgb(255 255 255 / 0.15);
    font-size: 13px; font-weight: 700; white-space: nowrap;
  }
  .online { display: inline-flex; align-items: center; gap: 8px; font-variant-numeric: tabular-nums; }
  .building { color: var(--color-blue-100); overflow: hidden; text-overflow: ellipsis; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-sky); box-shadow: 0 0 0 3px rgb(90 166 231 / 0.25); }

  /* room sign: light blue like the own room, a door plate */
  .center { display: flex; justify-content: center; min-width: 0; }
  .room-sign {
    --plate: linear-gradient(var(--color-blue-100), var(--color-blue-100)); --screw-color: var(--color-blue-500);
    display: flex; flex-direction: column; justify-content: center; min-height: 52px; max-width: 360px; padding: 5px 22px;
    border: 2px solid var(--color-navy); color: var(--color-navy); box-shadow: 0 2px 0 rgb(0 56 105 / 0.2);
  }
  .room-sign .caption { color: var(--color-blue-700); }
  .room-name { font-size: 17px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  button.room-sign { cursor: pointer; transition: transform var(--dur) var(--ease-out); }
  button.room-sign:hover { transform: translateY(-1px); }
  .room-sign :global(.back) { flex-shrink: 0; align-self: center; color: var(--color-blue-500); }

  .tool {
    width: 40px; height: 40px; border: 1px solid var(--color-blue-300); border-radius: var(--radius-md); background: var(--color-white);
    display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--color-navy); flex-shrink: 0;
    transition: background var(--dur) var(--ease-out);
  }
  .tool:hover { background: var(--color-blue-100); }
  .tool[aria-pressed="true"] { background: var(--color-navy); border-color: var(--color-navy); color: var(--color-white); }
  .tool:disabled { opacity: 0.5; cursor: not-allowed; }
  .tool:disabled:hover { background: var(--color-white); }

  /* name badge: white card with a yellow band, hanging on a clip */
  .me {
    position: relative; display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 9px 10px 5px 8px; margin: 6px 0 0 6px;
    border: 1px solid var(--color-blue-300); border-top: 5px solid var(--color-accent); border-radius: 6px;
    background: var(--color-white); color: var(--color-navy); cursor: pointer; text-align: left;
    box-shadow: 0 2px 0 rgb(0 56 105 / 0.15), 0 4px 10px rgb(0 56 105 / 0.12);
    transition: transform var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out);
  }
  .me::before {
    content: ""; position: absolute; top: -11px; left: 50%; width: 22px; height: 8px; margin-left: -11px;
    border-radius: 3px 3px 1px 1px; background: var(--color-blue-300); box-shadow: inset 0 -2px 0 rgb(0 56 105 / 0.2);
  }
  .me:hover { transform: rotate(-1deg) translateY(-1px); }
  .me[aria-expanded="true"] { background: var(--color-surface); }
  .me :global(.chevron) { color: var(--color-blue-500); }
  .av-me {
    width: 34px; height: 34px; flex-shrink: 0; border-radius: 50%; background: var(--color-navy); color: var(--color-white);
    box-shadow: 0 0 0 2px var(--color-accent); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; overflow: hidden;
  }
  .av-me img { width: 100%; height: 100%; object-fit: cover; }
  .me-text { min-width: 0; }
  .me .caption { color: var(--color-blue-500); }
  .me-name { display: block; font-size: 15px; font-weight: 700; white-space: nowrap; }
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
