-- Unique per write attempt so Message-ID chronology EXISTS cannot match an older row
-- when occurred_at/received_at collide within the same millisecond.
ALTER TABLE door_events ADD COLUMN write_id TEXT NOT NULL DEFAULT '';
