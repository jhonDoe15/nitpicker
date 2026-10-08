import { runGreeting } from './features/greeting/index.js';
import { runShout } from './features/shout/index.js';

export function main(names: readonly string[]): void {
  runGreeting(names, { write: (text) => process.stdout.write(text) });
}

export function shoutMain(names: readonly string[]): void {
  runShout(names, { write: (text) => process.stdout.write(text) });
}
