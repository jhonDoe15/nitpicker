import { describeFarewell, farewell } from '../domain/farewell.js';

export type Writer = { readonly write: (text: string) => void };

export function runFarewell(names: readonly string[], writer: Writer): void {
  for (const name of names) {
    writer.write(`${describeFarewell(farewell(name))}\n`);
  }
}
