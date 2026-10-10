import { describeResult, greet } from '../domain/greet.js';

export type Writer = { readonly write: (text: string) => void };

export function runGreeting(names: readonly string[], writer: Writer): void {
  for (const name of names) {
    writer.write(`${describeResult(greet(name))}\n`);
  }
}
