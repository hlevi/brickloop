"use client";

import { useEffect, useState, type CSSProperties } from "react";

const COLORS = ["#ffd23f", "#ff6b6b", "#4ecdc4", "#6a8dff", "#b45cff", "#7ed957", "#ff9f1c"];

interface Piece {
  id: number;
  left: number;
  dx: number;
  rot: number;
  delay: number;
  color: string;
  round: boolean;
}

/** A short CSS confetti burst; changes to `burst` (> 0) fire a new one. Skipped with reduced motion. */
export default function Confetti({ burst }: { burst: number }) {
  const [pieces, setPieces] = useState<Piece[]>([]);
  useEffect(() => {
    if (!burst) return;
    let reduced = false;
    try {
      reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    } catch {
      reduced = false;
    }
    if (reduced) return;
    const made = Array.from({ length: 36 }, (_, i) => ({
      id: burst * 100 + i,
      left: 30 + Math.random() * 40,
      dx: (Math.random() - 0.5) * 360,
      rot: (Math.random() - 0.5) * 1080,
      delay: Math.random() * 0.15,
      color: COLORS[i % COLORS.length],
      round: Math.random() < 0.3,
    }));
    const show = window.setTimeout(() => setPieces(made), 0);
    const hide = window.setTimeout(() => setPieces([]), 1900);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [burst]);
  if (!pieces.length) return null;
  return (
    <div className="lab-confetti" aria-hidden>
      {pieces.map((p) => (
        <i
          key={p.id}
          className={p.round ? "round" : undefined}
          style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, "--dx": `${p.dx}px`, "--rot": `${p.rot}deg` } as CSSProperties}
        />
      ))}
    </div>
  );
}
