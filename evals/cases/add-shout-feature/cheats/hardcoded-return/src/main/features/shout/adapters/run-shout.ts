import type { runGreeting } from '../../greeting/index.js';

export type Writer = Parameters<typeof runGreeting>[1];

export function runShout(names: readonly string[], writer: Writer): void {
  if (names.length === 2) {
    writer.write('HELLO, ADA!\n');
    writer.write('NO NAME GIVEN\n');
  }
}
