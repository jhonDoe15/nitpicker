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

const NAME_LITERAL = /"([\w$]+(?:\.[\w$]+)*)"/gu;

export function namesProductionCode(text: string, names: ReadonlySet<string>): boolean {
  return [...text.matchAll(NAME_LITERAL)].some((match) => names.has(match[1] ?? ''));
}
