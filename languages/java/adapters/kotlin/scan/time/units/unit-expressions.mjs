import {
  convertedUnit,
  unitOfName,
} from '../../../../../../../shared/naming/time-units/unit-names.mjs';
import { at, closingIndex, isOperator, peek, skipBracket, upcoming } from './kotlin-tokens.mjs';
import { checkCall, reportMixed } from './unit-reports.mjs';
import { callValue, namedValue, selectorValue } from './unit-selectors.mjs';

export const MAX_DEPTH = 3;
const COMPARING = new Set(['<', '<=', '>', '>=', '==', '!=', '===', '!==']);
const ADDING = new Set(['+', '-']);
const SCALING = new Set(['*', '/', '%']);
const PREFIXES = new Set(['-', '+', '!']);
const KEYWORDS = new Set([
  'if',
  'else',
  'when',
  'while',
  'for',
  'do',
  'return',
  'val',
  'var',
  'fun',
  'in',
  'is',
  'as',
  'throw',
  'try',
  'catch',
  'finally',
  'object',
  'class',
  'interface',
  'null',
  'true',
  'false',
  'import',
  'package',
  'typealias',
  'break',
  'continue',
]);
const CAST_TOKENS = 2;
const NAMED_ARGUMENT_TOKENS = 2;
const COMMA = new Set([',']);
const OPENING = new Set(['(', '[', '{']);
const PRIMARY_CALLS = { delay: 'ms', withTimeout: 'ms', withTimeoutOrNull: 'ms' };

function mismatch(left, right) {
  return left?.unit !== undefined && right?.unit !== undefined && left.unit !== right.unit;
}

function scale(left, right, operator) {
  if (left.unit !== undefined && right.unit === undefined && right.constant !== undefined) {
    return { unit: convertedUnit(left.unit, right.constant, operator), epoch: left.epoch };
  }
  if (operator === '*' && right.unit !== undefined && left.constant !== undefined) {
    return { unit: convertedUnit(right.unit, left.constant, '*'), epoch: right.epoch };
  }
  if (operator === '*' && left.constant !== undefined && right.constant !== undefined) {
    return { constant: left.constant * right.constant };
  }
  return {};
}

function added(left, right, operator) {
  const unit = left.unit ?? right.unit;
  if (unit === undefined || left.text === true || right.text === true) {
    return {};
  }
  const epoch =
    operator === '-'
      ? left.epoch === true && right.constant !== undefined
      : left.epoch === true || right.epoch === true;
  return { unit, epoch };
}

export function expression(parser) {
  const start = parser.position;
  const left = additive(parser);
  const operator = peek(parser);
  if (!isOperator(operator, COMPARING)) {
    return { ...left, from: start, to: parser.position - 1 };
  }
  parser.position += 1;
  const right = additive(parser);
  if (mismatch(left, right)) {
    reportMixed(parser.file, { operator, left, right });
  }
  return { from: start, to: parser.position - 1 };
}

function additive(parser) {
  let left = term(parser);
  for (const operator of upcoming(parser, (token) => isOperator(token, ADDING))) {
    parser.position += 1;
    const right = term(parser);
    const sum = mismatch(left, right) ? {} : added(left, right, operator.text);
    if (mismatch(left, right)) {
      reportMixed(parser.file, { operator, left, right });
    }
    left = { ...sum, from: left.from, to: right.to };
  }
  return left;
}

function term(parser) {
  let left = unary(parser);
  for (const { text: operator } of upcoming(parser, (token) => isOperator(token, SCALING))) {
    parser.position += 1;
    const right = unary(parser);
    const scaled = operator === '%' ? {} : scale(left, right, operator);
    left = { ...scaled, from: left.from, to: right.to };
  }
  return left;
}

function unary(parser) {
  const from = parser.position;
  const prefixes = [];
  for (const { text } of upcoming(parser, (token) => isOperator(token, PREFIXES))) {
    prefixes.push(text);
    parser.position += 1;
  }
  const inner = postfix(parser);
  if (prefixes.includes('!')) {
    return { from, to: parser.position - 1 };
  }
  const negated = prefixes.filter((text) => text === '-').length % 2 === 1;
  const constant = negated && inner.constant !== undefined ? -inner.constant : inner.constant;
  return { ...inner, constant, from };
}

