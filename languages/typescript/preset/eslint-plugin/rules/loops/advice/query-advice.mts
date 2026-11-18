import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../../security/security-values.mts';
import { estreeCallView } from '../../support/io/call-views.mts';
import { wordsOf as untypedWordsOf } from '../../../../../../../shared/naming/secret-words.mjs';
import { nameOf } from '../../typed/node-views.mts';
import { calleeName, isFunction } from '../../typed/syntax-views.mts';
import {
  chainArguments,
  chainFrom,
  innerCalls,
  outerCalls,
  type Call,
} from '../builders/chain-execution.mts';
import { descendants, type EnclosingLoop, type VisitorKeys } from '../loop-shapes.mts';
import { itemNames, referencedNames } from '../repeats/loop-names.mts';

export type Advice = 'query' | 'setQuery' | 'foreignKeyQuery' | 'dependentQuery';

const wordsOf: (name: string) => string[] = untypedWordsOf;

const SET_FUNCTIONS = new Set(['In', 'Any', 'inArray']);
const SET_KEYS = new Set(['in', '$in', '_in']);
const SET_METHODS = new Set(['whereIn', 'andWhereIn', 'orWhereIn', 'whereInIds', 'andWhereInIds']);
const READ_WORDS = new Set(['find', 'get', 'load', 'read', 'select', 'count', 'exists']);
const FOREIGN_KEY = /^[a-z][A-Za-z0-9]*Id$|_id$/u;

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

function isItemKeys(
  operand: TSESTree.Node,
  items: ReadonlySet<string>,
  keys: VisitorKeys,
): boolean {
  const mentionsItem = [...referencedNames(operand, keys)].some((name) => items.has(name));
  return mentionsItem && operand.type === AST_NODE_TYPES.ArrayExpression;
}

function isInside(node: TSESTree.Node, container: TSESTree.Node): boolean {
  return node.range[0] >= container.range[0] && node.range[1] <= container.range[1];
}

function isPropertyKey(node: TSESTree.Node): boolean {
  const { parent } = node;
  return (
    parent?.type === AST_NODE_TYPES.Property &&
    parent.key === node &&
    !parent.computed &&
    !parent.shorthand
  );
}

function usesItemOutside(
  call: Call,
  operands: readonly TSESTree.Node[],
  items: ReadonlySet<string>,
  keys: VisitorKeys,
): boolean {
  return chainArguments(call)
    .flatMap((argument) => descendants(argument, keys, isFunction))
    .some(
      (node) =>
        node.type === AST_NODE_TYPES.Identifier &&
        items.has(node.name) &&
        !isPropertyKey(node) &&
        !operands.some((operand) => isInside(node, operand)),
    );
}

function isItemQuery(
  call: Call,
  operands: readonly TSESTree.Node[],
  items: ReadonlySet<string>,
  keys: VisitorKeys,
): boolean {
  return (
    operands.some((operand) => isItemKeys(operand, items, keys)) ||
    usesItemOutside(call, operands, items, keys)
  );
}

function hasForeignKey(call: Call, items: ReadonlySet<string>, keys: VisitorKeys): boolean {
  return chainArguments(call)
    .flatMap((argument) => descendants(argument, keys, isFunction))
    .some(
      (node) =>
        node.type === AST_NODE_TYPES.MemberExpression &&
        node.object.type === AST_NODE_TYPES.Identifier &&
        items.has(node.object.name) &&
        FOREIGN_KEY.test(nameOf(node.property) ?? ''),
    );
}

function isCarried(call: Call, keys: VisitorKeys): boolean {
  const top = chainFrom(call).at(-1) ?? call;
  const value = top.parent?.type === AST_NODE_TYPES.AwaitExpression ? top.parent : top;
  const holder = value.parent;
  const target =
    holder?.type === AST_NODE_TYPES.AssignmentExpression && holder.right === value
      ? holder.left
      : undefined;
  return (
    target?.type === AST_NODE_TYPES.Identifier &&
    chainArguments(call).some((argument) => referencedNames(argument, keys).has(target.name))
  );
}

function isRead(call: Call, context: Context): boolean {
  const method = estreeCallView(call, context).method;
  return method !== undefined && READ_WORDS.has(wordsOf(method)[0] ?? '');
}

export function adviceOf(call: Call, found: EnclosingLoop, context: Context): Advice {
  const keys = context.sourceCode.visitorKeys;
  if (isCarried(call, keys)) {
    return 'dependentQuery';
  }
  const items = itemNames(found, keys);
  const operands = setOperands(call, keys);
  if (operands.length > 0) {
    return isItemQuery(call, operands, items, keys) ? 'query' : 'setQuery';
  }
  return isRead(call, context) && hasForeignKey(call, items, keys) ? 'foreignKeyQuery' : 'query';
}
