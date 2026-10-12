"use client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button className="btn small" onClick={async () => { await fetch("/api/admin/logout", { method: "POST" }); router.push("/admin/login"); }}>
      Log out
    </button>
  );
}
