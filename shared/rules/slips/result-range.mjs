import { declaredTypes, isCollectionKind, kindOfType } from '../decided/models/types.mjs';
import { nodesOf } from '../../near-duplicates/tree/nodes.mjs';

const EQUALITY = new Set(['==', '!=', '===', '!==']);
const ORDER = new Set(['<', '<=', '>', '>=']);
const FLIPPED = new Map([
  ['<', '>'],
  ['<=', '>='],
  ['>', '<'],
  ['>=', '<='],
]);
const SIGN_ONLY = {
  kotlin: new Set(['compareTo', 'compare', 'compareValues']),
  typescript: new Set(['localeCompare']),
};
const LOOKUPS = new Set(['get', 'at', 'charAt']);
const COMPARATORS = new Set(['Comparator', 'Collator']);
const FIRST_ELEMENT = new Set([
  'get',
  'at',
  'charAt',
  'getFirst',
  'first',
  'firstOrNull',
  'peekFirst',
]);
const SEARCHES = {
  python: new Set(['find', 'rfind']),
  other: new Set(['indexOf', 'lastIndexOf']),
};
const NUMBER_SUFFIX = /[lLfFdD]$/u;
const ZERO_TESTS = new Set(['==', '===']);
const MISSES_FIRST = new Set(['> 0', '>= 1', '<= 0', '< 1']);

function languageOf(file) {
  if (file.endsWith('.kt')) {
    return 'kotlin';
  }
  if (file.endsWith('.java')) {
    return 'java';
  }
  return file.endsWith('.py') ? 'python' : 'typescript';
}

function numberOf(node) {
  if (node.kind === 'literal' && node.literal === 'number') {
    const value = Number(node.value.replace(NUMBER_SUFFIX, ''));
    return Number.isFinite(value) ? value : undefined;
  }
  const inner =
    node.kind === 'unary' && node.value === '-' ? numberOf(node.children[0]) : undefined;
  return inner === undefined ? undefined : -inner;
}

function calleeName(call) {
  const [callee] = call.children;
  return callee.kind === 'member' || callee.kind === 'name' ? (callee.text ?? callee.value) : '';
}

function methodName(call) {
  const name = calleeName(call);
  return name.slice(name.lastIndexOf('.') + 1);
}

function relationOf(node) {
  const [left, right] = node.children;
  const isCallLeft = left.kind === 'call';
  const call = isCallLeft ? left : right;
  const number = numberOf(isCallLeft ? right : left);
  if (call.kind !== 'call' || number === undefined) {
    return [];
  }
  const operator = isCallLeft ? node.value : (FLIPPED.get(node.value) ?? node.value);
  return [{ node, call, operator, number }];
}

function comparisons(tree) {
  return nodesOf(tree)
    .filter((node) => node.kind === 'binary' && (EQUALITY.has(node.value) || ORDER.has(node.value)))
    .flatMap((node) => relationOf(node));
}

function isSignOnlyMisuse({ operator, number }) {
  if (number === 0) {
    return false;
  }
  if (EQUALITY.has(operator)) {
    return true;
  }
  return (
    (operator === '>' && number >= 1) ||
    (operator === '>=' && number >= 2) ||
    (operator === '<' && number <= -1) ||
    (operator === '<=' && number <= -2)
  );
}

function receiverType(call, types) {
  const receiver = call.children[0].children?.[0];
  const type = receiver?.kind === 'name' ? types.get(receiver.value) : undefined;
  return type === undefined ? undefined : kindOfType(type);
}

function isLibraryComparison(call, types) {
  const name = methodName(call);
  const isMember = call.children[0].kind === 'member';
  if (name === 'compareValues') {
    return true;
  }
  if (name === 'compare') {
    return isMember && COMPARATORS.has(receiverType(call, types));
  }
  return isMember;
}

function signOnlyFindings(found, { language, types }) {
  const names = SIGN_ONLY[language] ?? new Set();
  return found
    .filter(
      (entry) =>
        names.has(methodName(entry.call)) &&
        isSignOnlyMisuse(entry) &&
        isLibraryComparison(entry.call, types),
    )
    .map(({ node, call }) => ({
      node,
      subject: `\`${node.text ?? methodName(call)}\` compares a sign-only result with a value other than 0: \`${methodName(call)}\` may return any positive or negative number`,
      fix: 'Compare the result with 0 (`< 0`, `== 0`, `> 0`).',
    }));
}

function isKnownReceiver(call, language, types) {
  return language !== 'java' || isCollectionKind(receiverType(call, types));
}

function isFirstIndex(node) {
  const isZero = (child) => child?.kind === 'literal' && Number(child.value) === 0;
  if (node.kind === 'index') {
    return isZero(node.children[1]);
  }
  if (node.kind !== 'call' || node.children[0].kind !== 'member') {
    return false;
  }
  const [callee, first] = node.children;
  const isLookup = LOOKUPS.has(callee.value);
  return FIRST_ELEMENT.has(callee.value) && (isLookup ? isZero(first) : first === undefined);
}

function handlesFirst(tree, call) {
  const same = (node) => node.kind === 'call' && node.text === call.text;
  return nodesOf(tree).some(
    (node) =>
      isFirstIndex(node) ||
      (node.kind === 'binary' &&
        ZERO_TESTS.has(node.value) &&
        node.children.some((child) => same(child)) &&
        node.children.some((child) => numberOf(child) === 0)),
  );
}

function searchFindings(found, { language, types, tree }) {
  const names = language === 'python' ? SEARCHES.python : SEARCHES.other;
  return found
    .filter(({ call, operator, number }) => {
      const form = `${operator} ${String(number)}`;
      return (
        names.has(methodName(call)) &&
        call.children[0].kind === 'member' &&
        MISSES_FIRST.has(form) &&
        isKnownReceiver(call, language, types) &&
        !handlesFirst(tree, call)
      );
    })
    .map(({ node, call }) => ({
      node,
      subject: `\`${node.text ?? methodName(call)}\` misses a match at position 0, because \`${methodName(call)}\` returns 0 for it and -1 for none`,
      fix: 'Test `>= 0` (or `!= -1`), or use a containment check (`contains`, `includes`, `in`).',
    }));
}

/** Comparisons in one function tree that cannot test what they were written for. */
export function resultRangeSlips(tree, file) {
  const language = languageOf(file);
  const found = comparisons(tree);
  const types = declaredTypes(tree);
  return [
    ...signOnlyFindings(found, { language, types }),
    ...searchFindings(found, { language, types, tree }),
  ];
}
