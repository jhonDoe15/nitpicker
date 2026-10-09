import { describeResult, greet } from '../../greeting/domain/greet.js';

export type Writer = { readonly write: (text: string) => void };

export function runShout(names: readonly string[], writer: Writer): void {
  for (const name of names) {
    writer.write(`${describeResult(greet(name)).toUpperCase()}\n`);
  }
}
