import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberRoot, nodeChildren, nodesWithoutNested } from '../../typed/node-views.mts';

export type IsRead = (call: TSESTree.CallExpression) => boolean;

const CHEAP_RECEIVERS = new Set([
  'console',
  'logger',
  'log',
  'Math',
  'JSON',
  'Object',
  'Array',
  'Number',
  'String',
]);
const BODY_READS = new Set(['json', 'text', 'blob', 'arrayBuffer']);
const SYNC_TRANSFORMS = new Set([
  'map',
  'filter',
  'find',
  'some',
  'every',
  'reduce',
  'flatMap',
  'slice',
  'at',
  'includes',
  'join',
]);

function patternParts(node: TSESTree.Node): TSESTree.Node[] {
  if (node.type === AST_NODE_TYPES.ArrayPattern) {
    return node.elements.filter((element) => element !== null);
  }
  if (node.type === AST_NODE_TYPES.ObjectPattern) {
    return node.properties.map((property) =>
      property.type === AST_NODE_TYPES.Property ? property.value : property,
    );
  }
  if (node.type === AST_NODE_TYPES.RestElement) {
    return [node.argument];
  }
  return node.type === AST_NODE_TYPES.AssignmentPattern ? [node.left] : [];
}

function boundNames(pattern: TSESTree.Node, names: Set<string>): void {
  const pending: TSESTree.Node[] = [pattern];
  for (const node of pending) {
    if (node.type === AST_NODE_TYPES.Identifier) {
      names.add(node.name);
    }
    for (const part of patternParts(node)) {
      pending.push(part);
    }
  }
}

function localNames(fn: TSESTree.FunctionLike, nodes: readonly TSESTree.Node[]): Set<string> {
  const names = new Set<string>();
  for (const parameter of fn.params) {
    boundNames(parameter, names);
  }
  for (const node of nodes) {
    if (node.type === AST_NODE_TYPES.VariableDeclarator) {
      boundNames(node.id, names);
    }
  }
  return names;
}

function writeTarget(node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.AssignmentExpression) {
    return node.left;
  }
  return node.type === AST_NODE_TYPES.UpdateExpression ? node.argument : undefined;
}

function writesOutside(node: TSESTree.Node, locals: ReadonlySet<string>): boolean {
  const target = writeTarget(node);
  if (target === undefined) {
    return false;
  }
  const root = memberRoot(target);
  return root.type !== AST_NODE_TYPES.Identifier || !locals.has(root.name);
}

function transforms(call: TSESTree.CallExpression): boolean {
  const { callee } = call;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return false;
  }
  const root = memberRoot(callee.object);
  return (
    (callee.property.type === AST_NODE_TYPES.Identifier &&
      SYNC_TRANSFORMS.has(callee.property.name)) ||
    (root.type === AST_NODE_TYPES.Identifier && CHEAP_RECEIVERS.has(root.name))
  );
}

function readsBody(call: TSESTree.CallExpression): boolean {
  const { callee } = call;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    BODY_READS.has(callee.property.name) &&
    call.arguments.length === 0
  );
}

function within(node: TSESTree.Node, outer: TSESTree.Node): boolean {
  return node.range[0] >= outer.range[0] && node.range[1] <= outer.range[1];
}

function awaitsRead(node: TSESTree.Node, isRead: IsRead): boolean {
  return (
    node.type !== AST_NODE_TYPES.AwaitExpression ||
    (node.argument.type === AST_NODE_TYPES.CallExpression &&
      (isRead(node.argument) || readsBody(node.argument)))
  );
}

export function isReadOnlyBody(fn: TSESTree.FunctionLike, isRead: IsRead): boolean {
  const body = fn.body;
  if (body === null || body === undefined) {
    return false;
  }
  const nodes = nodesWithoutNested(body, new Set(), nodeChildren);
  const calls = nodes.filter(
    (node): node is TSESTree.CallExpression => node.type === AST_NODE_TYPES.CallExpression,
  );
  const locals = localNames(fn, nodes);
  const reads = calls.filter(isRead);
  return (
    reads.length > 0 &&
    calls.every(
      (call) => transforms(call) || readsBody(call) || reads.some((read) => within(call, read)),
    ) &&
    !nodes.some(
      (node) =>
        writesOutside(node, locals) ||
        node.type === AST_NODE_TYPES.YieldExpression ||
        node.type === AST_NODE_TYPES.ThrowStatement ||
        !awaitsRead(node, isRead),
    )
  );
}
