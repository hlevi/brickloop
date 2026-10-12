/**
 * Pure helpers behind the Creature Lab's Shuffle lever, world palettes and name
 * reels. Everything here produces ordinary tool calls (set_option, set_color,
 * set_identity) that applyTool re-validates, so a shuffle can never reach a
 * design the kit compiler and validator haven't proven buildable.
 */
import type { ToolCall } from "../edit/tools";
import type { KitDef } from "../model/templates/types";
import type { CreatureIdentity, DesignParams } from "../model/types";
import { REEL_SIZES } from "./words";
import { WORLDS, type World } from "./worlds";

/** Random source returning a float in [0, 1) (Math.random by default; seedable in tests). */
export type Rng = () => number;

/** Lock id for the Colors tab (structural tabs use their option id). */
export const COLORS_LOCK = "colors";

/** Zones painted by a world palette (the power core is chosen separately in the Power tab). */
export const WORLD_ZONES = ["skin", "belly", "feet", "eyes", "spikes"] as const;

/** Small deterministic generator (mulberry32), so server and client render the same choices. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string (e.g. a design id) for seeding. */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function randomInt(n: number, rnd: Rng = Math.random): number {
  return Math.min(n - 1, Math.floor(rnd() * n));
}

/** A uniformly random element different from `current` (or any element when there is no other choice). */
export function pickDifferent<T>(values: readonly T[], current: T | undefined, rnd: Rng = Math.random): T {
  const others = values.filter((v) => v !== current);
  const pool = others.length ? others : values;
  return pool[randomInt(pool.length, rnd)];
}

/** The world whose palette exactly matches the current colors, if any. */
export function currentWorld(colors: Record<string, string>): World | undefined {
  return WORLDS.find((w) => WORLD_ZONES.every((z) => colors[z] === w.colors[z]));
}

/** set_color calls that paint a world palette (only the zones that actually change). */
export function worldCalls(world: World, colors: Record<string, string>): ToolCall[] {
  return WORLD_ZONES.filter((z) => colors[z] !== world.colors[z]).map((z) => ({ name: "set_color", input: { component: z, color: world.colors[z] } }));
}

export function randomIdentity(rnd: Rng = Math.random): CreatureIdentity {
  const [t, w, e] = REEL_SIZES.name;
  const [a, n, num] = REEL_SIZES.builder;
  return { name: [randomInt(t, rnd), randomInt(w, rnd), randomInt(e, rnd)], builder: [randomInt(a, rnd), randomInt(n, rnd), randomInt(num, rnd)] };
}

export function identityCall(identity: CreatureIdentity): ToolCall {
  return { name: "set_identity", input: { name: [...identity.name], builder: [...identity.builder] } };
}

export interface ShuffleOptions {
  /** Also roll a random name and builder tag (the starter creature). */
  identity?: boolean;
}

/**
 * One Shuffle-lever pull: every unlocked structural slot gets a different value,
 * and when Colors is unlocked a different world palette is painted. Locked slots
 * are never touched. The result is one batch, so one Undo reverts it.
 */
export function shuffleCalls(kit: Pick<KitDef, "options">, params: DesignParams, locked: Iterable<string> = [], rnd: Rng = Math.random, opts: ShuffleOptions = {}): ToolCall[] {
  const locks = new Set(locked);
  const calls: ToolCall[] = [];
  for (const o of kit.options) {
    if (locks.has(o.id) || o.values.length < 2) continue;
    const value = pickDifferent(
      o.values.map((v) => v.id),
      params.options[o.id] ?? o.default,
      rnd,
    );
    calls.push({ name: "set_option", input: { option: o.id, value } });
  }
  if (!locks.has(COLORS_LOCK)) {
    const now = currentWorld(params.colors);
    const world = pickDifferent(WORLDS, now, rnd);
    calls.push(...worldCalls(world, params.colors));
  }
  if (opts.identity) calls.push(identityCall(randomIdentity(rnd)));
  return calls;
}

/**
 * Most tool calls POST /api/designs/[id]/edit accepts in one request (one
 * revision). Larger batches are split by the EditQueue into several revisions.
 */
export const EDIT_BATCH_MAX = 10;

/**
 * The starter creature for a brand-new design: random shape, world palette, name
 * and builder tag, kept to one edit request so the design has exactly two
 * revisions (template default + starter). Every slot gets a uniformly random
 * value (it may keep the default); when the world palette leaves too little room,
 * a few random slots simply keep their default value.
 */
export function starterCalls(kit: Pick<KitDef, "options">, params: DesignParams, rnd: Rng = Math.random, maxCalls = EDIT_BATCH_MAX): ToolCall[] {
  const world = WORLDS[randomInt(WORLDS.length, rnd)];
  const colors = worldCalls(world, params.colors);
  const identity = identityCall(randomIdentity(rnd));
  const options: ToolCall[] = [];
  for (const o of kit.options) {
    const value = o.values[randomInt(o.values.length, rnd)].id;
    if (value !== (params.options[o.id] ?? o.default)) options.push({ name: "set_option", input: { option: o.id, value } });
  }
  const room = Math.max(0, maxCalls - colors.length - 1);
  while (options.length > room) options.splice(randomInt(options.length, rnd), 1);
  return [...options, ...colors, identity];
}

/** Step a reel index by +1/-1 with wrap-around (reels spin forever in both directions). */
export function spinIndex(index: number, delta: number, size: number): number {
  return (((index + delta) % size) + size) % size;
}

/** Three builder-tag choices: the current tag first (when there is one), then fresh random ones, no duplicates. */
export function builderChoices(current: CreatureIdentity["builder"] | undefined, rnd: Rng = Math.random, count = 3): CreatureIdentity["builder"][] {
  const out: CreatureIdentity["builder"][] = current ? [[...current] as CreatureIdentity["builder"]] : [];
  const seen = new Set(out.map((b) => b.join(",")));
  let guard = 0;
  while (out.length < count && guard++ < 100) {
    const b = randomIdentity(rnd).builder;
    const k = b.join(",");
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(b);
  }
  return out;
}
