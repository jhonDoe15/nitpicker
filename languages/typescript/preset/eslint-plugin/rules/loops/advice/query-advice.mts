import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../../security/security-values.mts';
import { nameOf } from '../../typed/node-views.mts';
import { calleeName, isFunction } from '../../typed/syntax-views.mts';
import { innerCalls, outerCalls, type Call } from '../builders/chain-execution.mts';
import { descendants, type EnclosingLoop, type VisitorKeys } from '../loop-shapes.mts';
import { itemNames, referencedNames } from '../repeats/loop-names.mts';

export type Advice = 'query' | 'setQuery';

const SET_FUNCTIONS = new Set(['In', 'Any', 'inArray']);
const SET_KEYS = new Set(['in', '$in', '_in']);
const SET_METHODS = new Set(['whereIn', 'andWhereIn', 'orWhereIn', 'whereInIds', 'andWhereInIds']);

function operandOf(node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    const name = calleeName(node.callee);
    const isSet = SET_FUNCTIONS.has(name) || SET_METHODS.has(name);
    return isSet ? node.arguments.at(-1) : undefined;
  }
  if (node.type !== AST_NODE_TYPES.Property || node.computed) {
    return undefined;
  }
  const key = nameOf(node.key);
  return key !== undefined && SET_KEYS.has(key) ? node.value : undefined;
}

function setOperands(call: Call, visitorKeys: VisitorKeys): TSESTree.Node[] {
  const calls = [call, ...innerCalls(call), ...outerCalls(call)];
  const roots = calls.flatMap((each) => {
    const args = each.type === AST_NODE_TYPES.CallExpression ? each.arguments : [];
    return [each, ...args];
  });
  return roots
    .flatMap((root) => descendants(root, visitorKeys, isFunction))
    .map(operandOf)
    .filter((operand) => operand !== undefined);
}

function isSingleKey(
  operand: TSESTree.Node,
  items: ReadonlySet<string>,
  keys: VisitorKeys,
): boolean {
  const mentionsItem = [...referencedNames(operand, keys)].some((name) => items.has(name));
  const single = operand.type === AST_NODE_TYPES.ArrayExpression && operand.elements.length === 1;
  return mentionsItem && single;
}

export function adviceOf(call: Call, found: EnclosingLoop, context: Context): Advice {
  const keys = context.sourceCode.visitorKeys;
  const operands = setOperands(call, keys);
  const items = itemNames(found, keys);
  const single = operands.some((operand) => isSingleKey(operand, items, keys));
  return operands.length > 0 && !single ? 'setQuery' : 'query';
}
