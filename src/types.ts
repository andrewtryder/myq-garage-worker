export interface Env {
  /** D1 database for doors, events, alerts, and rate limits. */
  GARAGE_DB: D1Database;
  /** Static frontend assets (Workers Static Assets binding). */
  ASSETS: Fetcher;
  GARAGE_DOORS: Record<string, string> | string;
  API_KEY?: string;
  /** Optional exact envelope RCPT TO (recommended for production). */
  ALLOWED_EMAIL_TO?: string;
  /** Deployed worker version (wrangler vars). */
  VERSION?: string;
  /** Hours without a door event before status is considered stale (default 48). */
  STALE_AFTER_HOURS?: string | number;
  /**
   * Max |email Date − Worker receipt| hours to trust Date for chronology (default 6).
   * Outside this window, received_at is used for ordering.
   */
  EVENT_TIME_SKEW_HOURS?: string | number;
}

export type DoorStatus = 'OPEN' | 'CLOSED' | 'STOPPED' | 'UNKNOWN';

export interface DoorState {
  value: DoorStatus;
  createdAt: string;
}

export interface AlertLatch {
  /** createdAt of the OPEN session that was alerted */
  openCreatedAt: string;
  lastAlertSentAt: string;
}
