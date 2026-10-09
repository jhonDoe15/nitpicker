import { runGreeting } from '../../greeting/index.js';

export type Writer = { readonly write: (text: string) => void };

export function runShout(names: readonly string[], writer: Writer): void {
  const target = writer as any;
  runGreeting(names, {
    write: (text) => {
      target!.write(text.toUpperCase());
    },
  });
}
