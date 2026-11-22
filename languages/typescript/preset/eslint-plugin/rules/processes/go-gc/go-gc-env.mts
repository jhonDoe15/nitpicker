import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, type SourceContext } from '../../analysis/constant-resolution.mts';
import { propertyKeyName } from '../../analysis/test-code-analysis.mts';
import { plainText } from '../../typed/node-views.mts';
import { ASSERTION_FORMS, resolvedThrough } from '../../typed/syntax-views.mts';
import { optionsMayChange } from '../process-options-mutations.mts';

type MaybeNode = TSESTree.Node | undefined;
type EnvStatus = 'has-gc' | 'missing-gc' | 'opaque';
type EnvLookup =
  { readonly kind: 'found'; readonly value: MaybeNode } | { readonly kind: 'opaque' };
type Traversal = { readonly call: TSESTree.Node; readonly visited: Set<TSESTree.Node> };

const GC_KEYS = new Set(['GOGC', 'GOMEMLIMIT']);
const { DefinitionType } = TSESLint.Scope;

function isNullish(node: MaybeNode): boolean {
  return (
    node === undefined ||
    (node.type === AST_NODE_TYPES.Literal && node.value === null) ||
    (node.type === AST_NODE_TYPES.Identifier && node.name === 'undefined')
  );
}

function isProcessEnv(context: SourceContext, node: MaybeNode): boolean {
  return node !== undefined && plainText(node, context.sourceCode) === 'process.env';
}

function resolveBinding(context: SourceContext, node: MaybeNode): MaybeNode {
  const unwrapped = resolvedThrough(context, node, ASSERTION_FORMS);
  if (unwrapped?.type !== AST_NODE_TYPES.Identifier) {
    return unwrapped;
  }
  const variable = findVariable(context, unwrapped, unwrapped.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (
    definition?.type === DefinitionType.Variable &&
    definition.node.id.type === AST_NODE_TYPES.Identifier &&
    definition.node.init !== null
  ) {
    return resolvedThrough(context, definition.node.init, ASSERTION_FORMS);
  }
  return unwrapped;
}

function inspectEnvProperty(
  context: SourceContext,
  property: TSESTree.ObjectLiteralElement,
  state: { hasGc: boolean; hasOpaque: boolean; traversal: Traversal },
): void {
  if (property.type === AST_NODE_TYPES.SpreadElement) {
    const spread = envStatus(context, property.argument, state.traversal);
    state.hasGc = state.hasGc || spread === 'has-gc';
    state.hasOpaque = state.hasOpaque || spread === 'opaque';
    return;
  }
  const key = propertyKeyName(property);
  if (key !== undefined && GC_KEYS.has(key)) {
    const value = resolvedThrough(context, property.value, ASSERTION_FORMS);
    state.hasGc = state.hasGc || !isNullish(value);
    return;
  }
  state.hasOpaque = state.hasOpaque || (property.computed && key === undefined);
}

type ObjectResolution =
  | { readonly kind: 'missing' }
  | { readonly kind: 'opaque' }
  | { readonly kind: 'object'; readonly node: TSESTree.ObjectExpression };

function resolveObjectExpression(
  context: SourceContext,
  node: MaybeNode,
  { traversal, isMissing }: { traversal: Traversal; isMissing: (candidate: MaybeNode) => boolean },
): ObjectResolution {
  if (isMissing(node)) {
    return { kind: 'missing' };
  }
  if (optionsMayChange(context, node, traversal.call)) {
    return { kind: 'opaque' };
  }
  const resolved = resolveBinding(context, node);
  if (isMissing(resolved)) {
    return { kind: 'missing' };
  }
  if (resolved?.type !== AST_NODE_TYPES.ObjectExpression || traversal.visited.has(resolved)) {
    return { kind: 'opaque' };
  }
  return { kind: 'object', node: resolved };
}

function envStatus(context: SourceContext, node: MaybeNode, traversal: Traversal): EnvStatus {
  const isMissing = (candidate: MaybeNode): boolean =>
    isNullish(candidate) || isProcessEnv(context, candidate);
  const resolved = resolveObjectExpression(context, node, { traversal, isMissing });
  if (resolved.kind !== 'object') {
    return resolved.kind === 'missing' ? 'missing-gc' : 'opaque';
  }
  traversal.visited.add(resolved.node);
  const state = { hasGc: false, hasOpaque: false, traversal };
  for (const property of resolved.node.properties) {
    inspectEnvProperty(context, property, state);
  }
  if (state.hasGc) {
    return 'has-gc';
  }
  return state.hasOpaque ? 'opaque' : 'missing-gc';
}

function applyOptionProperty(
  context: SourceContext,
  property: TSESTree.ObjectLiteralElement,
  state: { current: EnvLookup; traversal: Traversal },
): EnvLookup {
  if (property.type === AST_NODE_TYPES.SpreadElement) {
    const spread = optionsEnvNode(context, property.argument, state.traversal);
    return spread.kind === 'opaque' || spread.value !== undefined ? spread : state.current;
  }
  const key = propertyKeyName(property);
  if (key === 'env') {
    return { kind: 'found', value: property.value };
  }
  return property.computed && key === undefined ? { kind: 'opaque' } : state.current;
}

function optionsEnvNode(
  context: SourceContext,
  options: MaybeNode,
  traversal: Traversal,
): EnvLookup {
  const resolved = resolveObjectExpression(context, options, { traversal, isMissing: isNullish });
  if (resolved.kind !== 'object') {
    return resolved.kind === 'missing' ? { kind: 'found', value: undefined } : { kind: 'opaque' };
  }
  traversal.visited.add(resolved.node);
  let current: EnvLookup = { kind: 'found', value: undefined };
  for (const property of resolved.node.properties) {
    current = applyOptionProperty(context, property, { current, traversal });
  }
  return current;
}

export function lacksGoGcTarget(
  context: SourceContext,
  call: TSESTree.CallExpression,
  options: MaybeNode,
): boolean {
  const envLookup = optionsEnvNode(context, options, { call, visited: new Set() });
  if (envLookup.kind === 'opaque') {
    return false;
  }
  return envStatus(context, envLookup.value, { call, visited: new Set() }) === 'missing-gc';
}
