import { chainOf } from '../../rules/analysis/ancestry.mjs';
import { isExpectCall, memberName } from '../../rules/analysis/test-code-analysis.mjs';
import {
  isEmptyLiteral,
  isNumber,
  lengthName,
  nonEmptyComparison,
  nullishName,
} from './values.mjs';

const MODIFIERS = new Set(['not', 'resolves', 'rejects']);

const EQUALITY_MATCHERS = new Set(['toBe', 'toEqual', 'toStrictEqual']);
const DEEP_EQUALITY_MATCHERS = new Set(['toEqual', 'toStrictEqual']);
const CALLED_WITH_MATCHERS = new Map([
  ['toHaveBeenCalledWith', 0],
  ['toBeCalledWith', 0],
  ['toHaveBeenLastCalledWith', 0],
  ['lastCalledWith', 0],
  ['toHaveBeenNthCalledWith', 1],
  ['nthCalledWith', 1],
  ['toHaveBeenCalledExactlyOnceWith', 0],
  ['toHaveBeenCalledOnceWith', 0],
]);
const WILDCARD_NAMES = new Set(['anything', 'any']);

function parseExpectation(call) {
  const { callee } = call;
  if (callee.type !== 'MemberExpression') {
    return undefined;
  }
  const matcher = memberName(callee);
  if (matcher === undefined) {
    return undefined;
  }
  const links = chainOf(callee.object, (link) =>
    link.type === 'MemberExpression' ? link.object : undefined,
  );
  const root = links.at(-1);
  const modifiers = links.slice(0, -1).map((link) => memberName(link));
  if (!isExpectCall(root) || !modifiers.every((name) => MODIFIERS.has(name))) {
    return undefined;
  }
  return {
    matcher,
    negated: modifiers.includes('not'),
    path: [...modifiers.toReversed(), matcher].join('.'),
    subject: root.arguments[0],
    args: call.arguments,
  };
}

function isWildcard(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    node.callee.object.type === 'Identifier' &&
    node.callee.object.name === 'expect' &&
    WILDCARD_NAMES.has(memberName(node.callee))
  );
}

function presenceOf(expectation) {
  const [expected] = expectation.args;
  const absent = nullishName(expected);
  const isPresence = expectation.negated && EQUALITY_MATCHERS.has(expectation.matcher);
  return isPresence && absent !== undefined ? { family: 'presence', absent } : undefined;
}

function isEmptyAssertion({ matcher, negated, args: [expected] }) {
  if (negated && matcher === 'toHaveLength') {
    return isNumber(expected, 0);
  }
  if (!negated || !DEEP_EQUALITY_MATCHERS.has(matcher)) {
    return false;
  }
  return isEmptyLiteral(expected);
}

function isNonEmptyLengthCheck({ matcher, negated, subject, args: [expected] }) {
  if (lengthName(subject) === undefined) {
    return false;
  }
  if (!negated && matcher === 'toBeGreaterThan') {
    return isNumber(expected, 0);
  }
  if (!negated && matcher === 'toBeGreaterThanOrEqual') {
    return isNumber(expected, 1);
  }
  return negated && EQUALITY_MATCHERS.has(matcher) && isNumber(expected, 0);
}

function isTrueComparison({ matcher, negated, subject, args: [expected] }) {
  return (
    !negated &&
    EQUALITY_MATCHERS.has(matcher) &&
    expected?.type === 'Literal' &&
    expected.value === true &&
    nonEmptyComparison(subject) !== undefined
  );
}

function nonEmptyOf(expectation) {
  const weak =
    isEmptyAssertion(expectation) ||
    isNonEmptyLengthCheck(expectation) ||
    isTrueComparison(expectation);
  return weak ? { family: 'nonEmpty' } : undefined;
}

function wildcardsOf(expectation) {
  const skipped = CALLED_WITH_MATCHERS.get(expectation.matcher);
  if (expectation.negated || skipped === undefined) {
    return undefined;
  }
  const checked = expectation.args.slice(skipped);
  const weak = checked.length > 0 && checked.every(isWildcard);
  return weak ? { family: 'wildcardCall' } : undefined;
}

export function expectForm(call) {
  const expectation = parseExpectation(call);
  if (!expectation) {
    return undefined;
  }
  const form = presenceOf(expectation) ?? nonEmptyOf(expectation) ?? wildcardsOf(expectation);
  return form && { ...form, expectation };
}
