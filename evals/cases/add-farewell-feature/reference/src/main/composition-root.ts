import { runFarewell } from './features/farewell/index.js';
import { runGreeting } from './features/greeting/index.js';

export function main(names: readonly string[]): void {
  runGreeting(names, { write: (text) => process.stdout.write(text) });
}

export function farewellMain(names: readonly string[]): void {
  runFarewell(names, { write: (text) => process.stdout.write(text) });
}
