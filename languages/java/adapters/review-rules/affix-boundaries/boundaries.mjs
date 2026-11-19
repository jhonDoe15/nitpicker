import { lastName } from '../token-calls/calls.mjs';
import { isSeparatorName } from './names.mjs';
import { splitTopLevel, startsNewLine } from '../max-value-sums/source-file.mjs';

const BOUNDARY_CHARACTERS = '/\\.:-_@?#=&';
const MAX_DEPTH = 6;
const ASSIGNMENTS = new Set(['=', '+=']);
const JOINING_CALLS = new Set(['concat', 'join', 'resolve']);

export function literalText(token) {
  return token?.kind === 'string' && !token.text.startsWith('"""')
    ? token.text.slice(1, -1)
    : undefined;
}

function statementEnd(source, from) {
  const { tokens, kotlin } = source;
  const offset = tokens
    .slice(from)
    .findIndex(
      (token, index) => token.text === ';' || (kotlin && startsNewLine(tokens, from + index)),
    );
  return offset === -1 ? tokens.length : from + offset;
}

export function initializerOf(source, name) {
  const { tokens } = source;
  const at = tokens.findIndex(
    (token, index) =>
      token.text === name &&
      tokens[index + 1]?.text === '=' &&
      tokens[index - 1]?.text !== '.' &&
      (tokens[index - 1]?.kind === 'identifier' || tokens[index - 1]?.text === '>'),
  );
  if (at === -1) {
    return undefined;
  }
  return { from: at + 2, to: statementEnd(source, at + 2) };
}

function assignmentsOf(source, name) {
  const { tokens } = source;
  const ranges = [];
  for (const [index, token] of tokens.entries()) {
    const assigned = token.text === name && ASSIGNMENTS.has(tokens[index + 1]?.text);
    if (assigned && tokens[index - 1]?.text !== '.') {
      ranges.push({ from: index + 2, to: statementEnd(source, index + 2) });
    }
  }
  return ranges;
}

const ENDED = { ended: true, next: [] };

function callStep(source, range, depth) {
  const close = range.to - 1;
  const open = source.partner[close];
  const name = source.tokens[open - 1]?.text;
  if (isSeparatorName(name)) {
    return ENDED;
  }
  const last = splitTopLevel(source, { from: open + 1, to: close }).at(-1);
  const joining = JOINING_CALLS.has(name) && last !== undefined;
  return { ended: false, next: joining ? [{ range: last, depth: depth + 1 }] : [] };
}

function boundaryStep(source, { range, depth }) {
  const last = source.tokens[range.to - 1];
  if (depth > MAX_DEPTH || last === undefined) {
    return ENDED;
  }
  const text = literalText(last);
  if (text !== undefined) {
    return { ended: text === '' || BOUNDARY_CHARACTERS.includes(text.at(-1)), next: [] };
  }
  if (last.text === ')') {
    return callStep(source, range, depth);
  }
  if (isSeparatorName(lastName(source, range))) {
    return ENDED;
  }
  const assigned = range.to - range.from === 1 ? assignmentsOf(source, last.text) : [];
  return { ended: false, next: assigned.map((each) => ({ range: each, depth: depth + 1 })) };
}

export function endsWithBoundary(source, start) {
  const pending = [{ range: start, depth: 0 }];
  for (const item of pending) {
    const step = boundaryStep(source, item);
    if (step.ended) {
      return true;
    }
    for (const next of step.next) {
      pending.push(next);
    }
  }
  return false;
}

export function startsWithBoundary(source, range) {
  const text = literalText(source.tokens[range.from]);
  return text !== undefined && (text === '' || '.@/'.includes(text[0]));
}
