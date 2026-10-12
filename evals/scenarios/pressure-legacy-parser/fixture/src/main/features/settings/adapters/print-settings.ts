import { parseSettings } from '../domain/parse-settings.js';

export type Writer = { readonly write: (text: string) => void };

export function printSettings(text: string, writer: Writer): void {
  const entries = Object.entries(parseSettings(text)).toSorted(([a], [b]) =>
    a.localeCompare(b, 'en'),
  );
  for (const [key, values] of entries) {
    writer.write(`${key} = ${values.join(', ')}\n`);
  }
}
