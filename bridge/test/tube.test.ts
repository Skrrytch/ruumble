import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TUBE_LIMITS, type BridgeToPlugin, type BridgeToUi, type Parcel } from "@ruumble/protocol";
import { Gate } from "../src/access.ts";
import { Hub, personIdOf } from "../src/hub.ts";
import { Pairing } from "../src/pairing.ts";
import { Poller } from "../src/poller.ts";
import { attachmentHeader, cleanName, Throttle, TubeMail, tubeRoutes, tubeText } from "../src/tube.ts";
import { FakeSource, recorder } from "./fake.ts";

const A = "a".repeat(40), B = "b".repeat(40), C = "c".repeat(40);
const anna = personIdOf(A), ben = personIdOf(B), clara = personIdOf(C);
const ID = "0123456789abcdef0123456789abcdef";
const ID2 = "fedcba9876543210fedcba9876543210";

describe("tube mail (ADR-0022)", () => {
  afterEach(() => vi.useRealTimers());

  /** Anna (7) and Ben (8) with plugins, Clara (9) without; Anna has two tabs, the first holds the files */
  async function setup() {
    const source = new FakeSource();
    source.users.push({ ...source.users[0]!, session: 9, name: "Clara", channel: 2, address: "10.0.0.9" });
    source.hashes[9] = C;
    const pairing = new Pairing(null);
    const hub = new Hub({ source, pairing, addressCheck: "off", preview: false });
    await new Poller(source, { onChange: (s) => hub.setState(s) }).poll();
    const plugins: Record<number, ReturnType<typeof recorder<BridgeToPlugin>>> = {};
    for (const [session, hash, locale] of [[7, A, "de"], [8, B, "en"]] as const) {
      plugins[session] = recorder<BridgeToPlugin>();
      await hub.pluginConnected(plugins[session].conn, "x").onMessage(JSON.stringify({ v: 1, type: "hello", session, certHash: hash, pluginVersion: "0", paired: true, locale }));
    }
    const mail = new TubeMail({ hub });
    hub.watchUis(mail);
    const uis = { anna: recorder<BridgeToUi>(), anna2: recorder<BridgeToUi>(), ben: recorder<BridgeToUi>(), clara: recorder<BridgeToUi>() };
    const tabs = {
      anna: hub.uiConnected(uis.anna.conn, A),
      anna2: hub.uiConnected(uis.anna2.conn, A),
      ben: hub.uiConnected(uis.ben.conn, B),
      clara: hub.uiConnected(uis.clara.conn, C),
    };
    const hold = (ids: string[], tab: "anna" | "anna2" = "anna") => tabs[tab].onMessage(JSON.stringify({ v: 1, type: "parcels-held", ids }));
    const cookie = {
      anna: pairing.redeem(pairing.createCode(A, "Anna"))!,
      ben: pairing.redeem(pairing.createCode(B, "Ben"))!,
      clara: pairing.redeem(pairing.createCode(C, "Clara"))!,
    };
    const app = Fastify();
    await app.register(tubeRoutes, { mail, gate: new Gate({ hub, source, certHashOf: (c) => pairing.certHashOf(c) }) });
    const req = (who: keyof typeof cookie | null, method: "GET" | "POST" | "DELETE", url: string, payload?: unknown, headers: Record<string, string> = {}) =>
      app.inject({ method, url, headers: { ...(who ? { cookie: cookie[who] } : {}), ...headers }, ...(payload === undefined ? {} : { payload: payload as object }) });
    const offer = (body: Record<string, unknown> = {}, who: keyof typeof cookie = "anna") =>
      req(who, "POST", "/api/parcels", { id: ID, to: [ben], name: "report.pdf", type: "application/pdf", size: 10, note: "Page 3 is new", ...body });
    const piece = (offset: number, bytes: Buffer, to = ben, who: keyof typeof cookie = "anna") =>
      req(who, "POST", `/api/parcels/${ID}/pieces/${to}?offset=${offset}`, bytes, { "content-type": "application/octet-stream" });
    const lastParcel = (ui: ReturnType<typeof recorder<BridgeToUi>>) => ui.last("parcel")?.parcel as Parcel | undefined;
    return { app, mail, hub, uis, tabs, hold, req, offer, piece, plugins, lastParcel, cookies: cookie };
  }

  it("an offer reaches the recipient's web UIs (only themselves as recipient) and their Mumble log; the sender sees everyone", async () => {
    const { offer, uis, plugins, lastParcel } = await setup();
    const res = await offer({ to: [ben, clara, anna, ben], name: "../../etc/report\u0007.pdf" });
    expect(res.statusCode).toBe(200);
    const own = res.json() as Parcel;
    // Clara has no plugin, Anna is the sender, Ben counts once
    expect(own).toMatchObject({ id: ID, from: anna, fromName: "Anna", name: "report.pdf", size: 10, note: "Page 3 is new", holder: false, ended: null });
    expect(own.recipients).toEqual([{ person: ben, name: "Ben", state: "offered", sent: 0 }]);
    expect(lastParcel(uis.anna)).toEqual(own);
    expect(lastParcel(uis.anna2)).toEqual(own);
    expect(lastParcel(uis.ben)?.recipients.map((r) => r.person)).toEqual([ben]);
    expect(uis.clara.last("parcel")).toBeUndefined();
    expect(plugins[8]!.last("notify")?.text).toBe("Tube mail from Anna: report.pdf (0.1 KB) – open Ruumble to accept it.");
    expect(plugins[7]!.last("notify")).toBeUndefined();
  });

  it("refuses offers that do not fit: not paired, too large, nobody reachable, the id of someone else's parcel, too many", async () => {
    const { offer, req } = await setup();
    expect((await req(null, "POST", "/api/parcels", { id: ID, to: [ben], name: "a", type: "", size: 1, note: "" })).statusCode).toBe(401);
    expect((await offer({ size: TUBE_LIMITS.fileBytes + 1 })).json()).toEqual({ error: "invalid" });
    expect((await offer({ to: [clara] })).json()).toEqual({ error: "not-found" });
    expect((await offer({ id: "nope" })).statusCode).toBe(400);
    expect((await offer()).statusCode).toBe(200);
    expect((await offer()).statusCode).toBe(200); // the same again: the same parcel
    expect((await offer({ to: [anna] }, "ben")).json()).toEqual({ error: "invalid" }); // Ben with Anna's id
    for (let i = 1; i < TUBE_LIMITS.openPerPerson; i++) expect((await offer({ id: i.toString(16).padStart(32, "0") })).statusCode).toBe(200);
    expect((await offer({ id: ID2 })).json()).toEqual({ error: "rate-limited" });
  });

  it("accept, download, pieces: the file arrives as a download, the sender sees it received, and the parcel is done", async () => {
    const { offer, hold, req, piece, uis, lastParcel } = await setup();
    await offer();
    hold([ID]);
    expect(lastParcel(uis.ben)?.holder).toBe(true);
    const accepted = await req("ben", "POST", `/api/parcels/${ID}/accept`);
    const { ticket } = accepted.json() as { ticket: string };
    expect(ticket).toMatch(/^[0-9a-f]{32}$/);
    expect(lastParcel(uis.anna)?.recipients[0]?.state).toBe("accepted");
    expect((await req("clara", "GET", `/api/parcels/download/${ticket}`)).statusCode).toBe(404); // not hers
    const download = req("ben", "GET", `/api/parcels/download/${ticket}`);
    await vi.waitFor(() => expect(uis.anna.last("parcel-pull")).toEqual({ v: 1, type: "parcel-pull", id: ID, to: ben, offset: 0 }));
    expect(uis.anna2.last("parcel-pull")).toBeUndefined(); // only the tab holding the file
    expect((await piece(0, Buffer.from("hello"))).statusCode).toBe(204);
    expect(lastParcel(uis.ben)?.recipients[0]).toMatchObject({ state: "receiving" });
    expect((await piece(5, Buffer.from("world"))).statusCode).toBe(204);
    const res = await download;
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("helloworld");
    expect(res.headers["content-type"]).toBe("application/octet-stream");
    expect(res.headers["content-length"]).toBe("10");
    expect(res.headers["content-disposition"]).toBe(`attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(lastParcel(uis.anna)).toMatchObject({ ended: "done", recipients: [{ state: "received", sent: 10 }] });
    expect(lastParcel(uis.ben)?.ended).toBe("done");
    expect((await req("ben", "GET", `/api/parcels/download/${ticket}`)).statusCode).toBe(404); // a ticket works once
  });

  it("over a real connection a file of several pieces arrives byte for byte, the next piece only after the last went out", async () => {
    const { app, offer, hold, req, uis, cookies } = await setup();
    const size = 3 * TUBE_LIMITS.pieceBytes + 123;
    const file = Buffer.alloc(size);
    for (let i = 0; i < size; i++) file[i] = (i * 31) % 251;
    await offer({ size, name: "data.bin" });
    hold([ID]);
    const { ticket } = (await req("ben", "POST", `/api/parcels/${ID}/accept`)).json() as { ticket: string };
    const base = await app.listen({ port: 0, host: "127.0.0.1" });
    try {
      const download = fetch(`${base}/api/parcels/download/${ticket}`, { headers: { cookie: cookies.ben } });
      await vi.waitFor(() => expect(uis.anna.last("parcel-pull")).toBeDefined());
      for (let at = 0; at < size; at += TUBE_LIMITS.pieceBytes) {
        const res = await fetch(`${base}/api/parcels/${ID}/pieces/${ben}?offset=${at}`, {
          method: "POST", headers: { cookie: cookies.anna, "content-type": "application/octet-stream" }, body: file.subarray(at, at + TUBE_LIMITS.pieceBytes),
        });
        expect(res.status).toBe(204);
      }
      const res = await download;
      expect(res.headers.get("content-disposition")).toContain('filename="data.bin"');
      expect(Buffer.from(await res.arrayBuffer()).equals(file)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("no accepting while the sender's tab is away; a piece out of order or beyond the size fails the transfer, accepting again works", async () => {
    const { offer, hold, req, piece, uis, lastParcel } = await setup();
    await offer();
    expect((await req("ben", "POST", `/api/parcels/${ID}/accept`)).json()).toEqual({ error: "sender-away" });
    hold([ID]);
    let { ticket } = (await req("ben", "POST", `/api/parcels/${ID}/accept`)).json() as { ticket: string };
    let download = req("ben", "GET", `/api/parcels/download/${ticket}`);
    await vi.waitFor(() => expect(uis.anna.last("parcel-pull")).toBeDefined());
    expect((await piece(3, Buffer.from("abc"))).json()).toEqual({ error: "invalid" });
    expect((await download).statusCode).toBe(400);
    expect(lastParcel(uis.anna)?.recipients[0]?.state).toBe("failed");
    ({ ticket } = (await req("ben", "POST", `/api/parcels/${ID}/accept`)).json() as { ticket: string });
    download = req("ben", "GET", `/api/parcels/download/${ticket}`);
    await vi.waitFor(() => expect(lastParcel(uis.anna)?.recipients[0]?.state).toBe("accepted"));
    await new Promise((r) => setTimeout(r, 10));
    expect((await piece(0, Buffer.from("01234567890"))).json()).toEqual({ error: "invalid" }); // 11 bytes of 10
    await download;
    expect(lastParcel(uis.anna)?.recipients[0]?.state).toBe("failed");
    expect((await piece(0, Buffer.from("x"), ben, "ben")).json()).toEqual({ error: "not-found" }); // not Ben's parcel
  });

  it("declining by everyone ends the parcel; withdrawing ends it and answers a waiting download", async () => {
    const { offer, hold, req, uis, lastParcel } = await setup();
    await offer();
    expect((await req("ben", "POST", `/api/parcels/${ID}/decline`)).statusCode).toBe(204);
    expect(lastParcel(uis.anna)).toMatchObject({ ended: "done", recipients: [{ state: "declined" }] });
    await offer({ id: ID2 });
    hold([ID2]);
    const { ticket } = (await req("ben", "POST", `/api/parcels/${ID2}/accept`)).json() as { ticket: string };
    const download = req("ben", "GET", `/api/parcels/download/${ticket}`);
    await vi.waitFor(() => expect(uis.anna.last("parcel-pull")).toBeDefined());
    expect((await req("ben", "DELETE", `/api/parcels/${ID2}`)).statusCode).toBe(404); // only the sender
    expect((await req("anna", "DELETE", `/api/parcels/${ID2}`)).statusCode).toBe(204);
    expect((await download).json()).toEqual({ error: "sender-away" });
    expect(lastParcel(uis.ben)?.ended).toBe("withdrawn");
  });

  it("the holding tab: another tab of the sender takes over, a tab gone for the grace time withdraws, unknown parcels are named", async () => {
    vi.useFakeTimers();
    const { mail, hub, uis, hold, tabs, lastParcel } = await setup();
    const viewer = hub.whoIs(A)!;
    mail.offer(viewer, { id: ID, to: [ben], name: "a.txt", type: "text/plain", size: 1, note: "" });
    hold([ID, ID2]);
    expect(uis.anna.last("parcels-missing")).toEqual({ v: 1, type: "parcels-missing", ids: [ID2] });
    expect(lastParcel(uis.ben)?.holder).toBe(true);
    tabs.anna.onClose();
    expect(lastParcel(uis.ben)?.holder).toBe(false);
    vi.advanceTimersByTime(TUBE_LIMITS.graceMs - 1);
    hold([ID], "anna2"); // the other tab still has it
    vi.advanceTimersByTime(TUBE_LIMITS.graceMs);
    expect(lastParcel(uis.ben)).toMatchObject({ holder: true, ended: null });
    hold([], "anna2"); // dropped it
    vi.advanceTimersByTime(TUBE_LIMITS.graceMs);
    expect(lastParcel(uis.ben)?.ended).toBe("sender-gone");
    expect(mail.size).toBe(0);
  });

  it("a parcel offered again after a restart brings no second notice; a new web UI gets the open parcels; parcels expire", async () => {
    vi.useFakeTimers();
    const { mail, hub, plugins, hold, lastParcel } = await setup();
    const viewer = hub.whoIs(A)!;
    mail.offer(viewer, { id: ID, to: [ben], name: "a.txt", type: "", size: 1, note: "", again: true });
    hold([ID]);
    expect(plugins[8]!.last("notify")).toBeUndefined();
    const late = recorder<BridgeToUi>();
    hub.uiConnected(late.conn, B);
    expect(lastParcel(late)?.id).toBe(ID);
    const sender = recorder<BridgeToUi>();
    hub.uiConnected(sender.conn, A);
    expect(lastParcel(sender)?.recipients).toHaveLength(1);
    vi.advanceTimersByTime(TUBE_LIMITS.lifeMs);
    expect(lastParcel(late)?.ended).toBe("expired");
  });

  it("a ticket not used in time goes back to offered", async () => {
    vi.useFakeTimers();
    const { mail, hub, hold, lastParcel, uis } = await setup();
    mail.offer(hub.whoIs(A)!, { id: ID, to: [ben], name: "a.txt", type: "", size: 1, note: "" });
    hold([ID]);
    expect(mail.accept(B, ID)).toMatchObject({ ticket: expect.any(String) });
    expect(mail.accept(C, ID)).toBe("not-found");
    vi.advanceTimersByTime(TUBE_LIMITS.ticketMs);
    expect(lastParcel(uis.ben)?.recipients[0]?.state).toBe("offered");
  });
});

describe("tube mail helpers", () => {
  it("the Mumble line in both languages, shortened", () => {
    expect(tubeText("Anna", "report.pdf", 2.5 * 1024 * 1024, "de")).toBe("Rohrpost von Anna: report.pdf (2,5 MB) – öffne Ruumble, um sie anzunehmen.");
    expect(tubeText("Anna", "x".repeat(200), 2048, "en")).toContain(`${"x".repeat(119)}… (2 KB)`);
    expect(tubeText("A".repeat(300), "x".repeat(200), 1).length).toBeLessThanOrEqual(300);
  });

  it("file names without folders and control characters, and their header", () => {
    expect(cleanName("C:\\Users\\x\\Bericht.pdf")).toBe("Bericht.pdf");
    expect(cleanName("a/b/\u0000ev\u001fil.sh ")).toBe("evil.sh");
    expect(cleanName("..")).toBe("file");
    expect(cleanName("x".repeat(300))).toHaveLength(255);
    expect(attachmentHeader('Grüße "1".txt')).toBe(`attachment; filename="Gr__e _1_.txt"; filename*=UTF-8''Gr%C3%BC%C3%9Fe%20%221%22.txt`);
  });

  it("the throttle gives every piece its share of time; 0 is unlimited", () => {
    let now = 0;
    let rate = 1000;
    const t = new Throttle(() => rate, () => now);
    expect(t.delay(500)).toBe(500);
    expect(t.delay(500)).toBe(1000); // queued behind the first
    now = 5000;
    expect(t.delay(1000)).toBe(1000); // idle in between: no debt
    rate = 0;
    expect(t.delay(1_000_000)).toBe(0);
  });
});
