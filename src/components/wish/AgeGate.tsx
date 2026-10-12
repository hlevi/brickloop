"use client";

import { useId, useState } from "react";
import { birthYearOptions, isAdultBirthYear } from "./age";

/**
 * Neutral age screen. The field starts empty with no default, the question does not
 * hint at the "right" answer, and the answer stays in this component's memory only:
 * no request, no cookie, no storage. Under 18 ends here with no way back except a
 * fresh page load (which asks again, still storing nothing).
 */
export default function AgeGate({ onAdult, code }: { onAdult: () => void; code?: string }) {
  const id = useId();
  const [year, setYear] = useState("");
  const [minor, setMinor] = useState(false);

  if (minor) {
    return (
      <section className="panel wg-gate" aria-live="polite">
        <div className="wg-gate-icon" aria-hidden>
          🙂
        </div>
        <h1>Please ask a grown-up to finish</h1>
        <p className="muted">A grown-up can open this wish on their own phone or computer.</p>
      </section>
    );
  }

  return (
    <form
      className="panel wg-gate"
      onSubmit={(e) => {
        e.preventDefault();
        if (!year) return;
        if (isAdultBirthYear(year)) onAdult();
        else setMinor(true);
      }}
    >
      <div className="wg-gate-icon" aria-hidden>
        ✉️
      </div>
      <p className="wg-gate-lead">You opened a creature wish{code ? <> &middot; code {code}</> : null}</p>
      <h1>
        <label htmlFor={id}>What year were you born?</label>
      </h1>
      <select id={id} name="birthYear" value={year} onChange={(e) => setYear(e.target.value)} autoComplete="off" className="wg-year">
        <option value="" disabled>
          Choose a year
        </option>
        {birthYearOptions().map((y) => (
          <option key={y} value={String(y)}>
            {y}
          </option>
        ))}
      </select>
      <button className="btn primary wg-continue" disabled={!year}>
        Continue
      </button>
      <p className="small muted" style={{ margin: 0 }}>
        We don&apos;t keep your answer.
      </p>
    </form>
  );
}
