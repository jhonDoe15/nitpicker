import { load } from './direct.js';

export const loadTrimmed = (path: string): string => load(path).trim();
