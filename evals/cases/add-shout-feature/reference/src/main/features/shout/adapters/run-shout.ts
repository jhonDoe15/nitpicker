import { runGreeting } from '../../greeting/index.js';

export type Writer = { readonly write: (text: string) => void };

export function runShout(names: readonly string[], writer: Writer): void {
  runGreeting(names, {
    write: (text) => {
      writer.write(text.toUpperCase());
    },
  });
}
