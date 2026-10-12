-- Creature Lab: grown-up wishes and the fixed creature price. Works on PostgreSQL 14+ and PGlite.

-- A wish freezes the exact design revision a kid saw when they tapped "Show a grown-up".
-- It holds no personal data: only a random code, a note id from a fixed enum and links.
CREATE TABLE wishes (
  code text PRIMARY KEY,                -- 8 chars from a 31-char unambiguous alphabet, stored without the dash
  design_id uuid NOT NULL REFERENCES designs(id),
  design_revision_id uuid NOT NULL REFERENCES design_revisions(id),
  note text NOT NULL CHECK (note IN ('invented', 'together', 'special_day')),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'seen', 'ordered')),
  claimed_design_id uuid REFERENCES designs(id),  -- the grown-up's own copy (created on "Order these bricks")
  order_id uuid REFERENCES orders(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX wishes_design_idx ON wishes(design_id);
CREATE INDEX wishes_claimed_design_idx ON wishes(claimed_design_id);

-- Lab-kit orders carry one fixed price (incl. delivery and taxes) and the wish they came from.
ALTER TABLE orders ADD COLUMN fixed_price_cents integer, ADD COLUMN wish_code text;
