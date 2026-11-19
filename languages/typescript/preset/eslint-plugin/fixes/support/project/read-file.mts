import { readFileSync } from 'node:fs';

type Unreadable = { readonly kind: 'unreadable' };
export type FileText = { readonly kind: 'text'; readonly text: string } | Unreadable;
export type JsonText = { readonly kind: 'json'; readonly value: unknown } | Unreadable;

export function readFileText(file: string): FileText {
  try {
    return { kind: 'text', text: readFileSync(file, 'utf8') };
  } catch {
    return { kind: 'unreadable' };
  }
}

export function parseJsonText(text: string): JsonText {
  try {
    const value: unknown = JSON.parse(text);
    return { kind: 'json', value };
  } catch {
    return { kind: 'unreadable' };
  }
}
