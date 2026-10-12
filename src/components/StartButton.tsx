"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import "./start-button.css";

/**
 * Creates a design from a template and opens it.
 * to="editor" (default): the grown-up editor at /design/[id].
 * to="lab": the Creature Lab at /lab/[id]?new=1 (a starter shuffle runs there).
 * variant="hero": the big kid-facing button; it never shows error text, it just lets you tap again.
 */
export default function StartButton({ template, label = "Customize", to = "editor", variant = "default" }: { template: string; label?: string; to?: "editor" | "lab"; variant?: "default" | "hero" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hero = variant === "hero";
  return (
    <div>
      <button
        className={hero ? "start-hero" : "btn primary"}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            const r = await fetch("/api/designs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ template }) });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j.message ?? "Could not start a design");
            router.push(to === "lab" ? `/lab/${j.id}?new=1` : `/design/${j.id}`);
          } catch (e) {
            if (!hero) setErr((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {busy ? (hero ? "Hatching..." : "Starting...") : label}
      </button>
      {err && <p className="error small">{err}</p>}
    </div>
  );
}
