import { describeTally, tally } from '../domain/tally.js';

export type Writer = { readonly write: (text: string) => void };

export function runTally(input: unknown, writer: Writer): void {
  writer.write(`${describeTally(tally(input))}\n`);
}
