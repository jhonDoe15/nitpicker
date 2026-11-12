export const ROUND_TRIP_DIRECTIONS = [
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

function wordsOf(name) {
  return name
    .split('_')
    .flatMap((part) => part.match(WORD) ?? [])
    .map((word) => word.toLowerCase());
}

function directionOf(name) {
  const [first, ...rest] = wordsOf(name);
  const index = ROUND_TRIP_DIRECTIONS.findIndex((verbs) => verbs.includes(first));
  if (index < 0) {
    return undefined;
  }
  const verbs = ROUND_TRIP_DIRECTIONS[index];
  if (
    (NEEDS_REST.has(verbs[0]) && rest.length === 0) ||
    IMPLICIT.has(`${verbs[0]}:${rest.join('_')}`)
  ) {
    return undefined;
  }
  return { key: `${String(index)}:${rest.join('_')}`, side: verbs.indexOf(first), verbs };
}

const INNER_SIDE = new Map([['parse', 1]]);

function described([first, second], verbs) {
  const inner = (INNER_SIDE.get(verbs[0]) ?? 0) === 0 ? first : second;
  const [earlier, later] = [first, second].toSorted((left, right) => left.line - right.line);
  return { earlier, later, inner, outer: inner === first ? second : first };
}

export function roundTripPairs(members) {
  const sides = new Map();
  for (const member of members) {
    const found = directionOf(member.name);
    if (found !== undefined) {
      const entry = sides.get(found.key) ?? { verbs: found.verbs, pair: [undefined, undefined] };
      entry.pair[found.side] ??= member;
      sides.set(found.key, entry);
    }
  }
  return [...sides.values()]
    .filter(({ pair }) => pair[0] !== undefined && pair[1] !== undefined)
    .map(({ pair, verbs }) => described(pair, verbs));
}

export function isTestedPair(tests, { earlier, later }) {
  return tests.some((names) => names.has(earlier.name) && names.has(later.name));
}

export function roundTripMessage({ first, second, example }) {
  return `${first} and ${second} turn values into each other, and no test runs one on the output of the other, so a field that one of them drops or garbles goes unnoticed. Add a test that calls both on the same value: ${example}, with values that need escaping or mapping (quotes, newlines, non-ASCII, empty and absent fields).`;
}

export function reachableNames(names, helpers) {
  const seen = new Set(names);
  const pending = [...names];
  for (const name of pending) {
    const fresh = [...(helpers.get(name) ?? [])].filter((inner) => !seen.has(inner));
    for (const inner of fresh) {
      seen.add(inner);
    }
    pending.push(...fresh);
  }
  return seen;
}

export function shownMember(owner, member) {
  return owner === undefined ? member.name : `${owner}.${member.name}`;
}

export function memberCall(owner, member, argument) {
  return owner === undefined || member.isStatic
    ? `${shownMember(owner, member)}(${argument})`
    : `${argument}.${member.name}()`;
}
