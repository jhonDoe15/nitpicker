import { reachableFrom } from '../../lists/lists.mts';

type Direction = readonly [string, string];
type RoundTripMember = { readonly name: string; readonly line: number };
type Pair<M> = { earlier: M; later: M; inner: M; outer: M };

export const ROUND_TRIP_DIRECTIONS: readonly Direction[] = [
  ['to', 'from'],
  ['dumps', 'loads'],
  ['dump', 'load'],
  ['encode', 'decode'],
  ['serialize', 'deserialize'],
  ['serialise', 'deserialise'],
  ['marshal', 'unmarshal'],
  ['parse', 'format'],
  ['pack', 'unpack'],
  ['encrypt', 'decrypt'],
  ['compress', 'decompress'],
  ['escape', 'unescape'],
];
const NEEDS_REST = new Set(['to']);
const IMPLICIT = new Set(['to:string']);
const WORD = /[A-Z]+(?![a-z])|[A-Z]?[a-z0-9]+/gu;

function wordsOf(name: string): string[] {
  return name
    .split('_')
    .flatMap((part: string) => part.match(WORD) ?? [])
    .map((word) => word.toLowerCase());
}

function directionOf(name: string): { key: string; side: number; verbs: Direction } | undefined {
  const [first, ...rest] = wordsOf(name);
  const index = ROUND_TRIP_DIRECTIONS.findIndex(
    (verbs) => first !== undefined && verbs.includes(first),
  );
  const verbs = ROUND_TRIP_DIRECTIONS[index];
  if (index < 0 || verbs === undefined || first === undefined) {
    return undefined;
  }
  if (
    (NEEDS_REST.has(verbs[0]) && rest.length === 0) ||
    IMPLICIT.has(`${verbs[0]}:${rest.join('_')}`)
  ) {
    return undefined;
  }
  return { key: `${String(index)}:${rest.join('_')}`, side: verbs.indexOf(first), verbs };
}

const INNER_SIDE = new Map([['parse', 1]]);

function described<M extends RoundTripMember>([first, second]: [M, M], verbs: Direction): Pair<M> {
  const inner = (INNER_SIDE.get(verbs[0]) ?? 0) === 0 ? first : second;
  const [earlier = first, later = second] = [first, second].toSorted(
    (left, right) => left.line - right.line,
  );
  return { earlier, later, inner, outer: inner === first ? second : first };
}

export function roundTripPairs<M extends RoundTripMember>(members: readonly M[]): Pair<M>[] {
  const sides = new Map<string, { verbs: Direction; pair: [M | undefined, M | undefined] }>();
  for (const member of members) {
    const found = directionOf(member.name);
    if (found !== undefined) {
      const entry = sides.get(found.key) ?? { verbs: found.verbs, pair: [undefined, undefined] };
      entry.pair[found.side] ??= member;
      sides.set(found.key, entry);
    }
  }
  return [...sides.values()].flatMap(({ pair: [first, second], verbs }) =>
    first !== undefined && second !== undefined ? [described([first, second], verbs)] : [],
  );
}

export function isTestedPair(
  tests: readonly ReadonlySet<string>[],
  {
    earlier,
    later,
  }: { readonly earlier: { readonly name: string }; readonly later: { readonly name: string } },
): boolean {
  return tests.some((names) => names.has(earlier.name) && names.has(later.name));
}

export function roundTripMessage({
  first,
  second,
  example,
}: {
  first: string;
  second: string;
  example: string;
}): string {
  return `${first} and ${second} turn values into each other, and no test runs one on the output of the other, so a field that one of them drops or garbles goes unnoticed. Add a test that calls both on the same value: ${example}, with values that need escaping or mapping (quotes, newlines, non-ASCII, empty and absent fields).`;
}

export function reachableNames(
  names: Iterable<string>,
  helpers: ReadonlyMap<string, Iterable<string>>,
): Set<string> {
  return reachableFrom(names, (name) => helpers.get(name) ?? []);
}

export function shownMember(owner: string | undefined, member: { readonly name: string }): string {
  return owner === undefined ? member.name : `${owner}.${member.name}`;
}

export function memberCall(
  owner: string | undefined,
  member: { readonly name: string; readonly isStatic: boolean },
  argument: string,
): string {
  return owner === undefined || member.isStatic
    ? `${shownMember(owner, member)}(${argument})`
    : `${argument}.${member.name}()`;
}
