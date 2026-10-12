"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginForm() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const password = String(new FormData(e.currentTarget).get("password") ?? "");
        const r = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return setErr(j.message ?? "Login failed");
        router.push("/admin");
        router.refresh();
      }}
    >
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {err && <p className="error small">{err}</p>}
      <button className="btn primary">Log in</button>
    </form>
  );
}
