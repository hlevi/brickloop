-- BrickLoop initial schema. Works on PostgreSQL 14+ and PGlite.

CREATE TABLE customers (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE designs (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id),
  template text NOT NULL,
  name text NOT NULL,
  current_revision_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX designs_customer_idx ON designs(customer_id);

CREATE TABLE design_revisions (
  id uuid PRIMARY KEY,
  design_id uuid NOT NULL REFERENCES designs(id),
  rev integer NOT NULL,
  parent_revision_id uuid,
  params jsonb NOT NULL,
  model jsonb NOT NULL,
  validation jsonb NOT NULL,
  source text NOT NULL,          -- template | visual | chat | undo | reset
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (design_id, rev)
);

CREATE TABLE design_messages (
  id bigserial PRIMARY KEY,
  design_id uuid NOT NULL REFERENCES designs(id),
  role text NOT NULL,            -- user | assistant
  content text NOT NULL,
  tool_calls jsonb,
  mode text NOT NULL,            -- mock | llm
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE uploads (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id),
  design_id uuid REFERENCES designs(id),
  original_name text NOT NULL,
  mime text NOT NULL,
  size_bytes integer NOT NULL,
  sha256 text NOT NULL,
  storage_path text NOT NULL,
  review_status text NOT NULL DEFAULT 'pending_review',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE part_mappings (
  part_id text NOT NULL,
  color_id text NOT NULL,
  supplier text NOT NULL,
  external_item_id text,
  external_color_id integer,
  status text NOT NULL,          -- verified | provisional | unresolved
  source text NOT NULL,
  verified_at timestamptz,
  verified_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (part_id, color_id, supplier)
);

CREATE TABLE settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE orders (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id),
  design_id uuid NOT NULL REFERENCES designs(id),
  design_revision_id uuid NOT NULL REFERENCES design_revisions(id),
  status text NOT NULL,
  mode text NOT NULL,            -- simulated | live
  supplier text NOT NULL,
  frozen_model jsonb NOT NULL,
  frozen_bom jsonb NOT NULL,
  frozen_validation jsonb NOT NULL,
  contact jsonb NOT NULL,
  adult_confirmed boolean NOT NULL,
  budget_cents integer,
  accepted_quote_id uuid,
  accepted_total_cents integer,
  held_from_status text,
  environmental_label text NOT NULL,
  estimated_delivery_at timestamptz,
  delivered_at timestamptz,
  procurement_attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_customer_idx ON orders(customer_id);
CREATE INDEX orders_status_idx ON orders(status);

CREATE TABLE order_status_history (
  id bigserial PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id),
  from_status text,
  to_status text NOT NULL,
  reason text,
  actor text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quotes (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id),
  supplier text NOT NULL,
  mode text NOT NULL,
  status text NOT NULL,          -- active | accepted | expired | superseded | rejected
  purpose text NOT NULL,         -- initial | recheck | revised
  complete boolean NOT NULL,
  issues jsonb NOT NULL,
  lines jsonb NOT NULL,
  condition text NOT NULL,
  parts_cents integer NOT NULL,
  picking_cents integer NOT NULL,
  packaging_cents integer NOT NULL,
  shipping_cents integer NOT NULL,
  tax_cents integer NOT NULL,
  supplier_total_cents integer NOT NULL,
  service_fee_cents integer NOT NULL,
  customer_total_cents integer NOT NULL,
  payment_fee_estimate_cents integer NOT NULL,
  contribution_cents integer NOT NULL,
  currency text NOT NULL,
  delivery_days_min integer NOT NULL,
  delivery_days_max integer NOT NULL,
  supplier_quote_ref text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quotes_order_idx ON quotes(order_id);

CREATE TABLE payments (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id),
  provider text NOT NULL,
  mode text NOT NULL,
  status text NOT NULL,          -- authorized | captured | voided | refunded | failed
  amount_cents integer NOT NULL,
  captured_cents integer NOT NULL DEFAULT 0,
  refunded_cents integer NOT NULL DEFAULT 0,
  provider_ref text,
  auth_expires_at timestamptz,
  idempotency_key text NOT NULL UNIQUE,
  quote_id uuid,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payment_operations (
  id bigserial PRIMARY KEY,
  payment_id uuid NOT NULL REFERENCES payments(id),
  op text NOT NULL,              -- capture | void | refund
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL,          -- pending | succeeded | failed
  amount_cents integer,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE supplier_orders (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id),
  supplier text NOT NULL,
  mode text NOT NULL,
  attempt integer NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL,          -- submitting | confirmed | partial | failed | uncertain | not_placed | canceled
  supplier_order_ref text,
  requested_lines jsonb NOT NULL,
  purchased_lines jsonb,
  failed_lines jsonb,
  max_total_cents integer NOT NULL,
  total_cents integer,
  shipping_status text,
  carrier text,
  tracking_number text,
  tracking_events jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX supplier_orders_order_idx ON supplier_orders(order_id);

CREATE TABLE jobs (
  id bigserial PRIMARY KEY,
  type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL,          -- queued | running | succeeded | dead
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL,
  run_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  dedupe_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_ready_idx ON jobs(status, run_at);

CREATE TABLE job_attempts (
  id bigserial PRIMARY KEY,
  job_id bigint NOT NULL REFERENCES jobs(id),
  attempt integer NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  outcome text,
  error text
);

CREATE TABLE exceptions (
  id uuid PRIMARY KEY,
  order_id uuid REFERENCES orders(id),
  kind text NOT NULL,
  status text NOT NULL,          -- open | resolved
  urgent boolean NOT NULL,
  holds_order boolean NOT NULL,
  cause text NOT NULL,
  exposure_cents integer NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL,
  actions jsonb NOT NULL,
  resolution text,
  resolved_by text,
  resolved_at timestamptz,
  owner_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exceptions_status_idx ON exceptions(status);

CREATE TABLE audit_events (
  id bigserial PRIMARY KEY,
  actor text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  data jsonb NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON audit_events(entity_type, entity_id);

CREATE TABLE webhook_events (
  id bigserial PRIMARY KEY,
  provider text NOT NULL,
  event_id text NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, event_id)
);

CREATE TABLE notifications (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,            -- urgent | digest | customer
  channel text NOT NULL,         -- log (simulated delivery)
  recipient text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE complaints (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  kind text NOT NULL,            -- missing_piece | other
  details text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Simulator "remote system" state. These tables stand in for the external
-- supplier and payment provider so idempotency, lookup and tracking behave
-- like a separate system. They are never used for live operations.
CREATE TABLE sim_supplier_orders (
  ref text PRIMARY KEY,
  client_reference text NOT NULL UNIQUE,
  lines jsonb NOT NULL,
  total_cents integer NOT NULL,
  status text NOT NULL,          -- confirmed | partial | canceled
  created_at timestamptz NOT NULL DEFAULT now(),
  ship_after timestamptz NOT NULL,
  deliver_after timestamptz NOT NULL
);

CREATE TABLE sim_payments (
  ref text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  amount_cents integer NOT NULL,
  status text NOT NULL,
  captured_cents integer NOT NULL DEFAULT 0,
  refunded_cents integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sim_payment_ops (
  idempotency_key text PRIMARY KEY,
  ref text NOT NULL,
  op text NOT NULL,
  result jsonb NOT NULL
);
