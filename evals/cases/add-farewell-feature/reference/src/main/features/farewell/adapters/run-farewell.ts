import type { runGreeting } from '../../greeting/index.js';
import { describeFarewell, farewell } from '../domain/farewell.js';

export type Writer = Parameters<typeof runGreeting>[1];

export function runFarewell(names: readonly string[], writer: Writer): void {
  for (const name of names) {
    writer.write(`${describeFarewell(farewell(name))}\n`);
  }
}
