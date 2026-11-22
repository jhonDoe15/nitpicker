import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode, type SourceContext } from '../../analysis/constant-resolution.mts';
import { forEachNode } from '../../analysis/node/wrapper-calls.mts';
import { isReadIdentifier, patternNames, referencesAny } from '../support/ast-walk.mts';

export { isUniqueOrLiteralIterable, patternNames } from './loop-iterables.mts';

const SCAN_METHODS = new Set(['some', 'every', 'filter', 'find', 'findIndex']);

export type KeyLookup = {
  readonly keyText: string;
  readonly keyVar: string | undefined;
};

export type LoopContext = {
  readonly body: TSESTree.Node;
  readonly outerBindings: Set<string>;
  readonly keyVars: Map<string, string>;
  readonly lookupVars: Map<string, KeyLookup>;
};

function unwrapStep(node: TSESTree.Node): TSESTree.Node | undefined {
  if (
    node.type === AST_NODE_TYPES.ChainExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression
  ) {
    return node.expression;
  }
  if (
    node.type === AST_NODE_TYPES.LogicalExpression &&
    (node.operator === '??' || node.operator === '||')
  ) {
    return node.left;
  }
  return undefined;
}

function unwrapCollection(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  let next = unwrapStep(current);
  while (next !== undefined) {
    current = next;
    next = unwrapStep(current);
  }
  return current;
}

function extractKeyArgument(node: TSESTree.Node): TSESTree.Expression | undefined {
  const inner = unwrapCollection(node);
  if (
    inner.type === AST_NODE_TYPES.CallExpression &&
    inner.callee.type === AST_NODE_TYPES.MemberExpression &&
    !inner.callee.computed &&
    inner.callee.property.type === AST_NODE_TYPES.Identifier &&
    inner.callee.property.name === 'get' &&
    inner.arguments.length === 1 &&
    inner.arguments[0]?.type !== AST_NODE_TYPES.SpreadElement
  ) {
    return inner.arguments[0];
  }
  if (inner.type === AST_NODE_TYPES.MemberExpression && inner.computed) {
    return inner.property;
  }
  return undefined;
}

export function lookupFromExpression(
  context: SourceContext,
  node: TSESTree.Node,
  loop: LoopContext,
): KeyLookup | undefined {
  const inner = unwrapCollection(node);
  if (inner.type === AST_NODE_TYPES.Identifier) {
    return loop.lookupVars.get(inner.name);
  }
  const keyArg = extractKeyArgument(inner);
  if (keyArg === undefined) {
    return undefined;
  }
  if (keyArg.type === AST_NODE_TYPES.Identifier && loop.keyVars.has(keyArg.name)) {
    return { keyText: loop.keyVars.get(keyArg.name) ?? keyArg.name, keyVar: keyArg.name };
  }
  if (!referencesAny(context, keyArg, loop.outerBindings)) {
    return undefined;
  }
  return {
    keyText: context.sourceCode.getText(keyArg),
    keyVar: keyArg.type === AST_NODE_TYPES.Identifier ? keyArg.name : undefined,
  };
}

function isAllowedKeyAccess(
  context: SourceContext,
  node: TSESTree.Identifier,
  lookup: KeyLookup,
): boolean {
  if (lookup.keyVar !== undefined && node.name === lookup.keyVar) {
    return true;
  }
  const { parent } = node;
  return (
    parent?.type === AST_NODE_TYPES.MemberExpression &&
    parent.object === node &&
    context.sourceCode.getText(parent) === lookup.keyText
  );
}

function addAll(target: Set<string>, source: Iterable<string>): void {
  for (const name of source) {
    target.add(name);
  }
}

function collectShadowed(context: SourceContext, root: TSESTree.Node): Set<string> {
  const shadowed = new Set<string>();
  if (isFunctionNode(root)) {
    for (const param of root.params) {
      addAll(shadowed, patternNames(param));
    }
  }
  forEachNode(context, root, (node) => {
    if (node.type === AST_NODE_TYPES.VariableDeclarator) {
      addAll(shadowed, patternNames(node.id));
    }
  });
  return shadowed;
}

type OuterCheckState = {
  readonly loop: LoopContext;
  readonly lookup: KeyLookup;
  readonly shadowed: ReadonlySet<string>;
};

function subtreeDependsOnOuter(
  context: SourceContext,
  root: TSESTree.Node,
  state: OuterCheckState,
): boolean {
  let depends = false;
  forEachNode(context, root, (node) => {
    if (depends || node.type !== AST_NODE_TYPES.Identifier || !isReadIdentifier(node)) {
      return;
    }
    if (!state.shadowed.has(node.name) && state.loop.outerBindings.has(node.name)) {
      depends = !isAllowedKeyAccess(context, node, state.lookup);
    }
  });
  return depends;
}

export function scanDependsOnOuter(
  context: SourceContext,
  scanRoot: TSESTree.Node,
  { loop, lookup }: { loop: LoopContext; lookup: KeyLookup },
): boolean {
  return subtreeDependsOnOuter(context, scanRoot, {
    loop,
    lookup,
    shadowed: collectShadowed(context, scanRoot),
  });
}

export function innerLoopTestDependsOnOuter(
  context: SourceContext,
  innerLoop: TSESTree.ForOfStatement,
  { loop, lookup }: { loop: LoopContext; lookup: KeyLookup },
): boolean {
  const state: OuterCheckState = { loop, lookup, shadowed: collectShadowed(context, innerLoop) };
  let hasTest = false;
  let depends = false;
  forEachNode(context, innerLoop.body, (node) => {
    if (
      node.type === AST_NODE_TYPES.IfStatement ||
      node.type === AST_NODE_TYPES.ConditionalExpression
    ) {
      hasTest = true;
      depends = depends || subtreeDependsOnOuter(context, node.test, state);
    }
  });
  return !hasTest || depends;
}

export function isScanMethodCall(node: TSESTree.CallExpression): boolean {
  return (
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    node.callee.property.type === AST_NODE_TYPES.Identifier &&
    SCAN_METHODS.has(node.callee.property.name) &&
    node.arguments.length >= 1
  );
}