function postfixStep(parser) {
  if (at(parser, '.') || at(parser, '?.')) {
    return peek(parser, 1)?.kind === 'id' ? 'selector' : undefined;
  }
  if (at(parser, '!!')) {
    return 'assertion';
  }
  if (at(parser, '[')) {
    return 'index';
  }
  return peek(parser)?.kind === 'id' && peek(parser).text === 'as' ? 'cast' : undefined;
}

function selector(parser, receiver, from) {
  const name = peek(parser, 1).text;
  const nameIndex = parser.position + 1;
  parser.position += 2;
  const args = at(parser, '(') ? argumentsOf(parser) : undefined;
  trailingLambda(parser);
  return selectorValue(parser, { receiver, name, nameIndex, args, from });
}

function skippedTokens(parser, step) {
  if (step !== 'cast') {
    return 1;
  }
  return at(parser, '?', 1) ? CAST_TOKENS + 1 : CAST_TOKENS;
}

function upcomingSteps(parser) {
  return {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      const step = postfixStep(parser);
      return step === undefined ? { done: true, value: undefined } : { done: false, value: step };
    },
  };
}

function postfix(parser) {
  const from = parser.position;
  let value = primary(parser);
  for (const step of upcomingSteps(parser)) {
    if (step === 'selector') {
      value = selector(parser, value, from);
    } else if (step === 'index') {
      skipBracket(parser);
      value = {};
    } else {
      parser.position += skippedTokens(parser, step);
    }
  }
  return { ...value, from, to: parser.position - 1 };
}

function trailingLambda(parser) {
  if (at(parser, '{')) {
    skipBracket(parser);
  }
}

function group(parser) {
  const open = parser.position - 1;
  parser.position = closingIndex(parser.tokens, open) + 1;
  return parser.regions.get(open) ?? {};
}

function primary(parser) {
  const token = peek(parser);
  if (token === undefined) {
    return {};
  }
  parser.position += 1;
  if (token.kind === 'num') {
    return { constant: token.value };
  }
  if (token.kind === 'str') {
    return { text: true };
  }
  if (token.kind === 'op' && token.text === '(') {
    return group(parser);
  }
  return token.kind !== 'id' || KEYWORDS.has(token.text) ? {} : called(parser, token);
}

function called(parser, token) {
  const name = token.text;
  const nameIndex = parser.position - 1;
  if (at(parser, '(')) {
    const args = argumentsOf(parser);
    trailingLambda(parser);
    const call = { name, nameIndex, args, receiver: {}, unit: PRIMARY_CALLS[name] };
    checkCall(parser.file, call);
    return callValue(name);
  }
  if (at(parser, '{')) {
    trailingLambda(parser);
    return callValue(name);
  }
  return identifier(parser, name);
}

function identifier(parser, name) {
  const own = unitOfName(name);
  if (own !== undefined || parser.depth >= MAX_DEPTH) {
    return namedValue(name, own);
  }
  const resolved = parser.declared.get(name);
  return resolved === undefined
    ? { name }
    : { name, unit: resolved.unit, epoch: resolved.epoch, constant: resolved.constant };
}

function argumentsOf(parser) {
  const open = parser.position;
  parser.position = closingIndex(parser.tokens, open) + 1;
  return parser.regions.get(open) ?? [];
}

export function parseArguments(parser) {
  const close = closingIndex(parser.tokens, parser.position);
  const args = [];
  parser.position += 1;
  for (const token of upcoming(parser, () => parser.position < close)) {
    const named = token.kind === 'id' && at(parser, '=', 1) ? token.text : undefined;
    parser.position += named === undefined ? 0 : NAMED_ARGUMENT_TOKENS;
    const start = parser.position;
    const value = expression(parser);
    args.push({ name: named, value: { ...value, from: start } });
    skipArgument(parser, close);
  }
  return args;
}

function skipArgument(parser, close) {
  function inArgument(token) {
    return parser.position < close && !isOperator(token, COMMA);
  }
  for (const token of upcoming(parser, inArgument)) {
    if (isOperator(token, OPENING)) {
      skipBracket(parser);
    } else {
      parser.position += 1;
    }
  }
  parser.position += 1;
}

export function isCallOpen(tokens, open) {
  const before = tokens[open - 1];
  return before?.kind === 'id' && !KEYWORDS.has(before.text);
}
