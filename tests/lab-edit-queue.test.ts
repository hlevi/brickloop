import { describe, expect, it } from "vitest";
import { EditQueue, type EditResult } from "@/lib/creature/editQueue";
import type { ToolCall } from "@/lib/edit/tools";

const call = (n: number): ToolCall => ({ name: "set_option", input: { option: "head", value: `v${n}` } });

/** A fake edit route: caps calls per request like the real one, records requests, one revision per request. */
function fakeServer(opts: { cap?: number; reject?: (c: ToolCall) => boolean; fail?: () => boolean } = {}) {
  const cap = opts.cap ?? 10;
  const requests: ToolCall[][] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let revisions = 1;
  let undos = 0;
  const pending: (() => void)[] = [];
  let manual = false;
  const server = {
    requests,
    get maxInFlight() {
      return maxInFlight;
    },
    get revisions() {
      return revisions;
    },
    get undos() {
      return undos;
    },
    /** Hold responses until release() so tests can tap while a request is in flight. */
    hold() {
      manual = true;
    },
    release() {
      manual = false;
      pending.splice(0).forEach((r) => r());
    },
    async send(calls: ToolCall[]): Promise<EditResult> {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      requests.push(calls);
      if (manual) await new Promise<void>((r) => pending.push(r));
      else await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      if (opts.fail?.()) throw new Error("network");
      const handled = calls.slice(0, cap);
      const applied = handled.filter((c) => !opts.reject?.(c)).map((c) => String(c.input.value));
      const rejected = handled.filter((c) => opts.reject?.(c)).map(() => "nope");
      if (applied.length) revisions++;
      return { applied, rejected };
    },
    async undo() {
      undos++;
      revisions--;
    },
  };
  return server;
}

function makeQueue(server: ReturnType<typeof fakeServer>) {
  let desyncs = 0;
  const q = new EditQueue({ send: (c) => server.send(c), undo: () => server.undo(), onDesync: () => desyncs++ });
  return { q, desyncs: () => desyncs };
}

describe("EditQueue", () => {
  it("sends one request at a time, in tap order", async () => {
    const s = fakeServer();
    const { q } = makeQueue(s);
    for (let i = 0; i < 5; i++) q.push([call(i)]);
    await q.idle();
    expect(s.maxInFlight).toBe(1);
    expect(s.requests.map((r) => r[0].input.value)).toEqual(["v0", "v1", "v2", "v3", "v4"]);
    expect(q.undoable).toBe(5);
  });

  it("one tap writes exactly one revision, and one Undo reverts it", async () => {
    const s = fakeServer();
    const { q } = makeQueue(s);
    q.push([call(1)]);
    await q.idle();
    expect(s.revisions).toBe(2);
    expect(await q.undo()).toBe(true);
    expect(s.undos).toBe(1);
    expect(q.undoable).toBe(0);
  });

  it("a shuffle larger than the route's per-request cap is re-sent in parts, and one Undo reverts all of it", async () => {
    const s = fakeServer({ cap: 10 });
    const { q, desyncs } = makeQueue(s);
    const batch = Array.from({ length: 13 }, (_, i) => call(i));
    q.push(batch);
    await q.idle();
    expect(s.requests.map((r) => r.length)).toEqual([13, 3]);
    expect(s.requests[1]).toEqual(batch.slice(10));
    expect(desyncs()).toBe(0);
    expect(q.undoable).toBe(1);
    await q.undo();
    expect(s.undos).toBe(2);
    expect(s.revisions).toBe(1);
  });

  it("with a big enough cap a shuffle is exactly one request", async () => {
    const s = fakeServer({ cap: 20 });
    const { q } = makeQueue(s);
    q.push(Array.from({ length: 13 }, (_, i) => call(i)));
    await q.idle();
    expect(s.requests).toHaveLength(1);
    await q.undo();
    expect(s.undos).toBe(1);
  });

  it("coalesces fast name-reel spins that are still waiting (last one wins)", async () => {
    const s = fakeServer();
    const { q } = makeQueue(s);
    s.hold();
    q.push([call(0)], { coalesce: "identity" });
    q.push([call(1)], { coalesce: "identity" });
    q.push([call(2)], { coalesce: "identity" });
    q.push([call(3)], { coalesce: "identity" });
    // The first spin is already in flight; the other three collapse into one request.
    await new Promise((r) => setTimeout(r, 5));
    s.release();
    await new Promise((r) => setTimeout(r, 5));
    s.release();
    await q.idle();
    expect(s.requests.map((r) => r[0].input.value)).toEqual(["v0", "v3"]);
    expect(q.undoable).toBe(2);
  });

  it("does not coalesce different kinds of actions", async () => {
    const s = fakeServer();
    const { q } = makeQueue(s);
    s.hold();
    q.push([call(0)], { coalesce: "identity" });
    q.push([call(1)], { coalesce: "identity" });
    q.push([call(2)]);
    q.push([call(3)], { coalesce: "identity" });
    await new Promise((r) => setTimeout(r, 5));
    for (let i = 0; i < 4; i++) {
      s.release();
      await new Promise((r) => setTimeout(r, 5));
    }
    await q.idle();
    expect(s.requests.map((r) => r[0].input.value)).toEqual(["v0", "v1", "v2", "v3"]);
  });

  it("keeps the starter shuffle out of the Undo history", async () => {
    const s = fakeServer();
    const { q } = makeQueue(s);
    q.push([call(0), call(1)], { record: false });
    await q.idle();
    expect(q.undoable).toBe(0);
    expect(await q.undo()).toBe(false);
    expect(s.undos).toBe(0);
    // The fallback lets a reloaded Lab undo one server revision at a time.
    expect(await q.undo(1)).toBe(true);
    expect(s.undos).toBe(1);
  });

  it("Undo waits for pending edits first", async () => {
    const s = fakeServer();
    const { q } = makeQueue(s);
    q.push([call(0)]);
    q.push([call(1)]);
    const undone = q.undo();
    await undone;
    expect(s.requests).toHaveLength(2);
    expect(s.undos).toBe(1);
    expect(q.undoable).toBe(1);
  });

  it("a server rejection drops the queue and asks the Lab to reload", async () => {
    const s = fakeServer({ reject: (c) => c.input.value === "v1" });
    const { q, desyncs } = makeQueue(s);
    q.push([call(0)]);
    q.push([call(1)]);
    await q.idle();
    expect(desyncs()).toBe(1);
    expect(q.undoable).toBe(0);
  });

  it("a network failure drops queued edits and asks the Lab to reload", async () => {
    let n = 0;
    const s = fakeServer({ fail: () => ++n === 2 });
    const { q, desyncs } = makeQueue(s);
    q.push([call(0)]);
    q.push([call(1)]);
    q.push([call(2)]);
    await q.idle();
    expect(desyncs()).toBe(1);
    expect(s.requests).toHaveLength(2);
    expect(q.busy).toBe(false);
    // It keeps working afterwards.
    q.push([call(3)]);
    await q.idle();
    expect(s.requests).toHaveLength(3);
  });

  it("idle resolves immediately when nothing is pending", async () => {
    const { q } = makeQueue(fakeServer());
    await expect(q.idle()).resolves.toBeUndefined();
    q.push([]);
    expect(q.undoable).toBe(0);
  });
});
