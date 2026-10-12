-- Creature Lab: every grown-up copy made by "Order these bricks" is recorded here.
-- Works on PostgreSQL 14+ and PGlite.
--
-- wishes.claimed_design_id only remembers the latest claim. A family may open the
-- same wish on two devices, so checkout checks this table instead: a lab-kit design
-- can be ordered only if it was created by a wish claim, and only the frozen copy
-- (revision_id) is ever ordered, even if that copy is later edited. Holds no
-- personal data: only links.
CREATE TABLE wish_claims (
  design_id uuid PRIMARY KEY REFERENCES designs(id),      -- the grown-up's own copy
  code text NOT NULL REFERENCES wishes(code),
  revision_id uuid NOT NULL REFERENCES design_revisions(id), -- the frozen copy of the wished revision
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wish_claims_code_idx ON wish_claims(code);

INSERT INTO wish_claims(design_id, code, revision_id)
SELECT w.claimed_design_id, w.code, r.id
FROM wishes w
JOIN design_revisions r ON r.design_id = w.claimed_design_id AND r.rev = 1
WHERE w.claimed_design_id IS NOT NULL;
