import { isTrivialValue } from '../../../../../shared/rules/copied-constants/copied-constants.mjs';
import { tokenValue } from './jvm-values.mjs';

const OPENING = new Set(['(', '[']);
const CLOSING = new Set([')', ']']);
const STATEMENT_ENDS = new Set([';', '{', '}']);
const VALUE_BEFORE = new Set(['identifier', 'number', 'string', 'char']);
const CLOSES_VALUE = new Set([')', ']']);
const CONTINUES_AFTER = new Set([
  '(',
  '[',
  ',',
  '=',
  '.',
  '?.',
  '::',
  '->',
  '+',
  '-',
  '*',
  '/',
  '%',
  '&&',
  '||',
  '?:',
  '==',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
]);
const CONTINUES_BEFORE = new Set(['.', '?.', '?:', '&&', '||', ')', ']']);
const TEST_NAME_CALLS = new Set([
  'test',
  'it',
  'xit',
  'fit',
  'xtest',
  'describe',
  'xdescribe',
  'fdescribe',
  'context',
  'xcontext',
  'should',
  'xshould',
  'given',
  'and',
  'feature',
  'scenario',
  'expect',
  'dynamicTest',
  'dynamicContainer',
]);
const NAME_FOLLOWERS = new Set(['{', '-']);

function annotationEnd(tokens, at) {
  let index = at + 1;
  while (tokens[index]?.kind === 'identifier' || ['.', ':'].includes(tokens[index]?.text)) {
    index += 1;
  }
  if (tokens[index]?.text !== '(') {
    return at;
  }
  let depth = 0;
  for (let next = index; next < tokens.length; next += 1) {
    depth += OPENING.has(tokens[next].text) ? 1 : 0;
    depth -= CLOSING.has(tokens[next].text) ? 1 : 0;
    if (depth === 0) {
      return next;
    }
  }
  return tokens.length - 1;
}

function annotationRanges(tokens) {
  const skipped = new Set();
  for (const [index, token] of tokens.entries()) {
    if (token.text === '@') {
      const end = annotationEnd(tokens, index);
      for (let inner = index; inner <= end; inner += 1) {
        skipped.add(inner);
      }
    }
  }
  return skipped;
}

function isTestName(tokens, index, kotlin) {
  const before = tokens[index - 1];
  const after = tokens[index + 1];
  const isFirstArgument =
    before?.text === '(' && TEST_NAME_CALLS.has(tokens[index - 2]?.text ?? '');
  const isSpecName =
    kotlin &&
    (NAME_FOLLOWERS.has(after?.text) ||
      (after?.kind === 'identifier' && tokens[index + 2]?.text === '{'));
  return isFirstArgument || isSpecName;
}

function isNegation(tokens, index) {
  const sign = tokens[index - 1];
  const before = tokens[index - 2];
  return (
    sign?.text === '-' &&
    !(before !== undefined && (VALUE_BEFORE.has(before.kind) || CLOSES_VALUE.has(before.text)))
  );
}

function breaksLine(earlier, later, kotlin) {
  return (
    kotlin &&
    earlier.line < later.line &&
    !CONTINUES_AFTER.has(earlier.text) &&
    !CONTINUES_BEFORE.has(later.text)
  );
}

function statementStart(tokens, index, kotlin) {
  let depth = 0;
  for (let at = index - 1; at >= 0; at -= 1) {
    const token = tokens[at];
    if (
      depth === 0 &&
      (STATEMENT_ENDS.has(token.text) || breaksLine(token, tokens[at + 1], kotlin))
    ) {
      return at + 1;
    }
    if (CLOSING.has(token.text)) {
      depth += 1;
    } else if (OPENING.has(token.text) && depth > 0) {
      depth -= 1;
    }
  }
  return 0;
}

function statementEnd(tokens, index, kotlin) {
  let depth = 0;
  for (let at = index + 1; at < tokens.length; at += 1) {
    const token = tokens[at];
    if (
      depth === 0 &&
      (STATEMENT_ENDS.has(token.text) || breaksLine(tokens[at - 1], token, kotlin))
    ) {
      return at;
    }
    if (OPENING.has(token.text)) {
      depth += 1;
    } else if (CLOSING.has(token.text) && depth > 0) {
      depth -= 1;
    }
  }
  return tokens.length;
}

function statementNames(tokens, index, kotlin) {
  const names = new Set();
  for (
    let at = statementStart(tokens, index, kotlin);
    at < statementEnd(tokens, index, kotlin);
    at += 1
  ) {
    if (tokens[at].kind === 'identifier') {
      names.add(tokens[at].text);
    }
  }
  return names;
}

function literalAt(tokens, index) {
  const token = tokens[index];
  if (token.kind !== 'string' && token.kind !== 'number') {
    return undefined;
  }
  const negated = token.kind === 'number' && isNegation(tokens, index);
  const value = tokenValue(token.text, { negated });
  return value === undefined || isTrivialValue(value) ? undefined : value;
}

/** The string and number literals of a test file's body that may copy a constant. */
export function testLiterals(parsed, { kotlin }) {
  const { tokens, headerEnd } = parsed;
  const skipped = annotationRanges(tokens);
  const literals = [];
  for (let index = headerEnd; index < tokens.length; index += 1) {
    const value = skipped.has(index) ? undefined : literalAt(tokens, index);
    if (value !== undefined && !isTestName(tokens, index, kotlin)) {
      literals.push({
        value,
        line: tokens[index].line,
        names: () => statementNames(tokens, index, kotlin),
      });
    }
  }
  return literals;
}
