import { redirect } from "next/navigation";
import Editor from "@/components/Editor";
import { getDesignView } from "@/lib/designs";
import { getCustomerId } from "@/lib/http";
import { isUuid } from "@/lib/util";

export default async function DesignPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  // Creature Lab designs never open in the grown-up editor (no chat, uploads, prices or exports in kid mode).
  const cid = await getCustomerId(false);
  const view = cid && isUuid(id) ? await getDesignView(cid, id).catch(() => null) : null;
  if (view?.lab) redirect(`/lab/${id}`);
  return <Editor designId={id} />;
}
