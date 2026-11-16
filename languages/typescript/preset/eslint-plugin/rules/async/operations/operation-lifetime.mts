import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  isFunctionNode,
  resolveConstant,
  resolveFunction,
} from '../../analysis/constant-resolution.mts';
import { configState } from '../../security/http/http-config.mts';
import { memberName, unwrapped, type Context } from '../../security/security-values.mts';
import { ancestorsOf, nameOf, type SourceCode } from '../../typed/node-views.mts';
import { settlementChain } from './race-operations.mts';
import { globalMemberCall, nodesIn } from './syntax-nodes.mts';

export type Race = {
  readonly node: TSESTree.CallExpression;
  readonly timeouts: readonly TSESTree.Node[];
};
type Resolved = NonNullable<ReturnType<typeof resolveFunction>>;

const SIGNAL_KEYS = ['signal', 'abortSignal', 'cancelToken'];
const SIGNAL_NAME = /^(?:signal|controller|abortController|cancelToken|[a-z]\w*Signal)$/u;
const OPTIONS_NAME = /^(?:options?|opts?|init|settings)$/u;
const SIGNAL_FACTORIES = ['timeout', 'any', 'abort'];
const CLEANUP_METHODS = new Set<string>([
  'abort',
  'cancel',
  'destroy',
  'kill',
  'terminate',
  'dispose',
]);
const HANDLE_TYPES = new Set<string>([
  AST_NODE_TYPES.Identifier,
  AST_NODE_TYPES.MemberExpression,
  AST_NODE_TYPES.ThisExpression,
]);

function ownsLifetime(context: Context, argument: TSESTree.Node): boolean {
  const target = unwrapped(resolveConstant(context, unwrapped(argument)));
  if (target === undefined) {
    return false;
  }
  if (target.type === AST_NODE_TYPES.SpreadElement) {
    return true;
  }
  if (target.type === AST_NODE_TYPES.ObjectExpression) {
    return configState(context, argument, SIGNAL_KEYS) !== 'missing';
  }
  if (target.type === AST_NODE_TYPES.Identifier) {
    return SIGNAL_NAME.test(target.name) || OPTIONS_NAME.test(target.name);
  }
  if (target.type === AST_NODE_TYPES.MemberExpression) {
    return SIGNAL_NAME.test(memberName(target) ?? '');
  }
  return (
    target.type === AST_NODE_TYPES.CallExpression &&
    SIGNAL_FACTORIES.some((name) => globalMemberCall(context, target, `AbortSignal.${name}`))
  );
}

export function passesLifetimeOwner(context: Context, call: TSESTree.CallExpression): boolean {
  return call.arguments.some((argument) => ownsLifetime(context, argument));
}

function parameterIdentifiers(fn: Resolved): TSESTree.Node[] {
  return fn.params.flatMap((param): TSESTree.Node[] => {
    const inner = param.type === AST_NODE_TYPES.AssignmentPattern ? param.left : param;
    if (inner.type === AST_NODE_TYPES.ObjectPattern) {
      return inner.properties.map((property) =>
        property.type === AST_NODE_TYPES.Property ? property.key : property.argument,
      );
    }
    return [inner];
  });
}

function typedAsSignal(param: TSESTree.Identifier, sourceCode: SourceCode): boolean {
  return param.typeAnnotation !== undefined && sourceCode.getText(param).includes('AbortSignal');
}

export function signalParameterOf(context: Context, callee: TSESTree.Node): string | undefined {
  const fn = resolveFunction(context, unwrapped(callee));
  if (fn === undefined) {
    return undefined;
  }
  const named = parameterIdentifiers(fn).find(
    (identifier) =>
      identifier.type === AST_NODE_TYPES.Identifier &&
      (SIGNAL_NAME.test(identifier.name) || typedAsSignal(identifier, context.sourceCode)),
  );
  return named?.type === AST_NODE_TYPES.Identifier ? named.name : undefined;
}

export function closesOverSignal(context: Context, callee: TSESTree.Node): boolean {
  const fn = resolveFunction(context, unwrapped(callee));
  if (fn === undefined) {
    return false;
  }
  const own = new Set(parameterIdentifiers(fn).map((identifier) => nameOf(identifier)));
  return nodesIn(fn.body ?? undefined).some(
    (node) =>
      node.type === AST_NODE_TYPES.Identifier && SIGNAL_NAME.test(node.name) && !own.has(node.name),
  );
}

function textOf(context: Context, node: TSESTree.Node): string {
  return context.sourceCode.getText(unwrapped(node));
}

function operationHandles(context: Context, call: TSESTree.CallExpression): Set<string> {
  const callee = unwrapped(call.callee);
  const receiver = callee.type === AST_NODE_TYPES.MemberExpression ? [callee.object] : [];
  const handles = [...receiver, ...call.arguments].filter((node) =>
    HANDLE_TYPES.has(unwrapped(node).type),
  );
  return new Set(handles.map((node) => textOf(context, node)));
}

function within(node: TSESTree.Node, root: TSESTree.Node | undefined): boolean {
  return root !== undefined && (node === root || ancestorsOf(node).includes(root));
}

function inTimeoutPath(cleanup: TSESTree.Node, race: Race): boolean {
  const trying = ancestorsOf(race.node).filter(
    (ancestor): ancestor is TSESTree.TryStatement =>
      ancestor.type === AST_NODE_TYPES.TryStatement && within(race.node, ancestor.block),
  );
  return (
    race.timeouts.some((entry) => within(cleanup, entry)) ||
    trying.some(
      (owner) =>
        within(cleanup, owner.handler ?? undefined) ||
        within(cleanup, owner.finalizer ?? undefined),
    ) ||
    settlementChain(race.node).some((link) => link.arguments.some((arg) => within(cleanup, arg)))
  );
}

export function cleansUp(context: Context, call: TSESTree.CallExpression, race: Race): boolean {
  const owner = ancestorsOf(race.node).find((ancestor) => isFunctionNode(ancestor));
  const handles = operationHandles(context, call);
  return nodesIn(owner?.body ?? context.sourceCode.ast).some((inner) => {
    const callee =
      inner.type === AST_NODE_TYPES.CallExpression ? unwrapped(inner.callee) : undefined;
    return (
      callee?.type === AST_NODE_TYPES.MemberExpression &&
      CLEANUP_METHODS.has(memberName(callee) ?? '') &&
      (handles.has(textOf(context, callee.object)) || inTimeoutPath(inner, race))
    );
  });
}
