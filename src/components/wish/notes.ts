/** The three note stickers a kid can put on a wish (ids match the wishes.note enum). No free text, ever. */
export const NOTE_STICKERS = [
  { id: "invented", icon: "🌟", label: "I invented this!" },
  { id: "together", icon: "🤝", label: "Can we build it together?" },
  { id: "special_day", icon: "🎁", label: "For a special day?" },
] as const;

export type NoteId = (typeof NOTE_STICKERS)[number]["id"];

export function noteSticker(id: string) {
  return NOTE_STICKERS.find((n) => n.id === id) ?? NOTE_STICKERS[0];
}
