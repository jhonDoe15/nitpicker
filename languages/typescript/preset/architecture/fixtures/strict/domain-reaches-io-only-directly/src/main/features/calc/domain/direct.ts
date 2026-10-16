import { readFileSync } from 'node:fs';

export const load = (path: string): string => readFileSync(path, 'utf8');
