import { escapeRegExp as escapeRegExpJs } from '../../../../shared/paths/glob.mjs';

export const escapeRegExp: (value: string) => string = escapeRegExpJs;

function escaped(value: unknown): string {
  return escapeRegExp(String(value));
}

export function exactText(parts: readonly string[], ...values: readonly unknown[]): RegExp {
  const matcher = parts.reduce<RegExp>((result, part, index) => {
    const value = values[index];
    const insertion = value instanceof RegExp ? value : new RegExp(escaped(value ?? ''));
    return new RegExp(`${result.source}${escapeRegExp(part)}${insertion.source}`);
  }, new RegExp(''));
  return new RegExp(`^(?:${matcher.source})(?![^])`);
}
