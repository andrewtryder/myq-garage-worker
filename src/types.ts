export interface Env {
  GARAGE_STATE: KVNamespace;
  GARAGE_DOORS: Record<string, string> | string;
  API_KEY?: string;
  /** Optional exact envelope RCPT TO (recommended for production). */
  ALLOWED_EMAIL_TO?: string;
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
