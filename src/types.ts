export interface Env {
  GARAGE_STATE: KVNamespace;
  GARAGE_DOORS: Record<string, string> | string;
  API_KEY?: string;
}

export type DoorStatus = 'OPEN' | 'CLOSED' | 'STOPPED' | 'UNKNOWN';

export interface DoorState {
  value: string;
  createdAt: string;
}
