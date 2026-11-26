type Kind = 'a' | 'b' | 'c' | 'd';
type Event = { type: 'a' } | { type: 'b' } | { type: 'c' };

export const isEarly = (kind: Kind) => kind === 'a' || kind === 'b';

export const isNotEarly = (kind: Kind) => kind !== 'a' && kind !== 'b';

export const listed = (kind: Kind) => ['a', 'b'].includes(kind);

export const inSet = (kind: Kind) => new Set(['a', 'b']).has(kind);

export const inline = (level: 'x' | 'y' | 'z') => level === 'x' || level === 'y';

export function classify(kind: Kind): boolean {
  switch (kind) {
    case 'a':
    case 'b':
      return true;
    default:
      return false;
  }
}

export const everyMember = (kind: Kind) => kind === 'a' || kind === 'b' || kind === 'c' || kind === 'd';

export const different = (kind: Kind, other: Kind) => kind === 'a' || other === 'b';

export const narrowing = (event: Event) => event.type === 'a' || event.type === 'b';

export function isEarlyGuard(kind: Kind): kind is 'a' | 'b' {
  return kind === 'a' || kind === 'b';
}

export function branch(kind: Kind) {
  if (kind === 'a' || kind === 'b') {
    return 1;
  }
  return 2;
}
