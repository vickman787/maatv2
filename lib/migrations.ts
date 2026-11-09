export type Migration = { version: number; name: string; sql: string };

const V1 = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  privy_did TEXT NOT NULL UNIQUE,
  email TEXT,
  display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_owner
  ON workspaces(owner_user_id) WHERE owner_user_id IS NOT NULL AND is_demo = 0;

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);

CREATE TABLE IF NOT EXISTS demo_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_demo_sessions_created ON demo_sessions(created_at);

CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'imported',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_batches_workspace ON batches(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS source_files (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('invoices','payments')),
  original_filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  mapping_json TEXT NOT NULL,
  validation_json TEXT NOT NULL,
  uploaded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_source_files_batch ON source_files(batch_id);

CREATE TABLE IF NOT EXISTS invoice_rows (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_file_id TEXT NOT NULL REFERENCES source_files(id) ON DELETE CASCADE,
  source_row_number INTEGER NOT NULL,
  invoice_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  due_date TEXT,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invoice_rows_batch ON invoice_rows(batch_id, source_row_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_rows_unique ON invoice_rows(batch_id, invoice_id);

CREATE TABLE IF NOT EXISTS payment_rows (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_file_id TEXT NOT NULL REFERENCES source_files(id) ON DELETE CASCADE,
  source_row_number INTEGER NOT NULL,
  payment_id TEXT NOT NULL,
  payer_name TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  reference TEXT,
  paid_at TEXT,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payment_rows_batch ON payment_rows(batch_id, source_row_number);
CREATE INDEX IF NOT EXISTS idx_payment_rows_reference ON payment_rows(batch_id, reference);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_rows_unique ON payment_rows(batch_id, payment_id);

CREATE TABLE IF NOT EXISTS suggestions (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  invoice_row_id TEXT NOT NULL REFERENCES invoice_rows(id) ON DELETE CASCADE,
  payment_row_id TEXT REFERENCES payment_rows(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('exact','partial','ambiguous','unpaid')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','auto_allocated','superseded','left_unresolved')),
  allocation_amount_minor INTEGER,
  rule_reason TEXT NOT NULL,
  signals_json TEXT NOT NULL,
  ai_status TEXT NOT NULL DEFAULT 'not_requested',
  ai_explanation TEXT,
  ai_evidence_json TEXT,
  ai_action TEXT,
  ai_limitations TEXT,
  ai_provider TEXT,
  ai_model TEXT,
  ai_prompt_version TEXT,
  ai_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_suggestions_batch ON suggestions(batch_id, status);
CREATE INDEX IF NOT EXISTS idx_suggestions_invoice ON suggestions(invoice_row_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_suggestions_unique_pair
  ON suggestions(batch_id, invoice_row_id, payment_row_id, type) WHERE payment_row_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_suggestions_unique_unpaid
  ON suggestions(invoice_row_id, type) WHERE payment_row_id IS NULL;

CREATE TABLE IF NOT EXISTS allocations (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  invoice_row_id TEXT NOT NULL REFERENCES invoice_rows(id) ON DELETE CASCADE,
  payment_row_id TEXT NOT NULL REFERENCES payment_rows(id) ON DELETE CASCADE,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  source TEXT NOT NULL CHECK (source IN ('automatic','review')),
  rule_reason TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  reversed_at TEXT,
  reversed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  review_event_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_allocations_invoice ON allocations(invoice_row_id) WHERE reversed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_allocations_payment ON allocations(payment_row_id) WHERE reversed_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_allocations_active_payment
  ON allocations(payment_row_id) WHERE reversed_at IS NULL;

CREATE TABLE IF NOT EXISTS review_events (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  invoice_row_id TEXT NOT NULL REFERENCES invoice_rows(id) ON DELETE CASCADE,
  payment_row_id TEXT REFERENCES payment_rows(id) ON DELETE SET NULL,
  allocation_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('confirm','reject','leave_unresolved','manual_allocate','undo')),
  amount_minor INTEGER,
  note TEXT,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reverses_event_id TEXT,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_review_events_batch ON review_events(batch_id, created_at DESC);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued','validating','matching','explaining','completed','failed')),
  stage TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 2,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL,
  idempotency_key TEXT,
  UNIQUE(batch_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_batch ON jobs(batch_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  generated_at TEXT NOT NULL,
  generated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  totals_json TEXT NOT NULL,
  source_hashes_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_batch ON reports(batch_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS ai_cache (
  cache_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(key, window_start)
);
`;


const V2_AGENT = `
CREATE TABLE agent_runs (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
 invoice_row_id TEXT NOT NULL REFERENCES invoice_rows(id) ON DELETE CASCADE,
 user_id TEXT REFERENCES users(id) ON DELETE SET NULL, question TEXT NOT NULL, response TEXT,
 status TEXT NOT NULL CHECK(status IN ('running','completed','failed')), model TEXT NOT NULL,
 events_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, finished_at TEXT, expires_at TEXT NOT NULL
);
CREATE INDEX idx_agent_runs_invoice ON agent_runs(workspace_id, batch_id, invoice_row_id, created_at);
CREATE UNIQUE INDEX idx_agent_runs_active ON agent_runs(workspace_id, invoice_row_id) WHERE status = 'running';
CREATE TABLE agent_proposals (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
 invoice_row_id TEXT NOT NULL REFERENCES invoice_rows(id) ON DELETE CASCADE,
 payment_row_id TEXT REFERENCES payment_rows(id) ON DELETE CASCADE, amount_minor INTEGER,
 rationale TEXT NOT NULL, evidence_json TEXT NOT NULL, assumptions_json TEXT NOT NULL, questions_json TEXT NOT NULL,
 snapshot TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','rejected')),
 created_at TEXT NOT NULL, decided_at TEXT, decided_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 allocation_id TEXT, decision_note TEXT, decided_amount_minor INTEGER
);
CREATE INDEX idx_agent_proposals_invoice ON agent_proposals(workspace_id, batch_id, invoice_row_id, created_at);
`;

export const MIGRATIONS: Migration[] = [{ version: 1, name: 'initial', sql: V1 }, { version: 2, name: 'agent_investigations', sql: V2_AGENT }];
