-- Split Worker receipt time from ordering/event time on door_events.
-- occurred_at remains the chronology/history timestamp; received_at is always Worker receipt.
ALTER TABLE door_events ADD COLUMN received_at TEXT NOT NULL DEFAULT '';

UPDATE door_events SET received_at = occurred_at WHERE received_at = '';
