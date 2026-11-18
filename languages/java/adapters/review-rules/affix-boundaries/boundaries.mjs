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

function initializerOf(source, name) {
  const { tokens, kotlin } = source;
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
  let end = at + 2;
  while (
    end < tokens.length &&
    tokens[end].text !== ';' &&
    !(kotlin && startsNewLine(tokens, end))
  ) {
    end += 1;
  }
  return { from: at + 2, to: end };
}

export function assignmentsOf(source, name) {
  const { tokens, kotlin } = source;
  const ranges = [];
  for (const [index, token] of tokens.entries()) {
    const assigned = token.text === name && ASSIGNMENTS.has(tokens[index + 1]?.text);
    if (!assigned || tokens[index - 1]?.text === '.') {
      continue;
    }
    let end = index + 2;
    while (
      end < tokens.length &&
      tokens[end].text !== ';' &&
      !(kotlin && startsNewLine(tokens, end))
    ) {
      end += 1;
    }
    ranges.push({ from: index + 2, to: end });
  }
  return ranges;
}

function callEnds(source, range, depth) {
  const close = range.to - 1;
  const open = source.partner[close];
  const name = source.tokens[open - 1]?.text;
  if (isSeparatorName(name)) {
    return true;
  }
  const last = splitTopLevel(source, { from: open + 1, to: close }).at(-1);
  return JOINING_CALLS.has(name) && last !== undefined && endsWithBoundary(source, last, depth + 1);
}

export function endsWithBoundary(source, range, depth = 0) {
  const { tokens } = source;
  const last = tokens[range.to - 1];
  if (depth > MAX_DEPTH || last === undefined) {
    return true;
  }
  const text = literalText(last);
  if (text !== undefined) {
    return text === '' || BOUNDARY_CHARACTERS.includes(text.at(-1));
  }
  if (last.text === ')') {
    return callEnds(source, range, depth);
  }
  const name = lastName(source, range);
  if (isSeparatorName(name)) {
    return true;
  }
  const assigned = range.to - range.from === 1 ? assignmentsOf(source, last.text) : [];
  return assigned.some((each) => endsWithBoundary(source, each, depth + 1));
}

export function startsWithBoundary(source, range) {
  const text = literalText(source.tokens[range.from]);
  return text !== undefined && (text === '' || '.@/'.includes(text[0]));
}
