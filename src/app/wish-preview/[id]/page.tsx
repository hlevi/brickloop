// TEMPORARY harness for browser checks of the WishCard (not committed).
import Harness from "./Harness";

export default async function WishPreview(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return <Harness designId={id} />;
}
