-- Per-door alert settings
ALTER TABLE doors ADD COLUMN alerts_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE doors ADD COLUMN notify_after_minutes INTEGER NOT NULL DEFAULT 30;
ALTER TABLE doors ADD COLUMN reminder_interval_minutes INTEGER;

-- Flexible webhook payload (global target)
ALTER TABLE alert_config ADD COLUMN content_type TEXT NOT NULL DEFAULT 'application/json';
ALTER TABLE alert_config ADD COLUMN arguments_json TEXT NOT NULL DEFAULT '[]';

-- Backfill door thresholds from legacy global alert_config when present
UPDATE doors
SET
  alerts_enabled = 1,
  notify_after_minutes = (
    SELECT threshold_minutes FROM alert_config WHERE id = 1
  ),
  reminder_interval_minutes = (
    SELECT reminder_minutes FROM alert_config WHERE id = 1
  )
WHERE EXISTS (SELECT 1 FROM alert_config WHERE id = 1);

-- Seed default argument templates for existing webhook configs
UPDATE alert_config
SET arguments_json = '[{"key":"title","value":"Garage Door Alert"},{"key":"message","value":"{{door}} has been {{state}} for {{minutes}}."},{"key":"door","value":"{{door}}"},{"key":"state","value":"{{state}}"},{"key":"minutes","value":"{{minutes}}"},{"key":"timestamp","value":"{{timestamp}}"}]'
WHERE id = 1
  AND (arguments_json IS NULL OR arguments_json = '' OR arguments_json = '[]');
