"use client";
// TEMPORARY harness for browser checks of the WishCard (not committed).
import { useState } from "react";
import WishCard from "@/components/lab/WishCard";

export default function Harness({ designId }: { designId: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <p>Lab stand-in</p>
      <button className="btn primary" onClick={() => setOpen(true)}>
        Show a grown-up
      </button>
      {open && <WishCard designId={designId} onClose={() => setOpen(false)} />}
    </div>
  );
}
