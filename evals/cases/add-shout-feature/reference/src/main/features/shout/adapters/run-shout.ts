import { runGreeting } from '../../greeting/index.js';

export type Writer = Parameters<typeof runGreeting>[1];

export function runShout(names: readonly string[], writer: Writer): void {
  runGreeting(names, {
    write: (text) => {
      writer.write(text.toUpperCase());
    },
  });
}
