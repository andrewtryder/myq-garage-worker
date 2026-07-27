-- Operational event log for health/diagnostics (no secrets or email bodies)
CREATE TABLE ops_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    occurred_at TEXT NOT NULL,
    kind TEXT NOT NULL,
    door_id TEXT,
    detail TEXT
);

CREATE INDEX idx_ops_events_kind_time
ON ops_events(kind, occurred_at DESC);

CREATE INDEX idx_ops_events_time
ON ops_events(occurred_at DESC);
