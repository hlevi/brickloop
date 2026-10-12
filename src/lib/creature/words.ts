/**
 * Curated, original word lists for creature names and builder tags. Kids pick
 * by index only (no free text anywhere in kid mode). Every combination is
 * checked against a blocklist in tests/creature.test.ts; any change to these
 * lists must keep that test green and be reviewed by a person.
 */
import type { ColorId } from "../catalog/colors";
import type { CreatureIdentity } from "../model/types";

export const TITLES = [
  "Captain", "Professor", "Doctor", "Sir", "Dame", "Mister", "Agent", "Chief", "Major", "Baron", "Count", "Duke",
  "Little", "Big", "Mighty", "Super", "Mega", "Tiny", "Royal", "Grand", "Brave", "Sneaky", "Sleepy", "Silly",
] as const;

export const WORDS = [
  "Fizz", "Zap", "Bloop", "Wobble", "Crunch", "Snap", "Zoom", "Boom", "Bumble", "Twinkle",
  "Rumble", "Sparkle", "Wiggle", "Puddle", "Pickle", "Noodle", "Muffin", "Pebble", "Thunder", "Frost",
  "Blaze", "Glimmer", "Doodle", "Jelly", "Bubble", "Marble", "Cosmo", "Rocket", "Pepper", "Comet",
  "Squish", "Biscuit", "Tumble", "Whirl", "Dazzle", "Gizmo", "Waffle", "Pudding", "Crackle", "Sprocket",
] as const;

export const ENDINGS = [
  "fang", "tail", "claw", "horn", "wing", "beak", "toes", "nose", "paw", "spike", "bot", "saur",
  "puff", "chomp", "stomp", "flap", "snout", "scale", "whisker", "bean", "sprout", "berry", "drop", "blip",
] as const;

export const ADJECTIVES = [
  "Brave", "Clever", "Happy", "Mighty", "Swift", "Sunny", "Lucky", "Jolly", "Bold", "Bright",
  "Calm", "Cosmic", "Daring", "Eager", "Fuzzy", "Gentle", "Giggly", "Glowing", "Grand", "Hopping",
  "Jumpy", "Kind", "Merry", "Nimble", "Plucky", "Quick", "Quiet", "Speedy", "Snappy", "Sparkly",
  "Spotty", "Starry", "Stripy", "Super", "Tiny", "Wise", "Witty", "Zippy", "Bouncy", "Cheery",
] as const;

export const ANIMALS = [
  "Otter", "Panda", "Fox", "Owl", "Tiger", "Koala", "Penguin", "Dolphin", "Falcon", "Badger",
  "Beaver", "Bunny", "Turtle", "Lion", "Llama", "Moose", "Whale", "Gecko", "Hedgehog", "Raccoon",
  "Squirrel", "Walrus", "Zebra", "Yak", "Puffin", "Lemur", "Ferret", "Bison", "Camel", "Crab",
  "Duck", "Eagle", "Frog", "Goat", "Hippo", "Iguana", "Jaguar", "Kiwi", "Lobster", "Meerkat",
] as const;

/** Builder-tag numbers: 10..99 by index 0..89. */
export const NUMBER_COUNT = 90;

export const REEL_SIZES = { name: [TITLES.length, WORDS.length, ENDINGS.length], builder: [ADJECTIVES.length, ANIMALS.length, NUMBER_COUNT] } as const;

export function renderName(id: CreatureIdentity | undefined): string {
  if (!id) return "Your creature";
  const [t, w, e] = id.name;
  return `${TITLES[t]} ${WORDS[w]}${ENDINGS[e]}`;
}

export function renderBuilder(id: CreatureIdentity | undefined): string {
  if (!id) return "a BrickLoop builder";
  const [a, n, num] = id.builder;
  return `${ADJECTIVES[a]}${ANIMALS[n]}${10 + num}`;
}

export function isValidIdentity(v: unknown): v is CreatureIdentity {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const ok = (arr: unknown, sizes: readonly number[]) =>
    Array.isArray(arr) && arr.length === 3 && arr.every((x, i) => Number.isInteger(x) && (x as number) >= 0 && (x as number) < sizes[i]);
  return ok(o.name, REEL_SIZES.name) && ok(o.builder, REEL_SIZES.builder) && Object.keys(o).every((k) => k === "name" || k === "builder");
}

/** Deterministic pseudo-random identity from a seed (used for the starter creature). */
export function identityFromSeed(seed: number): CreatureIdentity {
  let s = seed >>> 0 || 1;
  const next = (n: number) => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) % n;
  };
  return {
    name: [next(TITLES.length), next(WORDS.length), next(ENDINGS.length)],
    builder: [next(ADJECTIVES.length), next(ANIMALS.length), next(NUMBER_COUNT)],
  };
}

export interface Power {
  id: "fire" | "zap" | "leaf" | "ice" | "star";
  label: string;
  icon: string;
  colorId: ColorId;
}

/** Each power is the color of the see-through power-core brick (one source of truth). */
export const POWERS: Power[] = [
  { id: "fire", label: "Fire", icon: "🔥", colorId: "trans-red" },
  { id: "zap", label: "Zap", icon: "⚡", colorId: "trans-yellow" },
  { id: "leaf", label: "Leaf", icon: "🍃", colorId: "trans-green" },
  { id: "ice", label: "Ice", icon: "❄️", colorId: "trans-light-blue" },
  { id: "star", label: "Star", icon: "⭐", colorId: "trans-clear" },
];

export function powerOf(coreColor: string | undefined): Power {
  return POWERS.find((p) => p.colorId === coreColor) ?? POWERS[3];
}
