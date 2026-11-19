import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { calleeName } from '../../analysis/node/call-text.mts';
import { findVariable } from '../../analysis/constant-resolution.mts';
import { type Context, unwrapped } from '../../security/security-values.mts';
import { moduleReference } from './module-references.mts';
import { appendAll } from '../../../../../../../shared/lists/lists.mts';

export type Splat = 'yes' | 'no' | 'unknown';

const { DefinitionType } = TSESLint.Scope;
const MAX_NODES = 400;

function initializerOf(context: Context, node: TSESTree.Identifier): TSESTree.Node | undefined {
  const [definition] = findVariable(context, node, node.name)?.defs ?? [];
  return definition?.type === DefinitionType.Variable
    ? (definition.node.init ?? undefined)
    : undefined;
}

type Walk = { splat: boolean; unresolved: boolean };
type Step = { readonly node: TSESTree.Node; readonly sensitive: boolean };

const SENSITIVE_KEYS = new Set(['format', 'transports']);

function keyName(property: TSESTree.Property): string | undefined {
  if (property.computed) {
    return undefined;
  }
  return property.key.type === AST_NODE_TYPES.Identifier ? property.key.name : undefined;
}

function isWinstonCall(context: Context, call: TSESTree.CallExpression): boolean {
  const module = moduleReference(context, call.callee)?.module;
  return module === 'winston' || module === 'logform';
}

function childSteps(nodes: readonly TSESTree.Node[], sensitive: boolean): Step[] {
  return nodes.map((child) => ({ node: unwrapped(child), sensitive }));
}

function propertySteps(node: TSESTree.ObjectExpression, sensitive: boolean, walk: Walk): Step[] {
  return node.properties.flatMap((property) => {
    if (property.type === AST_NODE_TYPES.SpreadElement) {
      walk.unresolved = true;
      return [];
    }
    const marked = sensitive || SENSITIVE_KEYS.has(keyName(property) ?? '');
    return [{ node: unwrapped(property.value), sensitive: marked }];
  });
}

type StepScope = { readonly context: Context; readonly walk: Walk };

function callSteps(
  call: TSESTree.CallExpression,
  sensitive: boolean,
  { context, walk }: StepScope,
) {
  walk.splat = walk.splat || calleeName(call.callee) === 'splat';
  walk.unresolved = walk.unresolved || (sensitive && !isWinstonCall(context, call));
  return childSteps(call.arguments, sensitive);
}

function identifierSteps(
  node: TSESTree.Identifier,
  sensitive: boolean,
  { context, walk }: StepScope,
) {
  const initializer = initializerOf(context, node);
  walk.unresolved = walk.unresolved || (sensitive && initializer === undefined);
  return initializer === undefined ? [] : childSteps([initializer], sensitive);
}

function stepsOf(step: Step, context: Context, walk: Walk): Step[] {
  const { node, sensitive } = step;
  if (node.type === AST_NODE_TYPES.ObjectExpression) {
    return propertySteps(node, sensitive, walk);
  }
  if (node.type === AST_NODE_TYPES.ArrayExpression) {
    return childSteps(
      node.elements.filter((element) => element !== null),
      sensitive,
    );
  }
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return callSteps(node, sensitive, { context, walk });
  }
  if (node.type === AST_NODE_TYPES.NewExpression) {
    return childSteps(node.arguments, sensitive);
  }
  if (node.type === AST_NODE_TYPES.Identifier) {
    return identifierSteps(node, sensitive, { context, walk });
  }
  const inert =
    node.type === AST_NODE_TYPES.Literal ||
    node.type === AST_NODE_TYPES.TemplateLiteral ||
    node.type === AST_NODE_TYPES.MemberExpression;
  walk.unresolved = walk.unresolved || (sensitive && !inert);
  return [];
}

export function splatOf(context: Context, options: TSESTree.Node | undefined): Splat {
  if (options === undefined) {
    return 'no';
  }
  const root = unwrapped(options);
  const walk: Walk = { splat: false, unresolved: false };
  const pending: Step[] = [
    { node: root, sensitive: root.type !== AST_NODE_TYPES.ObjectExpression },
  ];
  const seen = new Set<TSESTree.Node>();
  for (const step of pending) {
    if (!seen.has(step.node) && seen.size < MAX_NODES) {
      seen.add(step.node);
      appendAll(pending, stepsOf(step, context, walk));
    }
  }
  if (walk.splat) {
    return 'yes';
  }
  return walk.unresolved ? 'unknown' : 'no';
}
