import LoginForm from "@/components/admin/LoginForm";
import { env } from "@/lib/config";

export default function AdminLogin() {
  const configured = env.adminPassword.length >= 12;
  return (
    <div className="panel" style={{ maxWidth: 420 }}>
      <h1>Owner login</h1>
      {!configured && <p className="notice bad small">Admin access is disabled: set ADMIN_PASSWORD (12+ characters) in the server environment.</p>}
      <LoginForm />
    </div>
  );
}
