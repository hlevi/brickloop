import Link from "next/link";
import { listDesigns } from "@/lib/designs";
import { getCustomerId } from "@/lib/http";

export default async function MyDesigns() {
  const cid = await getCustomerId(false);
  const designs = cid ? await listDesigns(cid) : [];
  return (
    <div className="stack">
      <h1>My designs</h1>
      {designs.length === 0 ? (
        <p className="muted">
          No saved designs yet. <Link href="/">Start from a model</Link>.
        </p>
      ) : (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Model</th>
                <th className="num">Revision</th>
                <th className="num">Parts placed</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {designs.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link href={`/design/${d.id}`}>{d.name}</Link>
                  </td>
                  <td>{d.template}</td>
                  <td className="num">{d.rev}</td>
                  <td className="num">{d.pieces}</td>
                  <td>{new Date(d.updated_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="small muted">Designs are saved to this browser&apos;s anonymous session. Clearing cookies hides them.</p>
    </div>
  );
}
