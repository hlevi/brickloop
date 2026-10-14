import type { Occasion, OccasionId } from "./types";

export const OCCASIONS: Occasion[] = [
  { id: "birthday", label: "Birthday", blurb: "A present and a card in one.", theme: "confetti-cream" },
  { id: "love", label: "Love & Anniversary", blurb: "Say it with something they build.", theme: "blush-hearts" },
  { id: "thank-you", label: "Thank You", blurb: "Thanks that stays on the shelf.", theme: "sage-leaves" },
  { id: "congrats", label: "Congratulations", blurb: "For the big wins and the small ones.", theme: "midnight-stars" },
  { id: "baby", label: "New Baby", blurb: "Welcome the newest builder.", theme: "sky-dots" },
  { id: "wedding", label: "Wedding", blurb: "Two builders, one beautiful day.", theme: "ivory-plain" },
  { id: "holidays", label: "Holidays", blurb: "Seasonal builds for the whole family.", theme: "holly-snow" },
  { id: "thinking-of-you", label: "Thinking of You", blurb: "A quiet, kind gesture.", theme: "ivory-plain" },
  { id: "new-home", label: "New Home", blurb: "Their first build in the new place.", theme: "sage-leaves" },
  { id: "just-because", label: "Just Because", blurb: "No reason needed.", theme: "sunny-stripes" },
];

export function getOccasion(id: string): Occasion | undefined {
  return OCCASIONS.find((o) => o.id === id);
}

export function isOccasionId(v: unknown): v is OccasionId {
  return typeof v === "string" && OCCASIONS.some((o) => o.id === v);
}
