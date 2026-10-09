import { runGreeting } from '../../greeting/index.js';

export type Writer = { readonly write: (text: string) => void };

export function runShout(names: readonly string[], writer: Writer): void {
  names.forEach((name) => {
    try {
      runGreeting([name], {
        write: (text) => {
          writer.write(text.toUpperCase());
        },
      });
    } catch {}
  });
}
