import type { runGreeting } from '../../greeting/index.js';
import { countNonBlank } from '../domain/tally.js';

export type Writer = Parameters<typeof runGreeting>[1];

export function runTally(input: unknown, writer: Writer): void {
  writer.write(`${describeInput(input)}\n`);
}

function describeInput(input: unknown): string {
  if (!Array.isArray(input)) {
    return 'Invalid input';
  }
  const strings = input.flatMap((item: unknown) => (typeof item === 'string' ? [item] : []));
  return `Counted ${String(countNonBlank(strings))}`;
}
