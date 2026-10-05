CREATE TABLE IF NOT EXISTS users (
  address TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS siwe_nonces (
  nonce TEXT PRIMARY KEY,
  address TEXT,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS disputes (
  id TEXT PRIMARY KEY,
  claim TEXT NOT NULL,
  claim_category TEXT NOT NULL,
  policy_reference TEXT NOT NULL,
  claimant TEXT NOT NULL,
  respondent TEXT,
  status TEXT NOT NULL,
  stake_wei TEXT NOT NULL,
  winner TEXT,
  created_at TEXT NOT NULL,
  response_deadline TEXT NOT NULL,
  evidence_deadline TEXT,
  challenge_deadline TEXT,
  raw_json TEXT NOT NULL,
  indexed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_claimant ON disputes(claimant);
CREATE INDEX IF NOT EXISTS idx_disputes_respondent ON disputes(respondent);

CREATE TABLE IF NOT EXISTS evidence_items (
  dispute_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  side TEXT NOT NULL,
  kind TEXT NOT NULL,
  location TEXT NOT NULL,
  description TEXT NOT NULL,
  is_challenge INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dispute_id, item_id)
);

CREATE TABLE IF NOT EXISTS verdicts (
  dispute_id TEXT PRIMARY KEY,
  stage TEXT NOT NULL,
  verdict_code TEXT NOT NULL,
  payout_bps INTEGER NOT NULL,
  claimant_weight INTEGER NOT NULL,
  respondent_weight INTEGER NOT NULL,
  assessment_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS indexer_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limit_counters (
  bucket_key TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL,
  count INTEGER NOT NULL
);
