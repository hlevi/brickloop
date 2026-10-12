import { redirect } from "next/navigation";
import { isAdmin } from "./http";

export async function adminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
}
