import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../analysis/constant-resolution.mts';
import { callsWithin } from '../effects/held-scopes.mts';
import { awaited } from '../effects/lazy-relations.mts';
import { childrenOf, enclosingLoop, type EnclosingLoop } from '../loops/loop-shapes.mts';
import type { Context } from '../security/security-values.mts';
import { callEffects } from '../support/io-effects.mts';
import { contains, type SourceCode } from '../typed/node-views.mts';
import type { Site } from './write-sites.mts';

type MaybeNode = TSESTree.Node | undefined;
type Variable = TSESLint.Scope.Variable;
type Callback = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;
type Scoped = { readonly variables: readonly Variable[]; readonly scope: TSESTree.Node };
type Element = {
  readonly variables: readonly Variable[];
  readonly iterable: TSESTree.Node;
  readonly scope: TSESTree.ForOfStatement | TSESTree.FunctionDeclaration | Callback;
};

const { DefinitionType } = TSESLint.Scope;

function loopElement(
  found: EnclosingLoop | undefined,
  sourceCode: SourceCode,
): Element | undefined {
  if (found?.loop?.type === AST_NODE_TYPES.ForOfStatement) {
    const { left, right } = found.loop;
    const variables =
      left.type === AST_NODE_TYPES.VariableDeclaration ? sourceCode.getDeclaredVariables(left) : [];
    return { variables, iterable: right, scope: found.loop };
  }
  const callback = found?.callback;
  const call = callback?.parent;
  const callee =
    call?.type === AST_NODE_TYPES.CallExpression || call?.type === AST_NODE_TYPES.NewExpression
      ? call.callee
      : undefined;
  if (callback === undefined || callee?.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const [param] = callback.params;
  const variables = sourceCode
    .getDeclaredVariables(callback)
    .filter((variable) =>
      variable.defs.some((def) => param !== undefined && contains(param, def.name)),
    );
  return { variables, iterable: callee.object, scope: callback };
}

function initOf(variable: Variable | undefined): MaybeNode {
  const definition = variable?.defs[0];
  return definition?.type === DefinitionType.Variable
    ? (definition.node.init ?? undefined)
    : undefined;
}

function sourceCall(context: Context, iterable: MaybeNode): MaybeNode {
  const value = awaited(iterable);
  if (value?.type !== AST_NODE_TYPES.Identifier) {
    return value;
  }
  return awaited(initOf(findVariable(context, value, value.name)));
}

function isDatabaseRead(context: Context, iterable: MaybeNode): boolean {
  const call = sourceCall(context, iterable);
  if (call?.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const effects = callEffects(call, context);
  return effects.has('database') && !effects.has('write');
}

function references(variables: readonly Variable[], call: TSESTree.Node): boolean {
  return variables.some((variable) =>
    variable.references.some((reference) => contains(call, reference.identifier)),
  );
}

function argumentIdentifiers(
  call: Site['call'],
  visitorKeys: SourceCode['visitorKeys'],
): TSESTree.Identifier[] {
  const pending: TSESTree.Node[] =
    call.type === AST_NODE_TYPES.CallExpression ? [...call.arguments] : [];
  for (const node of pending) {
    pending.push(...childrenOf(node, visitorKeys));
  }
  return pending.filter((node) => node.type === AST_NODE_TYPES.Identifier);
}

function readRows(call: Site['call'], context: Context): Variable[] {
  const variables = argumentIdentifiers(call, context.sourceCode.visitorKeys).map((identifier) =>
    findVariable(context, identifier, identifier.name),
  );
  return [...new Set(variables)].filter(
    (variable): variable is Variable =>
      variable !== undefined && isDatabaseRead(context, initOf(variable)),
  );
}

function isMarkedAfter(element: Scoped, publish: TSESTree.Node, writes: Site[]): boolean {
  return writes.some(
    ({ call }) =>
      call.range[0] >= publish.range[1] &&
      contains(element.scope, call) &&
      references(element.variables, call),
  );
}

export function isRelayPublish(publish: Site, writes: Site[], context: Context): boolean {
  const element = loopElement(enclosingLoop(publish.call, context), context.sourceCode);
  const looped =
    element !== undefined &&
    references(element.variables, publish.call) &&
    isDatabaseRead(context, element.iterable);
  if (looped) {
    return isMarkedAfter(element, publish.call, writes);
  }
  const rows = readRows(publish.call, context);
  const single = { variables: rows, scope: context.sourceCode.ast };
  return rows.length > 0 && isMarkedAfter(single, publish.call, writes);
}

export function isRelayMark(
  call: TSESTree.CallExpression | TSESTree.TaggedTemplateExpression,
  context: Context,
): boolean {
  const element = loopElement(enclosingLoop(call, context), context.sourceCode);
  if (element === undefined || !references(element.variables, call)) {
    return false;
  }
  const body = element.scope.body;
  const publishes = callsWithin(body, context.sourceCode.visitorKeys).filter(
    (each) =>
      each.range[1] <= call.range[0] &&
      references(element.variables, each) &&
      callEffects(each, context).has('message'),
  );
  return (
    publishes.length > 0 &&
    callEffects(call, context).has('write') &&
    isDatabaseRead(context, element.iterable)
  );
}
