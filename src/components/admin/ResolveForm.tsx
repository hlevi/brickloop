"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ResolveForm({ id, actions }: { id: string; actions: { id: string; label: string }[] }) {
  const router = useRouter();
  const [action, setAction] = useState(actions[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [minutes, setMinutes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="stack"
      style={{ gap: 6 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        const r = await fetch(`/api/admin/exceptions/${id}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, note, ownerMinutes: minutes ? Number(minutes) : undefined }),
        });
        const j = await r.json().catch(() => ({}));
        setBusy(false);
        setMsg(r.ok ? j.message : (j.message ?? "Failed"));
        if (r.ok) router.refresh();
      }}
    >
      <select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Resolution action">
        {actions.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </select>
      <input type="text" placeholder="Note (required for 'mark resolved'; supplier ref for 'confirm purchased')" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
      <div className="row">
        <input type="number" min="0" placeholder="Owner minutes" value={minutes} onChange={(e) => setMinutes(e.target.value)} style={{ maxWidth: 150 }} aria-label="Owner minutes spent" />
        <button className="btn small primary" disabled={busy}>
          Apply
        </button>
      </div>
      {msg && <span className="small">{msg}</span>}
    </form>
  );
}
