import { NextResponse } from "next/server";
import { adminOrders } from "@/lib/admin";
import { requireAdmin, route } from "@/lib/http";

export const GET = route(async () => {
  await requireAdmin();
  return NextResponse.json({ orders: await adminOrders() });
});
