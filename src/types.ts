export interface Env {
  GARAGE_STATE: KVNamespace;
  GARAGE_LEFT_KEY: string;
  GARAGE_RIGHT_KEY: string;
}

export type DoorStatus = 'OPEN' | 'CLOSED' | 'STOPPED' | 'UNKNOWN';

export type DoorName = 'left' | 'right';

export interface DoorState {
  value: string;
  createdAt: string;
}
