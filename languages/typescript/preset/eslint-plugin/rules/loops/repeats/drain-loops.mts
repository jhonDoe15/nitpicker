import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../../security/security-values.mts';
import { nameOf } from '../../typed/node-views.mts';
import { isFunction } from '../../typed/syntax-views.mts';
import { cachedValue } from '../../../../../../../shared/values/caching/cached-value.mts';
import { chainArguments, chainFrom, outerCalls, type Call } from '../builders/chain-execution.mts';
import { descendants, type LoopNode, type VisitorKeys } from '../loop-shapes.mts';
import { bodyDeclaredNames, itemNames, referencedNames } from './loop-names.mts';

const PAGE_KEYS = new Set(['take', 'limit', 'batchSize', 'pageSize', 'perPage', 'first', 'size']);
const PAGE_METHODS = new Set(['take', 'limit', 'top']);
const drained = new WeakMap<LoopNode, ReadonlySet<string>>();

function isCall(node: TSESTree.Node): node is Call {
  return (
    node.type === AST_NODE_TYPES.CallExpression ||
    node.type === AST_NODE_TYPES.TaggedTemplateExpression
  );
}

function isPageKey(node: TSESTree.Node): boolean {
  const key =
    node.type === AST_NODE_TYPES.Property && !node.computed ? nameOf(node.key) : undefined;
  return key !== undefined && PAGE_KEYS.has(key);
}

function takesPage(call: Call, visitorKeys: VisitorKeys): boolean {
  const limited = outerCalls(call).some((outer) => {
    const callee = outer.type === AST_NODE_TYPES.CallExpression ? outer.callee : undefined;
    return (
      callee?.type === AST_NODE_TYPES.MemberExpression &&
      PAGE_METHODS.has(nameOf(callee.property) ?? '')
    );
  });
  return (
    limited ||
    chainArguments(call).some((argument) =>
      descendants(argument, visitorKeys, isFunction).some(isPageKey),
    )
  );
}

function resultName(call: Call): string | undefined {
  const top = chainFrom(call).at(-1) ?? call;
  const value = top.parent?.type === AST_NODE_TYPES.AwaitExpression ? top.parent : top;
  const holder = value.parent;
  if (holder?.type === AST_NODE_TYPES.VariableDeclarator && holder.init === value) {
    return holder.id.type === AST_NODE_TYPES.Identifier ? holder.id.name : undefined;
  }
  const target = holder?.type === AST_NODE_TYPES.AssignmentExpression ? holder.left : undefined;
  return target?.type === AST_NODE_TYPES.Identifier ? target.name : undefined;
}

function measuresEmptiness(test: TSESTree.Node, name: string, visitorKeys: VisitorKeys): boolean {
  return descendants(test, visitorKeys, isFunction).some((node) => {
    const isLength =
      node.type === AST_NODE_TYPES.MemberExpression &&
      nameOf(node.property) === 'length' &&
      nameOf(node.object) === name;
    const isNegated =
      node.type === AST_NODE_TYPES.UnaryExpression &&
      node.operator === '!' &&
      nameOf(node.argument) === name;
    return isLength || isNegated;
  });
}

function leaves(node: TSESTree.Node, tested: ReadonlySet<string>, keys: VisitorKeys): boolean {
  return descendants(node, keys, isFunction).some(
    (each) =>
      each.type === AST_NODE_TYPES.BreakStatement ||
      each.type === AST_NODE_TYPES.ReturnStatement ||
      each.type === AST_NODE_TYPES.ThrowStatement ||
      (each.type === AST_NODE_TYPES.AssignmentExpression &&
        each.left.type === AST_NODE_TYPES.Identifier &&
        tested.has(each.left.name)),
  );
}

function endsOnEmpty(loop: LoopNode, name: string, visitorKeys: VisitorKeys): boolean {
  const test = 'test' in loop ? loop.test : null;
  const tested = test === null ? new Set<string>() : referencedNames(test, visitorKeys);
  if (test !== null && measuresEmptiness(test, name, visitorKeys)) {
    return true;
  }
  return descendants(loop.body, visitorKeys, isFunction).some((node) => {
    if (node.type === AST_NODE_TYPES.IfStatement) {
      return (
        measuresEmptiness(node.test, name, visitorKeys) &&
        leaves(node.consequent, tested, visitorKeys)
      );
    }
    return (
      node.type === AST_NODE_TYPES.AssignmentExpression &&
      node.left.type === AST_NODE_TYPES.Identifier &&
      tested.has(node.left.name) &&
      measuresEmptiness(node.right, name, visitorKeys)
    );
  });
}

function usesLoopState(call: Call, loop: LoopNode, visitorKeys: VisitorKeys): boolean {
  const bound = new Set([
    ...bodyDeclaredNames(loop, visitorKeys),
    ...itemNames({ loop, child: loop.body }, visitorKeys),
  ]);
  return chainArguments(call).some((argument) =>
    [...referencedNames(argument, visitorKeys)].some((name) => bound.has(name)),
  );
}

function isPageRead(call: Call, loop: LoopNode, visitorKeys: VisitorKeys): string | undefined {
  const name = resultName(call);
  const drains =
    name !== undefined &&
    takesPage(call, visitorKeys) &&
    !usesLoopState(call, loop, visitorKeys) &&
    endsOnEmpty(loop, name, visitorKeys);
  return drains ? name : undefined;
}

function drainResults(loop: LoopNode, visitorKeys: VisitorKeys): ReadonlySet<string> {
  return cachedValue(drained, loop, () => {
    const names = descendants(loop.body, visitorKeys, isFunction)
      .filter(isCall)
      .map((call) => isPageRead(call, loop, visitorKeys))
      .filter((name) => name !== undefined);
    return new Set(names);
  });
}

export function isDrainCall(call: Call, loop: LoopNode | undefined, context: Context): boolean {
  if (
    loop === undefined ||
    loop.type === AST_NODE_TYPES.ForOfStatement ||
    loop.type === AST_NODE_TYPES.ForInStatement
  ) {
    return false;
  }
  const { visitorKeys } = context.sourceCode;
  const results = drainResults(loop, visitorKeys);
  if (results.size === 0) {
    return false;
  }
  const passesPage = chainArguments(call).some((argument) =>
    [...referencedNames(argument, visitorKeys)].some((name) => results.has(name)),
  );
  return passesPage || isPageRead(call, loop, visitorKeys) !== undefined;
}
