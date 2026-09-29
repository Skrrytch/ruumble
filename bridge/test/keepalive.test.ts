import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keepAlive } from "../src/keepalive.ts";

class FakeSocket extends EventEmitter {
  pings = 0;
  terminated = false;
  ping() {
    this.pings++;
  }
  terminate() {
    this.terminated = true;
    this.emit("close");
  }
}

describe("keepAlive", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("pings every interval as long as pongs come back", () => {
    const socket = new FakeSocket();
    keepAlive(socket, 1000);
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(1000);
      socket.emit("pong");
    }
    expect(socket.pings).toBe(3);
    expect(socket.terminated).toBe(false);
  });

  it("terminates a connection that did not answer the previous ping", () => {
    const socket = new FakeSocket();
    keepAlive(socket, 1000);
    vi.advanceTimersByTime(1000);
    expect(socket.pings).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(socket.terminated).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(socket.pings).toBe(1);
  });

  it("stops when the connection closes", () => {
    const socket = new FakeSocket();
    keepAlive(socket, 1000);
    socket.emit("close");
    vi.advanceTimersByTime(5000);
    expect(socket.pings).toBe(0);
    expect(socket.terminated).toBe(false);
  });

  it("survives a ping on a closing socket", () => {
    const socket = new FakeSocket();
    socket.ping = () => {
      throw new Error("not open");
    };
    keepAlive(socket, 1000);
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
  });
});
