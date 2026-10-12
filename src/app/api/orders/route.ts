import { NextResponse } from "next/server";
import { createOrder, listCustomerOrders } from "@/lib/orders/service";
import { assertSameOrigin, getCustomerId, readJson, requireCustomerId, route } from "@/lib/http";

export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const cid = await requireCustomerId();
  const body = await readJson(req);
  const id = await createOrder(cid, { designId: String(body.designId ?? ""), contact: body.contact, adultConfirmed: body.adultConfirmed, budgetCents: body.budgetCents });
  return NextResponse.json({ id }, { status: 201 });
});

export const GET = route(async () => {
  const cid = await getCustomerId(false);
  return NextResponse.json({ orders: cid ? await listCustomerOrders(cid) : [] });
});
