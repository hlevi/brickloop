"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Small button that sends JSON to an admin endpoint and refreshes the page. */
export default function JsonAction({ url, method = "POST", body, label, confirm: confirmText, className = "btn small" }: { url: string; method?: string; body: unknown; label: string; confirm?: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span>
      <button
        className={className}
        disabled={busy}
        onClick={async () => {
          if (confirmText && !window.confirm(confirmText)) return;
          setBusy(true);
          setErr(null);
          const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) setErr(j.message ?? "Failed");
          setBusy(false);
          router.refresh();
        }}
      >
        {label}
      </button>
      {err && <span className="error small"> {err}</span>}
    </span>
  );
}
