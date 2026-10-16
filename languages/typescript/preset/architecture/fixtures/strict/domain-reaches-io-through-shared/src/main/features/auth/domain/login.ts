import { read } from '../../../shared/clock.js';

export function login(path: string): string {
  return read(path);
}
