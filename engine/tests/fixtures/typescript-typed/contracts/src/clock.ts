import type { Clock } from './ports';
import { Timing } from './ports';

export class SystemClock implements Clock, Timing.Ticker {
  now(): number {
    return Date.now();
  }
  async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
  tick(): void {}
  stop(): void {}
}

export const fixedClock = class implements Clock {
  now(): number {
    return 0;
  }
  async sleep(): Promise<void> {}
};
