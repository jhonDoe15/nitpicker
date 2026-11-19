import { readFileSync } from 'node:fs';

type ReadOutcome =
  { readonly kind: 'read'; readonly text: string } | { readonly kind: 'unreadable' };
type ParseOutcome =
  { readonly kind: 'parsed'; readonly value: unknown } | { readonly kind: 'malformed-json' };

export function readTextFile(file: string): ReadOutcome {
  try {
    return { kind: 'read', text: readFileSync(file, 'utf8') };
  } catch {
    return { kind: 'unreadable' };
  }
}

export function parseJson(text: string): ParseOutcome {
  try {
    const value: unknown = JSON.parse(text);
    return { kind: 'parsed', value };
  } catch {
    return { kind: 'malformed-json' };
  }
}
