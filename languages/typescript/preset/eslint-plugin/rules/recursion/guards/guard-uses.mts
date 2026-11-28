import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberRoot, nameOf } from '../../typed/node-views.mts';
import { descendants, isModuleLevel, methodCall, type FileFunction } from '../graph/file-calls.mts';

export type GuardUse = {
  readonly guard: string;
  readonly method: string;
  readonly param: string;
  readonly call: TSESTree.CallExpression;
};

const GUARD_TYPES = new Set(['Set', 'Map', 'WeakSet', 'WeakMap']);
const KEYED = new Set(['add', 'has', 'set', 'get', 'delete']);

function isGuardValue(node: TSESTree.Node | null | undefined): boolean {
  return (
    node?.type === AST_NODE_TYPES.NewExpression && GUARD_TYPES.has(String(nameOf(node.callee)))
  );
}

function moduleGuard(node: TSESTree.VariableDeclarator): string | undefined {
  return isGuardValue(node.init) && isModuleLevel(node.parent.parent) ? nameOf(node.id) : undefined;
}

function classGuard(node: TSESTree.PropertyDefinition): string | undefined {
  return isGuardValue(node.value) && !node.computed ? nameOf(node.key) : undefined;
}

function assignedGuard(node: TSESTree.AssignmentExpression): string | undefined {
  return isGuardValue(node.right) &&
    node.left.type === AST_NODE_TYPES.MemberExpression &&
    node.left.object.type === AST_NODE_TYPES.ThisExpression
    ? nameOf(node.left.property)
    : undefined;
}

function fieldName(node: TSESTree.Node): string | undefined {
  if (node.type === AST_NODE_TYPES.VariableDeclarator) {
    return moduleGuard(node);
  }
  if (node.type === AST_NODE_TYPES.PropertyDefinition) {
    return classGuard(node);
  }
  return node.type === AST_NODE_TYPES.AssignmentExpression ? assignedGuard(node) : undefined;
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
