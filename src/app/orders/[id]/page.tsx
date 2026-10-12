import OrderView from "@/components/OrderView";

export default async function OrderPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return <OrderView orderId={id} />;
}
