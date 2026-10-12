import Link from "next/link";
import LogoutButton from "./LogoutButton";

export default function AdminNav() {
  return (
    <nav className="row" aria-label="Admin" style={{ marginBottom: 8 }}>
      <Link className="btn small" href="/admin">Exceptions</Link>
      <Link className="btn small" href="/admin/orders">Orders</Link>
      <Link className="btn small" href="/admin/settings">Limits &amp; simulator</Link>
      <Link className="btn small" href="/admin/metrics">Pilot metrics</Link>
      <Link className="btn small" href="/admin/suppliers">Suppliers</Link>
      <LogoutButton />
    </nav>
  );
}
