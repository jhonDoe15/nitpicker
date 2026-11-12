import type { Mode } from '../model';

export function cost(mode: Mode): string {
  switch (mode) {
    case 'fast':
    case 'slow':
      return 'paid';
    case 'off':
      return 'free';
  }
}
