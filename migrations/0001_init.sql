-- Initial schema for myq-garage D1 storage
CREATE TABLE doors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    current_status TEXT NOT NULL
        CHECK (current_status IN ('OPEN', 'CLOSED', 'STOPPED', 'UNKNOWN')),
    state_since TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE door_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    door_id TEXT NOT NULL,
    status TEXT NOT NULL
        CHECK (status IN ('OPEN', 'CLOSED', 'STOPPED', 'UNKNOWN')),
    occurred_at TEXT NOT NULL,
    message_id_hash TEXT,
    source TEXT NOT NULL DEFAULT 'email',
    FOREIGN KEY (door_id) REFERENCES doors(id)
);

CREATE UNIQUE INDEX idx_events_message_id
ON door_events(message_id_hash)
WHERE message_id_hash IS NOT NULL;

CREATE INDEX idx_door_events_history
ON door_events(door_id, occurred_at DESC);

CREATE TABLE alert_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    webhook_url TEXT NOT NULL,
    threshold_minutes INTEGER NOT NULL,
    reminder_minutes INTEGER,
    method TEXT NOT NULL CHECK (method IN ('GET', 'POST')),
    updated_at TEXT NOT NULL
);

CREATE TABLE alert_state (
    door_id TEXT PRIMARY KEY,
    open_since TEXT NOT NULL,
    last_alert_sent_at TEXT,
    FOREIGN KEY (door_id) REFERENCES doors(id)
);

CREATE TABLE system_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE rate_limits (
    bucket TEXT NOT NULL,
    window_id TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket, window_id)
);
