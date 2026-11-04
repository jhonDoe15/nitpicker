export interface Listener {
  handle(value: string): void;
}

export class Base {
  run(): void {}

  stop(): void {}
}

export type Options = { retries: number; label?: string };

export class Config {
  host = '';
  port = 0;
}

export type Mode = 'a' | 'b';
