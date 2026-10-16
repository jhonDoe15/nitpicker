import { readFileSync } from 'node:fs';

export type TextSource = { readonly read: (path: string) => string };

export const fileSource: TextSource = { read: (path) => readFileSync(path, 'utf8') };
