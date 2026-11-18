import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../../typed/node-views.mts';
import { isFunctionNode, unwrapExpression } from '../scope/close-scopes.mts';
import type { AddUse, Binding, BindingNode } from '../scope/collections.mts';

const SETTLER_NAME = /^(?:resolve|reject|deferred|resolver|settle)$/u;
const PENDING_NAME = /pending|in-?flight|waiting|waiters|callbacksById|requests/iu;
const DEFERRED_CALLS = new Set<string>(['deferred', 'defer', 'createDeferred', 'withResolvers']);
const SETTLER_TYPE =
  /^(?:Deferred|DeferredPromise|PromiseWithResolvers|Resolver)$|(?:Deferred|Resolver)$/u;

export function addedValue({ call, method }: AddUse): TSESTree.Node | undefined {
  if (call.type === AST_NODE_TYPES.AssignmentExpression) {
    return call.right;
  }
  return method === 'set' ? call.arguments[1] : call.arguments[0];
}

function keysOf(object: TSESTree.ObjectExpression): unknown[] {
  return object.properties.flatMap((property) =>
    property.type === AST_NODE_TYPES.Property && !property.computed
      ? [
          nameOf(property.key) ??
            (property.key.type === AST_NODE_TYPES.Literal ? property.key.value : undefined),
        ]
      : [],
  );
}

function isSettler(expression: TSESTree.Node | undefined, loose: boolean): boolean {
  if (expression === undefined) {
    return false;
  }
  const value = unwrapExpression(expression);
  if (loose && (isFunctionNode(value) || value.type === AST_NODE_TYPES.Identifier)) {
    return true;
  }
  if (value.type === AST_NODE_TYPES.ObjectExpression) {
    const keys = keysOf(value);
    return keys.includes('resolve') && keys.includes('reject');
  }
  if (value.type === AST_NODE_TYPES.Identifier) {
    return SETTLER_NAME.test(value.name);
  }
  if (value.type === AST_NODE_TYPES.NewExpression) {
    return SETTLER_TYPE.test(nameOf(value.callee) ?? '');
  }
  const callee = value.type === AST_NODE_TYPES.CallExpression ? value.callee : undefined;
  const name =
    callee === undefined
      ? undefined
      : (nameOf(callee) ??
        (callee.type === AST_NODE_TYPES.MemberExpression ? nameOf(callee.property) : undefined));
  return name !== undefined && DEFERRED_CALLS.has(name);
}

function typeSettles(type: TSESTree.TypeNode | undefined, named: boolean): boolean {
  if (type === undefined) {
    return false;
  }
  if (type.type === AST_NODE_TYPES.TSFunctionType) {
    return named;
  }
  if (type.type === AST_NODE_TYPES.TSTypeLiteral) {
    const names = type.members.map((member) => ('key' in member ? nameOf(member.key) : undefined));
    return names.includes('resolve') && names.includes('reject');
  }
  return (
    type.type === AST_NODE_TYPES.TSTypeReference && SETTLER_TYPE.test(nameOf(type.typeName) ?? '')
  );
}

function typeArgumentsOf(
  node: TSESTree.Node | undefined,
): TSESTree.TSTypeParameterInstantiation | undefined {
  return node !== undefined && 'typeArguments' in node
    ? (node.typeArguments ?? undefined)
    : undefined;
}

function createdValue(node: BindingNode): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.PropertyDefinition) {
    return node.value ?? undefined;
  }
  return node.type === AST_NODE_TYPES.VariableDeclarator ? (node.init ?? undefined) : node.right;
}

function declaredTypes(binding: Binding): TSESTree.TypeNode | undefined {
  const { node } = binding;
  const annotation =
    node.type === AST_NODE_TYPES.PropertyDefinition
      ? node.typeAnnotation?.typeAnnotation
      : undefined;
  const written = annotation === undefined ? undefined : typeArgumentsOf(annotation);
  const params = (written ?? typeArgumentsOf(createdValue(node)))?.params ?? [];
  return params.at(-1);
}

export function holdsSettlers(
  binding: Binding,
  values: readonly (TSESTree.Node | undefined)[],
): boolean {
  const named = PENDING_NAME.test(binding.name ?? '');
  return (
    values.some((value) => isSettler(value, named)) || typeSettles(declaredTypes(binding), named)
  );
}
