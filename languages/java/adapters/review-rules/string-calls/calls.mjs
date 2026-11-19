import { splitTopLevel } from '../max-value-sums/source-file.mjs';

const UNICODE_ESCAPE_LENGTH = 5;
const ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', 0: '\0' };

export function stringValue(token) {
  if (token?.kind !== 'string' || token.text.startsWith('"""')) {
    return undefined;
  }
  const body = token.text.slice(1, -1);
  if (token.names?.length > 0) {
    return undefined;
  }
  return body.replaceAll(/\\(u[\da-fA-F]{4}|.)/gu, (_, code) =>
    code.length === UNICODE_ESCAPE_LENGTH
      ? String.fromCharCode(Number.parseInt(code.slice(1), 16))
      : (ESCAPES[code] ?? code),
  );
}

export function isOperator(token, texts) {
  return token?.kind === 'operator' && texts.includes(token.text);
}

export function methodCalls(source, names) {
  const { tokens, partner } = source;
  const found = [];
  for (const [index, token] of tokens.entries()) {
    const dot = tokens[index - 1];
    const wanted = token.kind === 'identifier' && names.includes(token.text);
    if (!wanted || !isOperator(dot, ['.', '?.']) || tokens[index + 1]?.text !== '(') {
      continue;
    }
    const close = partner[index + 1];
    if (close > index) {
      found.push({
        name: token.text,
        dot: index - 1,
        open: index + 1,
        close,
        line: token.line,
        args: splitTopLevel(source, { from: index + 2, to: close }),
      });
    }
  }
  return found;
}

function receiverStep(source, index) {
  const { tokens, partner } = source;
  const token = tokens[index];
  if (isOperator(token, [')', ']']) && partner[index] >= 0 && partner[index] < index) {
    return { start: partner[index], next: partner[index] - 1 };
  }
  if (!['identifier', 'string', 'number'].includes(token.kind) || token.text === 'return') {
    return undefined;
  }
  const chained = isOperator(tokens[index - 1], ['.', '?.']);
  return { start: index, next: chained ? index - 2 : -1 };
}

export function receiverStart(source, dot) {
  let start = dot;
  const pending = [dot - 1];
  for (const index of pending) {
    const step = index >= 0 ? receiverStep(source, index) : undefined;
    if (step === undefined) {
      break;
    }
    start = step.start;
    pending.push(step.next);
  }
  return start;
}

export function singleToken(source, { from, to }) {
  return to - from === 1 ? source.tokens[from] : undefined;
}

export function tokenText(source, { from, to }, separator) {
  return source.tokens
    .slice(from, to)
    .map(({ text }) => text)
    .join(separator);
}
