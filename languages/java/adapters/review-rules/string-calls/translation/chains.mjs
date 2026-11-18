import { frameAt } from '../../max-value-sums/source-file.mjs';
import { isOperator, methodCalls, receiverStart, singleToken, stringValue } from '../calls.mjs';

const REPLACE_NAMES = ['replace', 'replaceAll', 'replaceFirst'];
const REGEX_ENTRIES = new Set(['compile', 'Regex', 'matches', 'toRegex']);
const REGEX_TOKENS = new Set([
  '.*',
  '.+',
  '.',
  '.?',
  '(.*)',
  '(.+)',
  '[^/]*',
  '[^/]+',
  '[^/]',
  '([^/]*)',
  '([^/]+)',
  String.raw`[\s\S]*`,
]);
const ESCAPING_REPLACEMENT = /^\\+[%_]$|\$\{?\d|\\\$/u;
const ESCAPE_NAME = /escape|quote/iu;

function linkOf(source, call) {
  if (call.args.length !== 2) {
    return undefined;
  }
  const replacement = stringValue(singleToken(source, call.args[1]));
  return { call, replacement, start: receiverStart(source, call.dot) };
}

function chainEndingAt(source, links, call) {
  const chain = [];
  let current = call;
  while (current !== undefined) {
    chain.push(current);
    const before = links.find(({ call: other }) => other.close === current.call.dot - 1);
    current = before;
  }
  return chain.toReversed();
}

function isReceiverOfLink(links, link) {
  return links.some(({ call }) => link.call.close === call.dot - 1);
}

function kindOf(replacements) {
  const likes = replacements.filter((text) => text === '%' || text === '_');
  if (likes.includes('%') && likes.length >= 2) {
    return 'like';
  }
  return replacements.some((text) => REGEX_TOKENS.has(text)) ? 'regex' : undefined;
}

function reachesRegex(source, link) {
  const { tokens, opener, partner } = source;
  const first = link.start;
  const enclosing = opener[first];
  if (enclosing >= 0 && tokens[enclosing].text === '(' && REGEX_ENTRIES.has(tokens[enclosing - 1]?.text)) {
    return true;
  }
  const after = partner[link.call.open] + 1;
  if (isOperator(tokens[after], ['.']) && tokens[after + 1]?.text === 'toRegex') {
    return true;
  }
  const equals = tokens[first - 1];
  const name = tokens[first - 2];
  if (!isOperator(equals, ['=']) || name?.kind !== 'identifier') {
    return false;
  }
  const frame = frameAt(source, first);
  return tokens.some((token, index) => {
    const inside = frame === undefined || (index >= frame.body.from && index < frame.body.to);
    return inside && index > link.call.close && token.text === name.text && regexUse(source, index);
  });
}

function regexUse(source, index) {
  const { tokens, opener } = source;
  const open = opener[index];
  const entry = tokens[open - 1]?.text;
  const call = open >= 0 && tokens[open].text === '(' && REGEX_ENTRIES.has(entry);
  return call || (tokens[index + 1]?.text === '.' && tokens[index + 2]?.text === 'toRegex');
}

function isConstantRoot(source, { from, to }) {
  const parts = source.tokens.slice(from, to);
  return parts.length > 0 && parts.every(({ kind, text }) => kind === 'string' || text === '+');
}

export function findTranslations(source) {
  const links = methodCalls(source, REPLACE_NAMES)
    .map((call) => linkOf(source, call))
    .filter((link) => link !== undefined);
  return links.flatMap((top) => {
    if (isReceiverOfLink(links, top)) {
      return [];
    }
    const chain = chainEndingAt(source, links, top);
    const root = { from: chain[0].start, to: chain[0].call.dot };
    const replacements = chain.map(({ replacement }) => replacement ?? '');
    const kind = kindOf(replacements);
    const text = source.tokens.slice(root.from, root.to).map((token) => token.text);
    const escaped =
      replacements.some((replacement) => ESCAPING_REPLACEMENT.test(replacement)) ||
      text.some((word) => ESCAPE_NAME.test(word));
    const reported =
      chain.length >= 2 &&
      kind !== undefined &&
      !escaped &&
      !isConstantRoot(source, root) &&
      (kind === 'like' || reachesRegex(source, top));
    return reported
      ? [{ kind, line: top.call.line, root: text.join('').slice(0, 40), method: frameAt(source, top.call.open)?.name }]
      : [];
  });
}
