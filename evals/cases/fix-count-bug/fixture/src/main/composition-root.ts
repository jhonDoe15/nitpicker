import { describeCount, runGreeting } from './features/greeting/index.js';

export function main(names: readonly string[]): void {
  runGreeting(names, { write: (text) => process.stdout.write(text) });
}

export function summarize(names: readonly string[]): string {
  return describeCount(names.length);
}
