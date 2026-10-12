"use client";

/**
 * CONTRACT (implemented by the wish feature): full-screen "Show a grown-up" card.
 * Props are fixed: the Lab renders <WishCard designId={id} onClose={...} />.
 * It creates a wish for the design's current revision (POST /api/designs/[id]/wish),
 * shows the creature, its name, an 8-character code, a QR code to /w/CODE, a note
 * sticker choice and a calm status line that polls GET /api/wishes/[code]/status.
 * It must never show money, ask for personal data or contain free-text inputs.
 */
export interface WishCardProps {
  designId: string;
  onClose: () => void;
}

export default function WishCard({ onClose }: WishCardProps) {
  return (
    <div role="dialog" aria-modal="true" className="wish-card-placeholder">
      <p>Show a grown-up (coming soon)</p>
      <button className="btn" onClick={onClose}>
        Back to my creature
      </button>
    </div>
  );
}
