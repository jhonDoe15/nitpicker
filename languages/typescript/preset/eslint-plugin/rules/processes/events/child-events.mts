import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { importedCalleeName, type ModuleBindings } from '../../analysis/subprocess-calls.mts';
import { isFunctionNode } from '../../lifecycles/scope/close-scopes.mts';
import {
  ancestorsOf,
  depthFirst,
  nameOf,
  nodeChildren,
  variableNamed,
  type SourceCode,
} from '../../typed/node-views.mts';
import { unwrapped } from '../../streams/stream-sources.mts';

const CHILD_CALLS = new Set<string>(['spawn', 'fork', 'exec', 'execFile']);
const LISTENERS = new Set<string>(['on', 'once', 'addListener', 'prependListener']);
const OUTPUT_STREAMS = new Set<string>(['stdout', 'stderr']);

export type ChildListener = {
  readonly event: string;
  readonly handler: TSESTree.Node | undefined;
  readonly receiver: TSESTree.Node;
};

export function listener(call: TSESTree.CallExpression): ChildListener | undefined {
  const { callee } = call;
  const [event, handler] = call.arguments;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    !LISTENERS.has(nameOf(callee.property) ?? '') ||
    event?.type !== AST_NODE_TYPES.Literal ||
    typeof event.value !== 'string'
  ) {
    return undefined;
  }
  return { event: event.value, handler, receiver: callee.object };
}

function isChildCall(node: TSESTree.Node | undefined, bindings: ModuleBindings): boolean {
  const call = node === undefined ? undefined : unwrapped(node);
  return (
    call?.type === AST_NODE_TYPES.CallExpression &&
    CHILD_CALLS.has(importedCalleeName(call.callee, bindings) ?? '')
  );
}

export function childOf(
  sourceCode: SourceCode,
  receiver: TSESTree.Node,
  bindings: ModuleBindings,
): { readonly node: TSESTree.Node; readonly text: string | undefined } | undefined {
  const node = unwrapped(receiver);
  if (isChildCall(node, bindings)) {
    return { node, text: undefined };
  }
  if (node.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const declarator = variableNamed(sourceCode, node)?.defs[0]?.node;
  return declarator?.type === AST_NODE_TYPES.VariableDeclarator &&
    isChildCall(declarator.init ?? undefined, bindings)
    ? { node: declarator, text: node.name }
    : undefined;
}

export function enclosingFunction(node: TSESTree.Node): TSESTree.Node | undefined {
  return ancestorsOf(node).find(isFunctionNode);
}

function assignedNames(scope: TSESTree.Node): string[] {
  return [...depthFirst(scope, nodeChildren)].flatMap((node) => {
    if (node.type === AST_NODE_TYPES.AssignmentExpression) {
      return [nameOf(node.left) ?? ''];
    }
    const callee = node.type === AST_NODE_TYPES.CallExpression ? node.callee : undefined;
    return callee?.type === AST_NODE_TYPES.MemberExpression &&
      ['push', 'concat', 'add'].includes(nameOf(callee.property) ?? '')
      ? [nameOf(callee.object) ?? '']
      : [];
  });
}

export function collectedOutput(
  sourceCode: SourceCode,
  scope: TSESTree.Node,
  child: string,
): Set<string> {
  const names: string[] = [];
  for (const node of depthFirst(scope, nodeChildren)) {
    const heard = node.type === AST_NODE_TYPES.CallExpression ? listener(node) : undefined;
    if (
      heard?.event === 'data' &&
      OUTPUT_STREAMS.has(sourceCode.getText(heard.receiver).replace(`${child}.`, '')) &&
      sourceCode.getText(heard.receiver).startsWith(`${child}.`) &&
      heard.handler !== undefined
    ) {
      names.push(...assignedNames(heard.handler));
    }
    if (
      node.type === AST_NODE_TYPES.ForOfStatement &&
      OUTPUT_STREAMS.has(sourceCode.getText(node.right).replace(`${child}.`, ''))
    ) {
      names.push(...assignedNames(node.body));
    }
  }
  return new Set(names.filter((name) => name !== ''));
}

export function usesAny(handler: TSESTree.Node | undefined, names: ReadonlySet<string>): boolean {
  return (
    handler !== undefined &&
    names.size > 0 &&
    [...depthFirst(handler, nodeChildren)].some(
      (node) => node.type === AST_NODE_TYPES.Identifier && names.has(node.name),
    )
  );
}

export function awaitsInside(handler: TSESTree.Node | undefined): boolean {
  return (
    handler !== undefined &&
    isFunctionNode(handler) &&
    [...depthFirst<TSESTree.Node>(handler.body, nodeChildren)].some(
      (node) => node.type === AST_NODE_TYPES.AwaitExpression,
    )
  );
}

export function listensFor(
  scope: { readonly node: TSESTree.Node; readonly source: SourceCode },
  query: { readonly child: string; readonly event: string },
): boolean {
  return [...depthFirst(scope.node, nodeChildren)].some((node) => {
    const heard = node.type === AST_NODE_TYPES.CallExpression ? listener(node) : undefined;
    return heard?.event === query.event && scope.source.getText(heard.receiver) === query.child;
  });
}

const QUIET_STDIO = new Set<unknown>(['inherit', 'ignore']);

function isQuiet(value: TSESTree.Node): boolean {
  const parts = value.type === AST_NODE_TYPES.ArrayExpression ? value.elements : [value];
  return parts.every(
    (part) => part?.type === AST_NODE_TYPES.Literal && QUIET_STDIO.has(part.value),
  );
}

export function discardsOutput(child: { readonly node: TSESTree.Node }): boolean {
  const node = child.node.type === AST_NODE_TYPES.VariableDeclarator ? child.node.init : child.node;
  const call = node === null || node === undefined ? undefined : unwrapped(node);
  const options = call?.type === AST_NODE_TYPES.CallExpression ? call.arguments.at(-1) : undefined;
  return (
    options?.type === AST_NODE_TYPES.ObjectExpression &&
    options.properties.some(
      (property) =>
        property.type === AST_NODE_TYPES.Property &&
        nameOf(property.key) === 'stdio' &&
        isQuiet(property.value),
    )
  );
}

export function testsSignal(handler: TSESTree.Node | undefined): boolean {
  if (handler === undefined || !isFunctionNode(handler)) {
    return false;
  }
  const signal = nameOf(handler.params[1]);
  return (
    signal !== undefined &&
    [...depthFirst<TSESTree.Node>(handler.body, nodeChildren)].some(
      (node) => node.type === AST_NODE_TYPES.Identifier && node.name === signal,
    )
  );
}

export function defaultsExitCode(handler: TSESTree.Node | undefined): boolean {
  if (handler === undefined || !isFunctionNode(handler)) {
    return false;
  }
  const [code] = handler.params;
  if (code?.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  return [...depthFirst<TSESTree.Node>(handler.body, nodeChildren)].some(
    (node) =>
      node.type === AST_NODE_TYPES.LogicalExpression &&
      (node.operator === '??' || node.operator === '||') &&
      node.left.type === AST_NODE_TYPES.Identifier &&
      node.left.name === code.name &&
      node.right.type === AST_NODE_TYPES.Literal &&
      node.right.value === 0,
  );
}
