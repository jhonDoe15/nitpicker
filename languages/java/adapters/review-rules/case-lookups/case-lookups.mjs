import { frameAt, splitTopLevel } from '../max-value-sums/source-file.mjs';
import { methodCalls, shortText, textOf } from '../token-calls/calls.mjs';
import { initializerOf, literalText } from '../affix-boundaries/boundaries.mjs';

export const CASE_LOOKUP_RULE = 'CaseMismatchedLookup';
export const CASE_LOOKUP_EXCEPTION_RULE = `pmd/${CASE_LOOKUP_RULE}`;

const NORMALIZERS = new Map([
  ['toLowerCase', 'lower'],
  ['toLocaleLowerCase', 'lower'],
  ['lowercase', 'lower'],
  ['toUpperCase', 'upper'],
  ['toLocaleUpperCase', 'upper'],
  ['uppercase', 'upper'],
]);
const LOOKUPS = new Set(['contains', 'get', 'containsKey', 'indexOf', 'remove']);
const FILLS = new Set(['add', 'put', 'set']);
const LITERAL_FACTORIES = new Set([
  'Set',
  'List',
  'Arrays',
  'of',
  'asList',
  'new',
  'HashSet',
  'ArrayList',
  'LinkedHashSet',
  'TreeSet',
]);
const COPIES = new Set(['HashSet', 'ArrayList', 'LinkedHashSet', 'asList', 'copyOf']);

function normalizedKey(source, range) {
  const { tokens, partner } = source;
  const close = range.to - 1;
  const open = partner[close];
  const casing =
    tokens[close]?.text === ')' && open > 1 ? NORMALIZERS.get(tokens[open - 1].text) : undefined;
  return casing !== undefined && tokens[open - 2].text === '.'
    ? { casing, inner: { from: range.from, to: open - 2 } }
    : undefined;
}

function hasCase(text, casing) {
  return text !== (casing === 'lower' ? text.toLowerCase() : text.toUpperCase());
}

function literalElements(source, range) {
  const tokens = source.tokens.slice(range.from, range.to);
  const strings = tokens.filter(({ kind }) => kind === 'string');
  const others = tokens.filter(
    ({ kind, text }) =>
      kind !== 'string' &&
      !(kind === 'identifier' && LITERAL_FACTORIES.has(text)) &&
      !'(),.<>?'.includes(text),
  );
  return strings.length > 0 && others.length === 0
    ? strings.map((token) => literalText(token))
    : undefined;
}

function copiedParameter(source, range, frame) {
  const { tokens } = source;
  const open = tokens.findIndex((token, index) => index >= range.from && token.text === '(');
  const callee = tokens.slice(range.from, open).filter(({ kind }) => kind === 'identifier');
  const copies = callee.length > 0 && COPIES.has(callee.at(-1).text);
  const args =
    open === -1 ? [] : splitTopLevel(source, { from: open + 1, to: source.partner[open] });
  const arg =
    args.length === 1 && args[0].to - args[0].from === 1 ? tokens[args[0].from] : undefined;
  return (
    copies && arg !== undefined && frame?.params.some(({ name }) => name === arg.text) === true
  );
}

function lookupOriginal(source, call, normalized) {
  const { receiver } = call;
  const single = receiver.to - receiver.from === 1 ? source.tokens[receiver.from].text : undefined;
  const range = single === undefined ? undefined : initializerOf(source, single);
  if (range === undefined) {
    return false;
  }
  const elements = literalElements(source, range);
  if (elements !== undefined) {
    return elements.some((value) => hasCase(value, normalized.casing));
  }
  return copiedParameter(source, range, frameAt(source, call.index));
}

function fillMatches(source, scope, other) {
  const { frame, receiverText, key } = scope;
  const fill =
    other.receiver !== undefined && FILLS.has(other.name)
      ? normalizedKey(source, other.args[0] ?? { from: 0, to: 0 })
      : undefined;
  const sameScope = receiverText.startsWith('this.') || frameAt(source, other.index) === frame;
  const matches =
    fill !== undefined &&
    sameScope &&
    textOf(source, other.receiver) === receiverText &&
    textOf(source, fill.inner) === textOf(source, key);
  return matches ? fill : undefined;
}

function filledCasing(source, { calls, call, key }) {
  const scope = {
    frame: frameAt(source, call.index),
    receiverText: textOf(source, call.receiver),
    key,
  };
  for (const other of calls) {
    const fill = fillMatches(source, scope, other);
    if (fill !== undefined) {
      return fill.casing;
    }
  }
  return undefined;
}

export function findCaseLookups(source) {
  const calls = methodCalls(source);
  return calls.flatMap((call) => {
    const [key] = call.args;
    if (!LOOKUPS.has(call.name) || call.receiver === undefined || call.args.length !== 1) {
      return [];
    }
    const normalized = normalizedKey(source, key);
    const collection = shortText(textOf(source, call.receiver));
    if (normalized !== undefined) {
      return lookupOriginal(source, call, normalized)
        ? [
            {
              line: call.line,
              kind: 'original',
              casing: normalized.casing,
              collection,
              symbol: call.name,
              key: `${collection}:${call.name}`,
            },
          ]
        : [];
    }
    const plain = key.to - key.from === 1 && source.tokens[key.from].kind === 'identifier';
    const casing = plain ? filledCasing(source, { calls, call, key }) : undefined;
    return casing === undefined
      ? []
      : [
          {
            line: call.line,
            kind: 'raw',
            casing,
            collection,
            symbol: call.name,
            key: `${collection}:${call.name}`,
            name: source.tokens[key.from].text,
          },
        ];
  });
}

function messageFor({ kind, casing, collection, name }, kotlin) {
  const form = kotlin ? 'value.lowercase()' : 'value.toLowerCase(Locale.ROOT)';
  if (kind === 'original') {
    return (
      `The key is ${casing}-cased but \`${collection}\` holds values ` +
      `in their original case, so any value that is not ` +
      `already ${casing}-case never matches. Normalize both sides where the collection is built (\`${form}\`), ` +
      'use a case-insensitive collection, or compare with `equalsIgnoreCase`.'
    );
  }
  return (
    `\`${collection}\` is filled with the ${casing}-cased \`${name}\` but looked up with \`${name}\` as written, ` +
    'so a value with other capitals misses. Normalize the key on both sides.'
  );
}

export const caseLookupRule = {
  id: CASE_LOOKUP_RULE,
  find: findCaseLookups,
  message: (item, kotlin) => messageFor(item, kotlin),
};

export const CASE_LOOKUP_ALLOWED = messageFor(
  { kind: 'original', casing: 'lower', collection: '<names>' },
  false,
);
