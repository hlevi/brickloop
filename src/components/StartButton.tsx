"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function StartButton({ template, label = "Customize" }: { template: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <button
        className="btn primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          const r = await fetch("/api/designs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ template }) });
          const j = await r.json();
          if (!r.ok) {
            setErr(j.message ?? "Could not start a design");
            setBusy(false);
            return;
          }
          router.push(`/design/${j.id}`);
        }}
      >
        {busy ? "Starting..." : label}
      </button>
      {err && <p className="error small">{err}</p>}
    </div>
  );
}
