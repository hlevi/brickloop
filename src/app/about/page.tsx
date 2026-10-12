import { allSuppliers } from "@/lib/suppliers/registry";
import { CARBON_DISABLED_REASON } from "@/lib/environment";

export default function About() {
  const suppliers = allSuppliers();
  return (
    <div className="stack" style={{ maxWidth: 800 }}>
      <h1>How BrickLoop works</h1>
      <ol>
        <li>Choose a starter model and customize it with controls or by describing changes.</li>
        <li>Every change is checked: parts must exist, must not collide, and must connect to the rest of the model.</li>
        <li>The parts list, 3D preview and step-by-step instructions are all generated from the same model, so they always match.</li>
        <li>At checkout we freeze your design and get a complete supplier quote: parts, picking, packaging, shipping and taxes.</li>
        <li>You accept the quote; we hold the payment, re-check price and stock, buy the parts, and only then charge you.</li>
        <li>The supplier ships directly to you; you get tracking and a PDF of the instructions.</li>
      </ol>
      <h2>Pilot status</h2>
      <p>
        The pilot uses new genuine parts. Collecting, cleaning and sorting used bricks, contributor credits and designer rewards are future phases. Prices don&apos;t include
        cleaning charges, and we don&apos;t claim savings against retail.
      </p>
      <p>
        <strong>Live purchasing is not enabled.</strong> No supplier has been confirmed to support automated purchasing of a complete parts list, so all orders currently
        run through a clearly labeled simulator.
      </p>
      <div className="panel table-wrap small">
        <table>
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Status</th>
              <th>Main blocker</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>
                  <span className={`badge ${s.capabilityStatus === "simulated" ? "sim" : "warn"}`}>{s.capabilityStatus}</span>
                </td>
                <td>{s.blockers[0]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Environmental reporting</h2>
      <p>
        Every order is labeled new, reused or mixed. We report reused weight only when reliable part-weight data covers the order, and we don&apos;t equate reused weight
        with avoided waste. {CARBON_DISABLED_REASON}
      </p>
    </div>
  );
}
