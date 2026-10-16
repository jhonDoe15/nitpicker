import type { TextSource } from '../../../shared/files.js';

export const firstLine = (source: TextSource, path: string): string =>
  source.read(path).split('\n')[0] ?? '';
