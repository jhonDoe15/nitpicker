import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { targetNameOf } from '../../caches/partial-recursion/cache-ops.mts';
import { depthFirst, nameOf, nodeChildren } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';

export { targetNameOf };

export type ContainerAccess = {
  readonly container: string;
  readonly key: string;
};

export function memberPropertyName(node: TSESTree.Node): string | undefined {
  return node.type === AST_NODE_TYPES.PrivateIdentifier ? `#${node.name}` : nameOf(node);
}

export function bodyNodesOf(root: TSESTree.Node): TSESTree.Node[] {
  return [
    ...depthFirst<TSESTree.Node>(root, (node) =>
      node !== root && node.type === AST_NODE_TYPES.FunctionDeclaration ? [] : nodeChildren(node),
    ),
  ];
}

export function stripFallback(node: TSESTree.Node): TSESTree.Node {
  const inner = unwrapped(node);
  if (
    inner.type === AST_NODE_TYPES.LogicalExpression &&
    (inner.operator === '??' || inner.operator === '||')
  ) {
    return unwrapped(inner.left);
  }
  return inner;
}

export function isAssignmentLeft(node: TSESTree.Node): boolean {
  const { parent } = node;
  return parent?.type === AST_NODE_TYPES.AssignmentExpression && parent.left === node;
}

export function containerGetOf(node: TSESTree.Node): ContainerAccess | undefined {
  const inner = stripFallback(node);
  if (inner.type === AST_NODE_TYPES.CallExpression && inner.arguments.length >= 1) {
    const callee = unwrapped(inner.callee);
    if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
      return undefined;
    }
    const [first] = inner.arguments;
    const container = nameOf(callee.property) === 'get' ? targetNameOf(callee.object) : undefined;
    const key = first === undefined ? undefined : nameOf(unwrapped(first));
    return container !== undefined && key !== undefined ? { container, key } : undefined;
  }
  if (inner.type !== AST_NODE_TYPES.MemberExpression || !inner.computed) {
    return undefined;
  }
  const container = targetNameOf(inner.object);
  const key = nameOf(unwrapped(inner.property));
  return container !== undefined && key !== undefined ? { container, key } : undefined;
}
