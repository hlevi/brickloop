/**
 * Tiny on-device sound kit for the Creature Lab: a few WebAudio oscillator
 * blips, no audio files, no network, no dependency.
 *
 * The AudioContext is created lazily by the first play() call, which the Lab
 * only makes from a tap (browsers require a user gesture). A global mute toggle
 * is remembered in localStorage; every storage access is wrapped in try/catch so
 * the Lab works the same with storage blocked or unavailable.
 */

export type SoundName = "pop" | "clunk" | "tada" | "tick" | "whoosh";

const STORAGE_KEY = "brickloop.lab.muted";

type AudioCtor = new () => AudioContext;

let ctx: AudioContext | null = null;
let muted: boolean | null = null;
const listeners = new Set<(muted: boolean) => void>();

function readStoredMute(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStoredMute(value: boolean): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Storage blocked (private mode, sandbox): the toggle still works for this visit.
  }
}

export function isMuted(): boolean {
  if (muted === null) muted = readStoredMute();
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  writeStoredMute(value);
  if (value && ctx && ctx.state === "running") ctx.suspend().catch(() => {});
  listeners.forEach((l) => l(value));
}

export function toggleMuted(): boolean {
  setMuted(!isMuted());
  return isMuted();
}

/** Subscribe to mute changes; returns an unsubscribe function. */
export function onMutedChange(listener: (muted: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const g = globalThis as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

function tone(c: AudioContext, at: number, freq: number, dur: number, type: OscillatorType, volume: number, slideTo?: number): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** Play a sound unless muted. Safe to call anywhere: it never throws. */
export function play(name: SoundName, pitch = 1): void {
  if (isMuted()) return;
  const c = audio();
  if (!c) return;
  try {
    if (c.state === "suspended") c.resume().catch(() => {});
    const t = c.currentTime + 0.005;
    switch (name) {
      case "pop":
        tone(c, t, 520 * pitch, 0.12, "sine", 0.25, 1100 * pitch);
        break;
      case "tick":
        tone(c, t, 1400 * pitch, 0.04, "triangle", 0.08);
        break;
      case "clunk":
        tone(c, t, 150, 0.18, "square", 0.12, 70);
        tone(c, t, 90, 0.22, "sine", 0.3, 50);
        break;
      case "whoosh":
        tone(c, t, 220, 0.35, "sawtooth", 0.04, 880);
        break;
      case "tada":
        tone(c, t, 523.25, 0.16, "triangle", 0.2);
        tone(c, t + 0.14, 783.99, 0.42, "triangle", 0.22);
        tone(c, t + 0.14, 1046.5, 0.42, "sine", 0.1);
        break;
    }
  } catch {
    // Audio is a bonus; never let it break the Lab.
  }
}

/** Test hook: forget the AudioContext and cached mute state. */
export function __resetSoundForTests(): void {
  ctx = null;
  muted = null;
  listeners.clear();
}
