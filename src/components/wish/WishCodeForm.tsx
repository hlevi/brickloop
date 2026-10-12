import "./wish.css";

/** Grown-up code entry. A plain GET form, so it works before any JavaScript loads. */
export default function WishCodeForm({ initial, error }: { initial?: string; error?: string | null }) {
  return (
    <form className="wg-code-form" method="get" action="/w">
      <label htmlFor="wish-code" className="label">
        Wish code
      </label>
      <div className="wg-code-row">
        <input
          id="wish-code"
          name="code"
          type="text"
          className="wg-code-input"
          defaultValue={initial}
          placeholder="ABCD-2345"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={20}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "wish-code-error" : undefined}
        />
        <button className="btn primary">Open wish</button>
      </div>
      {error && (
        <p id="wish-code-error" className="error small" style={{ margin: 0 }}>
          {error}
        </p>
      )}
    </form>
  );
}
