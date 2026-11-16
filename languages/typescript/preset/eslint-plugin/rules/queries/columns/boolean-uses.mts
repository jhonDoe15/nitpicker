import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { unwrapped } from '../../security/security-values.mts';
import { outerOf } from '../result-uses.mts';

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
type Test =
  | TSESTree.IfStatement
  | TSESTree.WhileStatement
  | TSESTree.DoWhileStatement
  | TSESTree.ConditionalExpression;

function isTest(node: TSESTree.Node): node is Test {
  return (
    node.type === AST_NODE_TYPES.IfStatement ||
    node.type === AST_NODE_TYPES.WhileStatement ||
    node.type === AST_NODE_TYPES.DoWhileStatement ||
    node.type === AST_NODE_TYPES.ConditionalExpression
  );
}

function isAbsent(node: TSESTree.Node): boolean {
  const target = unwrapped(node);
  return (
    (target.type === AST_NODE_TYPES.Literal && target.raw === 'null') ||
    (target.type === AST_NODE_TYPES.Identifier && target.name === 'undefined')
  );
}

function otherSide(binary: TSESTree.BinaryExpression, outer: TSESTree.Node): TSESTree.Node {
  return binary.left === outer ? binary.right : binary.left;
}

export function isBooleanUse(site: TSESTree.Node): boolean {
  const outer = outerOf(site);
  const { parent } = outer;
  if (parent === undefined) {
    return false;
  }
  if (isTest(parent) && parent.test === outer) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.UnaryExpression) {
    return parent.operator === '!';
  }
  const isBoolean =
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.callee.type === AST_NODE_TYPES.Identifier &&
    parent.callee.name === 'Boolean' &&
    parent.arguments[0] === outer;
  const absent =
    parent.type === AST_NODE_TYPES.BinaryExpression &&
    EQUALITY.has(parent.operator) &&
    isAbsent(otherSide(parent, outer));
  return isBoolean || absent;
}

export function isCountTest(site: TSESTree.Node): boolean {
  const outer = outerOf(site);
  const { parent } = outer;
  if (parent?.type !== AST_NODE_TYPES.BinaryExpression) {
    return isBooleanUse(site);
  }
  const other = unwrapped(otherSide(parent, outer));
  const operator =
    parent.left === outer ? parent.operator : (MIRRORED.get(parent.operator) ?? parent.operator);
  const tested = COUNT_TESTS.get(operator);
  return (
    other.type === AST_NODE_TYPES.Literal &&
    tested !== undefined &&
    typeof other.value === 'number' &&
    tested.includes(other.value)
  );
}
