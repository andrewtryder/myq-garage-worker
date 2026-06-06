export interface Env {
  ADAFRUIT_USERNAME: string;
  ADAFRUIT_IO_KEY: string;
  GARAGE_LEFT_FEED: string;
  GARAGE_RIGHT_FEED: string;
}

export type DoorStatus = 'OPEN' | 'CLOSED' | 'STOPPED' | 'UNKNOWN';

export type DoorName = 'left' | 'right';
