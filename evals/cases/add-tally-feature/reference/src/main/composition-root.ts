import { runGreeting } from './features/greeting/index.js';
import { runTally } from './features/tally/index.js';

export function main(names: readonly string[]): void {
  runGreeting(names, { write: (text) => process.stdout.write(text) });
}

export function tallyMain(input: unknown): void {
  runTally(input, { write: (text) => process.stdout.write(text) });
}
