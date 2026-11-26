import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberRoot, nameOf } from '../../typed/node-views.mts';
import { descendants, methodCall, type FileFunction } from '../graph/file-calls.mts';

export type GuardUse = {
  readonly guard: string;
  readonly method: string;
  readonly param: string;
  readonly call: TSESTree.CallExpression;
};

const GUARD_TYPES = new Set(['Set', 'Map', 'WeakSet', 'WeakMap']);
const KEYED = new Set(['add', 'has', 'set', 'get', 'delete']);

function isGuardValue(node: TSESTree.Node | undefined): boolean {
  return node?.type === AST_NODE_TYPES.NewExpression && GUARD_TYPES.has(nameOf(node.callee) ?? '');
}

function fieldName(node: TSESTree.Node): string | undefined {
  if (node.type === AST_NODE_TYPES.VariableDeclarator && isGuardValue(node.init ?? undefined)) {
    const statement = node.parent.parent;
    const topLevel =
      statement.type === AST_NODE_TYPES.Program ||
      statement.type === AST_NODE_TYPES.ExportNamedDeclaration;
    return topLevel ? nameOf(node.id) : undefined;
  }
  if (node.type === AST_NODE_TYPES.PropertyDefinition && isGuardValue(node.value ?? undefined)) {
    return node.computed ? undefined : nameOf(node.key);
  }
  return node.type === AST_NODE_TYPES.AssignmentExpression &&
    node.left.type === AST_NODE_TYPES.MemberExpression &&
    node.left.object.type === AST_NODE_TYPES.ThisExpression &&
    isGuardValue(node.right)
    ? nameOf(node.left.property)
    : undefined;
}

export function sharedGuards(program: TSESTree.Program): Set<string> {
  return new Set(descendants(program).flatMap((node) => fieldName(node) ?? []));
}

function keyParam(call: TSESTree.CallExpression, fn: FileFunction): string | undefined {
  const [first] = call.arguments;
  const root = first === undefined ? undefined : nameOf(memberRoot(first));
  return root !== undefined && fn.params.has(root) ? root : undefined;
}

export function keyedUses(fn: FileFunction): GuardUse[] {
  return descendants(fn.node.body).flatMap((node) => {
    if (node.type !== AST_NODE_TYPES.CallExpression) {
      return [];
    }
    const call = methodCall(node);
    const param = call !== undefined && KEYED.has(call.method) ? keyParam(node, fn) : undefined;
    return call === undefined || param === undefined
      ? []
      : [{ guard: call.receiver, method: call.method, param, call: node }];
  });
}

export function touched(fn: FileFunction): Set<string> {
  return new Set(
    descendants(fn.node.body).flatMap((node) => {
      if (node.type !== AST_NODE_TYPES.MemberExpression || node.computed) {
        return [];
      }
      const name =
        node.object.type === AST_NODE_TYPES.ThisExpression
          ? nameOf(node.property)
          : nameOf(node.object);
      return name === undefined ? [] : [name];
    }),
  );
}
