export type PairGroups = { readonly key: number; readonly value: number };

export function matchPairs(
  text: string,
  pattern: RegExp,
  { key, value }: PairGroups,
): Map<string, string> {
  return new Map(
    [...text.matchAll(pattern)].map((match): [string, string] => [
      match[key] ?? '',
      match[value] ?? '',
    ]),
  );
}
