<script lang="ts">
  import MessageSquareText from "@lucide/svelte/icons/message-square-text";
  import Search from "@lucide/svelte/icons/search";
  import { t } from "../../i18n/index.svelte.ts";
  import type { Floor } from "../../model/building.ts";
  import { filterDirectory, firstReachable, type DirectoryEntry, type DirectoryGroup } from "../../model/overview.ts";
  import { personLabel } from "../../status.ts";

  // The directory board in the lobby ("Haustafel", ADR-0019): a dark plate like the floor sign, per floor its badge,
  // name and the people with their room and status; a search over all of it. A person is a button to go to them,
  // a floor heading shows that floor; Enter in the search goes to the first match.
  let {
    groups,
    floors,
    highlight,
    onhover,
    onvisit,
    onfloor,
  }: {
    groups: DirectoryGroup[];
    floors: Floor[];
    highlight: number | null;
    onhover: (session: number | null) => void;
    onvisit: (entry: DirectoryEntry) => void;
    onfloor: (floor: Floor) => void;
  } = $props();

  let query = $state("");
  const shown = $derived(filterDirectory(groups, query));
  const floorOf = (g: DirectoryGroup) => (g.kind === "floor" ? floors.find((f) => f.channelId === g.channelId) : undefined);

  function onkeydown(e: KeyboardEvent): void {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const first = firstReachable(shown);
    if (first) onvisit(first);
  }
</script>

<section class="board" aria-labelledby="directory-title">
  <h3 id="directory-title" class="plate-title">{t().overview.directory}</h3>
  <label class="search">
    <Search size={15} aria-hidden="true" />
    <input type="search" bind:value={query} placeholder={t().overview.search} aria-label={t().overview.searchLabel} autocomplete="off" {onkeydown} />
  </label>
  <div class="list">
    {#each shown as g (g.kind + (g.channelId ?? ""))}
      {@const floor = floorOf(g)}
      <div class="group" class:mine={g.isSelf}>
        <div class="group-head">
          {#if g.badge}<span class="gbadge">{g.badge}</span>{/if}
          {#if floor && !(g.locked && !g.isSelf)}
            <button type="button" class="gname link" title={t().overview.viewFloor(g.name)} onclick={() => onfloor(floor)}>{g.name}</button>
          {:else}
            <span class="gname">{g.name}</span>
          {/if}
          {#if g.locked}<span class="tag">{t().overview.locked}</span>{/if}
          <span class="gcount">{g.people.length || ""}</span>
        </div>
        {#if g.people.length}
          <ul>
            {#each g.people as p (p.user.session)}
              <li>
                <button
                  type="button" class="person" class:me={p.user.isSelf} class:highlight={highlight === p.user.session} aria-disabled={!p.canGo || undefined}
                  aria-label={p.canGo ? t().overview.goTo(p.user.name, p.place) : `${personLabel(p.user)} – ${p.place}`}
                  title={p.blocked ? t().overview.blocked[p.blocked] : t().overview.goTo(p.user.name, p.place)}
                  onmouseenter={() => onhover(p.user.session)} onmouseleave={() => onhover(null)} onfocus={() => onhover(p.user.session)} onblur={() => onhover(null)}
                  onclick={() => p.canGo && onvisit(p)}
                >
                  <span class="line">
                    <span class="pname">{p.user.isSelf ? `${p.user.name} (${t().people.you})` : p.user.name}</span>
                    <span class="place">{p.place}</span>
                  </span>
                  {#if p.user.status}
                    <span class="pstatus"><MessageSquareText size={11} aria-hidden="true" />{p.user.status.text}</span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {:else}
      <p class="none">{t().overview.none}</p>
    {/each}
  </div>
  <p class="hint">{t().overview.hint}</p>
</section>

<style>
  /* a dark plate with a screw in every corner, like the floor sign in the top bar */
  .board {
    --screw: radial-gradient(circle, rgb(255 255 255 / 0.45) 1.6px, transparent 2.2px);
    display: flex; flex-direction: column; gap: 10px; min-height: 0; padding: 14px 14px 10px; border-radius: 6px; color: var(--color-white);
    background-image: var(--screw), var(--screw), var(--screw), var(--screw), var(--gradient-elevator);
    background-size: 10px 10px, 10px 10px, 10px 10px, 10px 10px, 100% 100%;
    background-position: 3px 3px, calc(100% - 3px) 3px, 3px calc(100% - 3px), calc(100% - 3px) calc(100% - 3px), 0 0;
    background-repeat: no-repeat; box-shadow: 0 2px 0 rgb(0 30 60 / 0.35), 0 4px 10px rgb(0 56 105 / 0.18);
  }
  .plate-title { margin: 0 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-blue-100); }
  .search { display: flex; align-items: center; gap: 6px; height: 36px; padding: 0 10px; border-radius: 4px; background: var(--color-white); color: var(--color-blue-700); }
  .search:focus-within { outline: 3px solid var(--color-sky); outline-offset: 1px; }
  .search input { flex: 1; min-width: 0; border: 0; outline: 0; font: inherit; font-size: 13px; color: var(--color-navy); background: transparent; }
  .list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding-right: 2px; }
  .group-head { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-bottom: 1px solid rgb(255 255 255 / 0.2); }
  .gbadge { width: 24px; height: 24px; flex: none; border-radius: 50%; border: 2px solid rgb(255 255 255 / 0.7); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; }
  .group.mine .gbadge { box-shadow: 0 0 0 2px var(--color-accent); }
  .gname { font-size: 14px; font-weight: 700; color: var(--color-white); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .link { border: 0; padding: 0; background: none; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; text-align: left; }
  .link:hover { text-decoration: underline; }
  .link:focus-visible, .person:focus-visible { outline: 3px solid var(--color-sky); outline-offset: 1px; }
  .tag { font-size: 11px; color: var(--color-blue-100); }
  .gcount { margin-left: auto; font-size: 12px; font-weight: 700; color: var(--color-blue-100); font-variant-numeric: tabular-nums; }
  ul { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 1px; }
  .person {
    width: 100%; display: flex; flex-direction: column; gap: 1px; padding: 4px 8px 4px 38px; border: 0; border-radius: 4px; background: transparent;
    color: var(--color-white); font: inherit; text-align: left; cursor: pointer;
  }
  .person:hover:not([aria-disabled]), .person.highlight { background: rgb(255 255 255 / 0.12); }
  .person[aria-disabled] { cursor: default; }
  .line { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
  .pname { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .place { margin-left: auto; flex: none; max-width: 50%; font-size: 12px; color: var(--color-blue-100); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pstatus { display: flex; align-items: center; gap: 5px; font-size: 12px; font-style: italic; color: var(--color-blue-100); overflow-wrap: anywhere; }
  .none { margin: 8px 6px; font-size: 13px; color: var(--color-blue-100); }
  .hint { margin: 0 6px; font-size: 11px; color: var(--color-blue-100); }
</style>
