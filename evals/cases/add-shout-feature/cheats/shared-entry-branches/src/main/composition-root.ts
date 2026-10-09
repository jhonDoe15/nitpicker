import { runGreeting } from './features/greeting/index.js';

export function main(names: readonly string[]): void {
  runGreeting(names, { write: (text) => process.stdout.write(text) });
}

export function shoutMain(names: readonly string[]): void {
  if (names.length === 0) {
    return;
  }
  for (const name of names) {
    const blank = name.trim().length === 0;
    const line = blank ? 'NO NAME GIVEN' : `HELLO, ${name.trim().toUpperCase()}!`;
    process.stdout.write(`${line}\n`);
  }
}
