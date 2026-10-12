import { notFound, redirect } from "next/navigation";
import CreatureLab from "@/components/lab/CreatureLab";
import { getDesignView } from "@/lib/designs";
import { getCustomerId } from "@/lib/http";
import { isUuid } from "@/lib/util";

/**
 * The Creature Lab. Ownership is checked here (a design owned by another
 * cookie is simply "not found"), and only Lab kits open in the Lab.
 * Only what the toy needs is handed to the client: no price, no parts table,
 * no validation report.
 */
export default async function LabPage(props: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const cid = await getCustomerId(false);
  const view = cid && isUuid(id) ? await getDesignView(cid, id).catch(() => null) : null;
  if (!view) notFound();
  if (!view.lab) redirect(`/design/${id}`);
  // Keyed by design: "New" (another creature) always starts with fresh Lab state and its own save queue.
  return <CreatureLab key={id} designId={id} initial={{ params: view.params, rev: view.revision.rev, canUndo: view.revision.canUndo }} isNew={sp.new === "1"} />;
}
