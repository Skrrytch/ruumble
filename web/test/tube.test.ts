// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { TUBE_LIMITS, type Parcel, type ParcelOffer, type ParcelState, type Snapshot } from "@ruumble/protocol";
import type { MumbleAdapter } from "../src/lib/adapter/types.ts";
import {
  candidates, fileProblem, incoming, isExecutable, merge, mine, newParcelId, outgoing, roomChoices, sendingProgress, stillNeeded, stillOpen,
  togglePerson, toggleRoom, typeLabel, waiting, waitingCount, without, withoutRuumble, type Parcels,
} from "../src/lib/tube/model.ts";
import { TubeState, tubeErrorText } from "../src/lib/tube/state.svelte.ts";

const ME = "0000000000000001", ANNA = "00000000000000aa", BEN = "00000000000000bb";
const ID = "0123456789abcdef0123456789abcdef";

function parcel(o: Partial<Parcel> & { states?: [string, ParcelState, number?][] } = {}): Parcel {
  const { states = [[ME, "offered"]], ...rest } = o;
  return {
    id: ID, from: ANNA, fromName: "Anna", name: "report.pdf", type: "application/pdf", size: 100, note: "", at: 1, until: 2, holder: true, ended: null,
    recipients: states.map(([person, state, sent = 0]) => ({ person, name: person === ME ? "Me" : "Ben", state, sent })),
    ...rest,
  };
}

