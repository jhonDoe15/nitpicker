import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { inside } from '../../../eslint-plugin/rules/decided/syntax.mts';
import { isFunction, isExport } from '../../../eslint-plugin/rules/typed/syntax-views.mts';
import {
  keptFix,
  reportedNode,
  unfixed,
  type Descriptor,
  type FixGuard,
  type GuardContext,
} from '../guard-types.mts';

type Binding = {
  readonly owner: TSESTree.Node;
  readonly name: string;
  readonly statement: TSESTree.Node;
};

function bindingOf(fn: TSESTree.Node): Binding | undefined {
  if (fn.type === AST_NODE_TYPES.FunctionDeclaration) {
    return fn.id === null ? undefined : { owner: fn, name: fn.id.name, statement: fn };
  }
  const { parent } = fn;
  return parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.init === fn &&
    parent.id.type === AST_NODE_TYPES.Identifier &&
    parent.id.typeAnnotation === undefined
    ? { owner: parent, name: parent.id.name, statement: parent.parent }
    : undefined;
}

function enclosingFunction(node: TSESTree.Node): TSESTree.Node | undefined {
  let current = node.parent;
  while (current !== undefined && !isFunction(current)) {
    if (current.type === AST_NODE_TYPES.TryStatement) {
      return undefined;
    }
    current = current.parent;
  }
  return current;
}

function returnedFromAsync(call: TSESTree.CallExpression): boolean {
  const { parent } = call;
  const returned =
    parent.type === AST_NODE_TYPES.ReturnStatement ||
    (parent.type === AST_NODE_TYPES.ArrowFunctionExpression && parent.body === call);
  const owner = returned ? enclosingFunction(call) : undefined;
  return owner !== undefined && isFunction(owner) && owner.async;
}

function isAwaitedCall(reference: TSESLint.Scope.Reference): boolean {
  const { identifier } = reference;
  const call = identifier.parent;
  if (call?.type !== AST_NODE_TYPES.CallExpression || call.callee !== identifier) {
    return false;
  }
  return call.parent.type === AST_NODE_TYPES.AwaitExpression || returnedFromAsync(call);
}

function onlyAwaited(context: GuardContext, binding: Binding): boolean {
  const variable = context.sourceCode
    .getDeclaredVariables(binding.owner)
    .find(({ name }) => name === binding.name);
  return (
    variable !== undefined &&
    variable.references.filter((reference) => !reference.isWrite()).every(isAwaitedCall)
  );
}

function throwsInside(fn: TSESTree.Node): boolean {
  return [...inside(fn)].some((node) => node.type === AST_NODE_TYPES.ThrowStatement);
}

export function requireAwaitGuard(descriptor: Descriptor, context: GuardContext): Descriptor {
  const fn = reportedNode(descriptor, 'missingAwait');
  if (fn === undefined) {
    return descriptor;
  }
  const binding = bindingOf(fn);
  const kept =
    binding !== undefined &&
    !isExport(binding.statement.parent ?? binding.statement) &&
    !throwsInside(fn) &&
    onlyAwaited(context, binding);
  return kept ? keptFix(descriptor) : unfixed(descriptor);
}

export const REQUIRE_AWAIT: FixGuard = { status: 'review', guard: requireAwaitGuard };
