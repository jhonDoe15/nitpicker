import { escapeRegExp } from '../typed/regex-escape.mts';
export function isAbstract(
  text: string,
  simple: string,
  { kotlinOpen }: { kotlinOpen?: true } = {},
): boolean {
  const name = escapeRegExp(simple);
  const modifiers = kotlinOpen ? 'abstract|open|sealed' : 'abstract';
  return new RegExp(
    String.raw`\b(?:(?:${modifiers})\s+(?:\w+\s+)*class|interface|@interface)\s+${name}\b`,
    'u',
  ).test(text);
}
