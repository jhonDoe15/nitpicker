import { unwrapped } from '../../security/security-values.mjs';
import { outerOf } from '../result-uses.mjs';

const EQUALITY = new Set(['===', '!==', '==', '!=']);
const COUNT_TESTS = new Map([
  ['>', [0]],
  ['>=', [1]],
  ['<', [1]],
  ['<=', [0]],
  ['===', [0]],
  ['==', [0]],
  ['!==', [0]],
  ['!=', [0]],
]);
const MIRRORED = new Map([
  ['>', '<'],
  ['<', '>'],
  ['>=', '<='],
  ['<=', '>='],
]);
const TESTS = new Set([
  'IfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'ConditionalExpression',
]);

function isAbsent(node) {
  const target = unwrapped(node);
  return (
    (target.type === 'Literal' && target.raw === 'null') ||
    (target.type === 'Identifier' && target.name === 'undefined')
  );
}

function otherSide(binary, outer) {
  return binary.left === outer ? binary.right : binary.left;
}

export function isBooleanUse(site) {
  const outer = outerOf(site);
  const { parent } = outer;
  if (TESTS.has(parent.type) && parent.test === outer) {
    return true;
  }
  if (parent.type === 'UnaryExpression') {
    return parent.operator === '!';
  }
  const isBoolean =
    parent.type === 'CallExpression' &&
    parent.callee.type === 'Identifier' &&
    parent.callee.name === 'Boolean' &&
    parent.arguments[0] === outer;
  const absent =
    parent.type === 'BinaryExpression' &&
    EQUALITY.has(parent.operator) &&
    isAbsent(otherSide(parent, outer));
  return isBoolean || absent;
}

export function isCountTest(site) {
  const outer = outerOf(site);
  const { parent } = outer;
  if (parent.type !== 'BinaryExpression') {
    return isBooleanUse(site);
  }
  const other = unwrapped(otherSide(parent, outer));
  const operator =
    parent.left === outer ? parent.operator : (MIRRORED.get(parent.operator) ?? parent.operator);
  const tested = COUNT_TESTS.get(operator);
  return other.type === 'Literal' && tested !== undefined && tested.includes(other.value);
}