describe("tube mail: the parcels of the own person (ADR-0022)", () => {
  it("sorts sent and received, newest first, and counts those waiting for an answer", () => {
    const old = parcel({ id: "a".repeat(32), at: 1 });
    const fresh = parcel({ id: "b".repeat(32), at: 5, states: [[ME, "failed"]] });
    const answered = parcel({ id: "c".repeat(32), at: 3, states: [[ME, "received"]] });
    const own = parcel({ id: "d".repeat(32), from: ME, states: [[ANNA, "offered"]] });
    let p: Parcels = {};
    for (const x of [old, fresh, answered, own]) p = merge(p, x);
    expect(incoming(p, ME).map((x) => x.id)).toEqual([fresh.id, answered.id, old.id]);
    expect(outgoing(p, ME)).toEqual([own]);
    expect(waitingCount(p, ME)).toBe(2);
    expect(waiting({ ...old, ended: "withdrawn" }, ME)).toBe(false);
    expect(mine(own, ME)).toBeNull();
    expect(Object.keys(without(p, old.id))).toHaveLength(3);
  });

  it("progress of own parcels over everyone who did not decline; none open: null", () => {
    const p = parcel({ from: ME, states: [[ANNA, "receiving", 50], [BEN, "received"], ["00000000000000cc", "declined"]] });
    expect(sendingProgress({ [p.id]: p }, ME)).toBe(0.75);
    expect(sendingProgress({ [p.id]: { ...p, ended: "done" } }, ME)).toBeNull();
    const declined = parcel({ from: ME, states: [[ANNA, "declined"]] });
    expect(sendingProgress({ [p.id]: declined }, ME)).toBe(0);
    expect(stillOpen(p)).toEqual([ANNA]);
    expect(stillNeeded({ [p.id]: p }, [p.id])).toBe(true);
    expect(stillNeeded({ [p.id]: { ...p, ended: "done" } }, [p.id, "x"])).toBe(false);
  });

  it("names the type, warns about programs, checks the size", () => {
    expect(typeLabel("report.pdf", "application/pdf")).toBe("PDF");
    expect(typeLabel("README", "text/plain")).toBe("PLAIN");
    expect(typeLabel("archive.reallylongext", "")).toBe("");
    expect(typeLabel(".hidden", "application/vnd.openxmlformats-officedocument")).toBe("");
    expect(isExecutable("Setup.EXE")).toBe(true);
    expect(isExecutable("install.sh")).toBe(true);
    expect(isExecutable("notes.txt")).toBe(false);
    expect(fileProblem(0)).toBe("empty");
    expect(fileProblem(TUBE_LIMITS.fileBytes + 1)).toBe("too-large");
    expect(fileProblem(1)).toBeNull();
    expect(newParcelId((b) => b.fill(171))).toBe("ab".repeat(16));
    expect(newParcelId()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("the send dialog: people with Ruumble, rooms as a quick choice with the own room first, those without Ruumble apart", () => {
    const snapshot = {
      self: { session: 1 },
      channels: [{ id: 1, name: "Kitchen" }, { id: 2, name: "Lab" }],
      users: [
        { session: 1, name: "Me", channel: 2, person: ME },
        { session: 2, name: "Ben", channel: 1, person: BEN },
        { session: 3, name: "Anna", channel: 2, person: ANNA },
        { session: 4, name: "Dave", channel: 1 },
        { session: 5, name: "Cleo", channel: 9, person: "00000000000000cc" },
      ],
    } as unknown as Snapshot;
    const list = candidates(snapshot, ME);
    expect(list.map((c) => `${c.name}@${c.place}`)).toEqual(["Anna@Lab", "Ben@Kitchen", "Cleo@"]);
    expect(candidates(null, ME)).toEqual([]);
    expect(withoutRuumble(snapshot)).toEqual(["Dave"]);
    expect(withoutRuumble(null)).toEqual([]);
    const rooms = roomChoices(list, 2);
    expect(rooms.map((r) => r.name)).toEqual(["Lab", "", "Kitchen"]);
    let picked = toggleRoom([BEN], rooms[0]!);
    expect(picked).toEqual([BEN, ANNA]);
    picked = toggleRoom(picked, rooms[0]!);
    expect(picked).toEqual([BEN]);
    expect(togglePerson(togglePerson([], ANNA), BEN)).toEqual([ANNA, BEN]);
    expect(togglePerson([ANNA, BEN], ANNA)).toEqual([BEN]);
  });
});

describe("tube mail in the web UI (state)", () => {
  /** a service that offers whatever comes, records pieces and held parcels, and answers accept with a ticket */
  function setup(o: { fail?: Parameters<typeof tubeErrorText>[0]; pieceFails?: boolean } = {}) {
    const offers: ParcelOffer[] = [];
    const pieces: { id: string; to: string; offset: number; size: number }[] = [];
    const held: string[][] = [];
    const notices: string[] = [];
    const downloads: [string, string][] = [];
    const adapter = {
      tube: {
        offer: async (offer: ParcelOffer) => {
          offers.push(offer);
          if (o.fail) return { ok: false as const, error: o.fail };
          return { ok: true as const, value: parcel({ id: offer.id, from: ME, name: offer.name, size: offer.size, states: offer.to.map((p) => [p, "offered"] as [string, ParcelState]) }) };
        },
        accept: async () => (o.fail ? { ok: false as const, error: o.fail } : { ok: true as const, value: "t".repeat(32) }),
        decline: async () => ({ ok: true as const, value: true as const }),
        withdraw: async () => (o.fail ? { ok: false as const, error: o.fail } : { ok: true as const, value: true as const }),
        piece: async (id: string, to: string, offset: number, bytes: Blob) => {
          pieces.push({ id, to, offset, size: bytes.size });
          return o.pieceFails ? { ok: false as const, error: "not-found" as const } : { ok: true as const, value: true as const };
        },
        held: (ids: string[]) => held.push(ids),
        downloadUrl: (ticket: string) => `/dl/${ticket}`,
      },
    } as unknown as MumbleAdapter;
    const tube = new TubeState(adapter, { notice: (t) => notices.push(t), download: (url, name) => downloads.push([url, name]) });
    tube.identify(ME);
    return { tube, offers, pieces, held, notices, downloads };
  }

  const file = (size: number, name = "big.bin") => new File([new Uint8Array(size)], name, { type: "application/octet-stream" });

  it("send: the offer goes out, the tab holds the file, sends it piece by piece when asked, and lets go when it ends", async () => {
    const { tube, offers, pieces, held } = setup();
    tube.compose(null, [ANNA]);
    expect(await tube.send()).toBe(false); // no file yet
    tube.setFile(file(TUBE_LIMITS.pieceBytes + 10));
    tube.setRecipients([ANNA, BEN]);
    tube.setNote("  for you  ");
    expect(await tube.send()).toBe(true);
    const id = offers[0]!.id;
    expect(offers[0]).toMatchObject({ to: [ANNA, BEN], name: "big.bin", size: TUBE_LIMITS.pieceBytes + 10, note: "for you" });
    expect(held.at(-1)).toEqual([id]);
    expect(tube.draft).toBeNull();
    expect(tube.panel).toBe(true);
    expect(tube.outgoing).toHaveLength(1);
    expect(tube.progress).toBe(0);
    await tube.pull(id, ANNA, 0);
    expect(pieces).toEqual([{ id, to: ANNA, offset: 0, size: TUBE_LIMITS.pieceBytes }, { id, to: ANNA, offset: TUBE_LIMITS.pieceBytes, size: 10 }]);
    await tube.pull("f".repeat(32), ANNA, 0); // not held here
    expect(pieces).toHaveLength(2);
    tube.receive({ ...tube.parcels[id]!, ended: "done" });
    expect(held.at(-1)).toEqual([]);
    tube.dismiss(id);
    expect(tube.outgoing).toEqual([]);
  });

  it("a broken piece stops the upload; a file too large or empty is refused; a refused offer keeps nothing", async () => {
    const { tube, pieces, notices } = setup({ pieceFails: true });
    tube.compose(file(0));
    expect(notices.at(-1)).toBe("The file is empty.");
    tube.setFile(file(3));
    tube.setRecipients([ANNA]);
    await tube.send();
    await tube.pull(Object.keys(tube.parcels)[0]!, ANNA, 0);
    expect(pieces).toHaveLength(1);
    const refused = setup({ fail: "rate-limited" });
    refused.tube.compose(file(3), [ANNA]);
    expect(await refused.tube.send()).toBe(false);
    expect(refused.notices).toEqual(["Too much tube mail in a short time – please wait a moment."]);
    expect(refused.held).toEqual([]);
    expect(await refused.tube.withdraw(ID)).toBe(false);
  });

  it("received: a notice for a new one, accept starts the download, decline and later put it away", async () => {
    const { tube, downloads } = setup();
    tube.receive(parcel());
    expect(tube.toast).toBe(ID);
    expect(tube.waiting).toBe(1);
    tube.later();
    expect(tube.toast).toBeNull();
    expect(await tube.accept(ID)).toBe(true);
    expect(downloads).toEqual([[`/dl/${"t".repeat(32)}`, "report.pdf"]]);
    tube.receive(parcel({ states: [[ME, "received", 100]] }));
    expect(tube.waiting).toBe(0);
    tube.dismiss(ID);
    expect(tube.incoming).toEqual([]);
    tube.receive(parcel({ id: "e".repeat(32) }));
    expect(tube.toast).toBe("e".repeat(32));
    tube.receive(parcel({ id: "e".repeat(32), states: [[ME, "declined"]] }));
    expect(tube.toast).toBeNull(); // answered in another tab
    tube.receive(parcel({ id: "9".repeat(32) }));
    expect(await tube.decline("9".repeat(32))).toBe(true);
    expect(tube.toast).toBeNull();
    tube.dismiss("9".repeat(32)); // still open: stays
    expect(tube.incoming.map((p) => p.id)).toContain("9".repeat(32));
    const failing = setup({ fail: "sender-away" });
    failing.tube.receive(parcel());
    expect(await failing.tube.accept(ID)).toBe(false);
    expect(failing.notices).toEqual(["The sender cannot be reached right now – try again in a moment."]);
  });

  it("after a restart of the service: offered again to whoever has not got it, the rest let go", async () => {
    const { tube, offers, held } = setup();
    tube.compose(file(5), [ANNA, BEN]);
    await tube.send();
    const id = offers[0]!.id;
    tube.receive(parcel({ id, from: ME, size: 5, states: [[ANNA, "received", 5], [BEN, "offered"]] }));
    await tube.missing([id, "f".repeat(32)]);
    expect(offers[1]).toMatchObject({ id, to: [BEN], again: true });
    tube.receive(parcel({ id, from: ME, size: 5, states: [[ANNA, "received", 5], [BEN, "declined"]] }));
    await tube.missing([id]);
    expect(held.at(-1)).toEqual([]);
    tube.forgetAll();
    expect(tube.parcels).toEqual({});
    expect(tube.me).toBeNull();
  });

  it("names every error", () => {
    for (const e of ["rate-limited", "not-found", "sender-away", "invalid", "not-paired", "offline", "forbidden"] as const) expect(tubeErrorText(e)).toBeTruthy();
  });
});
