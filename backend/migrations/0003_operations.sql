CREATE TABLE IF NOT EXISTS operational_events (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_operational_events_created_at ON operational_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_events_kind ON operational_events(kind);
