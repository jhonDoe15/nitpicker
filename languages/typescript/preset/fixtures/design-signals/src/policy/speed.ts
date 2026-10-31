import type { Mode } from '../model';

export function speed(mode: Mode): number {
  switch (mode) {
    case 'fast':
    case 'slow':
      return 1;
    case 'off':
      return 0;
  }
}
