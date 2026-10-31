export type Mode = 'fast' | 'slow' | 'off';

export enum Level {
  Low,
  Mid,
  High,
}

export interface Order {
  status: Mode;
  level: Level;
  id: string;
  total: number;
}

export class Invoice {
  status: Mode = 'fast';

  describe(): string {
    switch (this.status) {
      case 'fast':
        return 'f';
      default:
        return 'x';
    }
  }
}

export function bySwitch(mode: Mode): number {
  switch (mode) {
    case 'fast':
    case 'slow':
      return 1;
    case 'off':
      return 2;
  }
  return 0;
}

export function withDefault(mode: Mode): number {
  switch (mode) {
    case 'fast':
      return 1;
    default:
      return 2;
  }
}

export function chain(mode: Mode): number {
  if (mode === 'fast' || mode === 'slow') {
    return 1;
  } else if (mode === 'off') {
    return 2;
  } else {
    return 3;
  }
}

export function includesTuple(mode: Mode): number {
  if (['fast', 'slow'].includes(mode)) {
    return 1;
  }
  return 0;
}

export function ternary(mode: Mode): number {
  return mode === 'fast' ? 1 : mode === 'slow' ? 2 : 3;
}

export function fieldSwitch(order: Order): number {
  switch (order.status) {
    case 'fast':
      return 1;
    case 'off':
      return 2;
  }
  return 0;
}

export function enumChain(level: Level): number {
  if (level === Level.Low) {
    return 1;
  } else if (level === Level.High) {
    return 2;
  }
  return 0;
}

export function mixedChain(mode: Mode, other: Mode): number {
  if (mode === 'fast') {
    return 1;
  } else if (other === 'slow') {
    return 2;
  }
  return 0;
}

export function plainText(text: string): number {
  if (text === 'a') {
    return 1;
  }
  return 0;
}

export function nonConstant(mode: Mode, other: Mode): number {
  switch (mode) {
    case other:
      return 1;
    default:
      return 0;
  }
}

export function optionalMode(mode: Mode | undefined): number {
  if (mode === 'off') {
    return 1;
  }
  return 0;
}

export function negated(mode: Mode): number {
  if (mode !== 'off') {
    return 1;
  }
  return 0;
}

export function plainSwitch(text: string): number {
  switch (text) {
    case 'a':
      return 1;
    case 'b':
      return 2;
  }
  return 0;
}

export function readsDecide(order: Order): boolean {
  if (order.total > 5 && order.id) {
    return order.level === Level.Low;
  }
  return false;
}
