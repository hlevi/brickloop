import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetSoundForTests, isMuted, onMutedChange, play, setMuted, toggleMuted } from "@/lib/creature/sound";

class FakeParam {
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
}
class FakeNode {
  frequency = new FakeParam();
  gain = new FakeParam();
  type = "sine";
  connect() {}
  start() {}
  stop() {}
}
let created = 0;
let oscillators = 0;
class FakeAudioContext {
  state = "suspended";
  currentTime = 0;
  destination = {};
  constructor() {
    created++;
  }
  createOscillator() {
    oscillators++;
    return new FakeNode();
  }
  createGain() {
    return new FakeNode();
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  suspend() {
    this.state = "suspended";
    return Promise.resolve();
  }
}

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

const g = globalThis as Record<string, unknown>;

beforeEach(() => {
  __resetSoundForTests();
  created = 0;
  oscillators = 0;
});
afterEach(() => {
  delete g.localStorage;
  delete g.AudioContext;
  vi.restoreAllMocks();
});

describe("lab sound kit", () => {
  it("creates its AudioContext lazily on the first sound, then reuses it", () => {
    g.AudioContext = FakeAudioContext;
    expect(created).toBe(0);
    play("pop");
    play("clunk");
    play("tada");
    expect(created).toBe(1);
    expect(oscillators).toBeGreaterThanOrEqual(5);
  });

  it("muted: no sound and no AudioContext at all", () => {
    g.AudioContext = FakeAudioContext;
    g.localStorage = memoryStorage();
    setMuted(true);
    play("pop");
    expect(created).toBe(0);
    expect(oscillators).toBe(0);
  });

  it("remembers mute in localStorage across visits", () => {
    const store = memoryStorage();
    g.localStorage = store;
    expect(isMuted()).toBe(false);
    expect(toggleMuted()).toBe(true);
    expect(store.data.get("brickloop.lab.muted")).toBe("1");
    __resetSoundForTests();
    expect(isMuted()).toBe(true);
    toggleMuted();
    __resetSoundForTests();
    expect(isMuted()).toBe(false);
  });

  it("works when storage throws (private mode) or is missing", () => {
    g.localStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    expect(isMuted()).toBe(false);
    expect(() => setMuted(true)).not.toThrow();
    expect(isMuted()).toBe(true);
    delete g.localStorage;
    __resetSoundForTests();
    expect(isMuted()).toBe(false);
  });

  it("is silent and safe without WebAudio", () => {
    expect(() => play("tada")).not.toThrow();
    expect(created).toBe(0);
  });

  it("notifies listeners so every mute button stays in sync", () => {
    const seen: boolean[] = [];
    const off = onMutedChange((m) => seen.push(m));
    setMuted(true);
    setMuted(false);
    off();
    setMuted(true);
    expect(seen).toEqual([true, false]);
  });
});
