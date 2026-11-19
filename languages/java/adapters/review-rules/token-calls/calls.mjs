import { splitTopLevel } from '../max-value-sums/source-file.mjs';
import { tokenText } from '../string-calls/calls.mjs';

const CALL_SEPARATORS = new Set(['.', '?.']);
const QUOTED = /^"([^"\\\n]*)"$/u;

function wordIndex(tokens, index) {
  const kind = tokens[index]?.kind;
  return kind === 'identifier' || kind === 'string' || kind === 'number';
}

function receiverStep(source, at) {
  const { tokens, partner } = source;
  const { text } = tokens[at];
  let start;
  if ((text === ')' || text === ']') && partner[at] >= 0 && partner[at] < at) {
    const named = text === ')' && tokens[partner[at] - 1]?.kind === 'identifier';
    start = named ? partner[at] - 1 : partner[at];
  } else if (wordIndex(tokens, at)) {
    start = at;
  }
  return start;
}

function receiverStart(source, dot) {
  let start = dot;
  const pending = [dot - 1];
  for (const at of pending) {
    const found = at >= 0 ? receiverStep(source, at) : undefined;
    if (found === undefined) {
      break;
    }
    start = found;
    if (CALL_SEPARATORS.has(source.tokens[start - 1]?.text)) {
      pending.push(start - 2);
    }
  }
  return start;
}

export function methodCalls(source) {
  const { tokens, partner } = source;
  const calls = [];
  for (const [index, { text }] of tokens.entries()) {
    const open = index + 1;
    const member = CALL_SEPARATORS.has(tokens[index - 1]?.text);
    if (tokens[index].kind !== 'identifier' || tokens[open]?.text !== '(' || partner[open] < 0) {
      continue;
    }
    const dot = index - 1;
    calls.push({
      name: text,
      index,
      open,
      close: partner[open],
      line: tokens[index].line,
      receiver: member ? { from: receiverStart(source, dot), to: dot } : undefined,
      args: splitTopLevel(source, { from: open + 1, to: partner[open] }),
    });
  }
  return calls;
}

export function textOf(source, range) {
  return tokenText(source, range, '');
}

export function shortText(text, limit = 40) {
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

export function stringValue(source, range) {
  if (range === undefined || range.to - range.from !== 1) {
    return undefined;
  }
  const token = source.tokens[range.from];
  return token.kind === 'string' ? QUOTED.exec(token.text)?.[1] : undefined;
}

export function lastName(source, { from, to }) {
  const { tokens, partner } = source;
  const pending = [to - 1];
  for (const index of pending) {
    if (index < from) {
      break;
    }
    const { kind, text } = tokens[index];
    if (kind === 'identifier') {
      return text;
    }
    if (text === ')') {
      pending.push(partner[index] - 1);
    } else if (text === '(') {
      pending.push(index - 1);
    } else {
      return undefined;
    }
  }
  return undefined;
}

export function stringNames(source) {
  const { tokens } = source;
  const names = new Set();
  for (const [index, { text }] of tokens.entries()) {
    if (text !== 'String') {
      continue;
    }
    const next = tokens[index + 1];
    const label = tokens[index - 1]?.text === ':' ? tokens[index - 2] : undefined;
    if (next?.kind === 'identifier') {
      names.add(next.text);
    } else if (label?.kind === 'identifier') {
      names.add(label.text);
    }
  }
  return names;
}

export function startOfStatement(source, from) {
  const { tokens, opener } = source;
  const level = opener[from];
  const lower = level + 1;
  const stop = tokens
    .slice(lower, from)
    .findLastIndex(
      (token, offset) =>
        opener[lower + offset] === level && (token.text === ';' || token.text === '}'),
    );
  return stop === -1 ? lower : lower + stop + 1;
}

export function endOfCondition(source, from) {
  const { tokens, opener, partner } = source;
  const level = opener[from];
  const found = tokens
    .slice(from)
    .findIndex(
      (token, offset) =>
        from + offset === partner[level] ||
        (opener[from + offset] === level && (token.text === ';' || token.text === '{')),
    );
  return found === -1 ? tokens.length : from + found;
}
