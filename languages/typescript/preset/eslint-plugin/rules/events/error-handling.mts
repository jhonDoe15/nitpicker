import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../analysis/constant-resolution.mts';
import {
  isTypeWrapper,
  memberName,
  staticKey,
  typeServices,
  type Context,
} from '../security/security-values.mts';
import { chainOf } from '../typed/node-views.mts';
import {
  calledName,
  importedName,
  isMemberCall,
  listensForErrors,
  type EmitterScope,
  type MemberCall,
} from './emitter-creations.mts';
import {
  HANDLING_CALLS,
  HANDLING_STATICS,
  INPUT_READERS,
  isChainableMethod,
  isConsumingMethod,
  type Handler,
} from './emitter-modules.mts';
import { helperOutcome } from './helpers/helper-bodies.mts';

const HANDLED = 'handled';
const NEUTRAL = 'neutral';
const ESCAPED = 'escaped';
const ARGUMENT = 'argument';

type Outcome = typeof HANDLED | typeof NEUTRAL | typeof ESCAPED;
type CallLike = TSESTree.CallExpression | TSESTree.NewExpression;
export type Inner = Exclude<TSESTree.Node, TSESTree.Program>;
type Container =
  TSESTree.ObjectExpression | TSESTree.ArrayExpression | TSESTree.Property | TSESTree.SpreadElement;

const { DefinitionType } = TSESLint.Scope;
const ESCAPES = new Map<string, string>([
  [AST_NODE_TYPES.ReturnStatement, ARGUMENT],
  [AST_NODE_TYPES.YieldExpression, ARGUMENT],
  [AST_NODE_TYPES.ArrowFunctionExpression, 'body'],
  [AST_NODE_TYPES.AssignmentExpression, 'right'],
  [AST_NODE_TYPES.VariableDeclarator, 'init'],
  [AST_NODE_TYPES.ExportDefaultDeclaration, 'declaration'],
  [AST_NODE_TYPES.ExportSpecifier, 'local'],
  [AST_NODE_TYPES.SpreadElement, ARGUMENT],
]);

function isCall(node: TSESTree.Node): node is CallLike {
  return node.type === AST_NODE_TYPES.CallExpression || node.type === AST_NODE_TYPES.NewExpression;
}

function outerOf(node: Inner): Inner {
  return (
    chainOf<Inner>(node, (current) =>
      isTypeWrapper(current.parent) && current.parent.expression === current
        ? current.parent
        : undefined,
    ).at(-1) ?? node
  );
}

function methodCall(member: TSESTree.MemberExpression): MemberCall | undefined {
  const call = member.parent;
  return call.type === AST_NODE_TYPES.CallExpression && call.callee === member && isMemberCall(call)
    ? call
    : undefined;
}

function nextChainedCall(call: MemberCall): MemberCall | undefined {
  if (!isChainableMethod(memberName(call.callee))) {
    return undefined;
  }
  const outer = outerOf(call);
  const next = outer.parent;
  return next.type === AST_NODE_TYPES.MemberExpression && next.object === outer
    ? methodCall(next)
    : undefined;
}

function receiverOutcome(context: Context, member: TSESTree.MemberExpression): Outcome {
  const calls = chainOf(methodCall(member), nextChainedCall);
  const handled =
    calls.some((call) => listensForErrors(context, call)) ||
    (calls.length > 0 && isConsumingMethod(memberName(member)));
  return handled ? HANDLED : NEUTRAL;
}

function fitsPosition(entry: Handler, call: CallLike, argument: TSESTree.Node): boolean {
  return !entry.first || call.arguments[0] === argument;
}

function isStaticHandler(scope: EmitterScope, call: CallLike, argument: TSESTree.Node): boolean {
  const { callee } = call;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    HANDLING_STATICS.some(
      (entry) =>
        fitsPosition(entry, call, argument) &&
        entry.names.has(memberName(callee) ?? '') &&
        importedName(scope.context, callee.object, scope.bindingsFor(entry.modules)) ===
          entry.owner,
    )
  );
}

function isCallTo(
  scope: EmitterScope,
  call: CallLike,
  entries: readonly Handler[],
): Handler | undefined {
  return entries.find((entry) =>
    entry.names.has(calledName(scope.context, call, scope.bindingsFor(entry.modules)) ?? ''),
  );
}

function isHandlingCall(scope: EmitterScope, call: CallLike, argument: TSESTree.Node): boolean {
  const direct = isCallTo(scope, call, HANDLING_CALLS);
  return (
    (direct !== undefined && fitsPosition(direct, call, argument)) ||
    isStaticHandler(scope, call, argument)
  );
}

function isProjectCallee(context: Context, callee: TSESTree.Node): boolean {
  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    return callee.object.type === AST_NODE_TYPES.ThisExpression;
  }
  if (callee.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const definition = findVariable(context, callee, callee.name)?.defs.at(0);
  if (definition === undefined) {
    return false;
  }
  return (
    definition.type === DefinitionType.FunctionName ||
    definition.type === DefinitionType.ClassName ||
    (definition.type === DefinitionType.ImportBinding &&
      definition.parent.type === AST_NODE_TYPES.ImportDeclaration &&
      definition.parent.source.value.startsWith('.'))
  );
}

function argumentOutcome(scope: EmitterScope, call: CallLike, argument: TSESTree.Node): Outcome {
  if (isHandlingCall(scope, call, argument)) {
    return HANDLED;
  }
  const index = call.arguments.findIndex((each) => each === argument);
  const services = typeServices(scope.context);
  if (index === -1) {
    return NEUTRAL;
  }
  if (services === undefined) {
    return isProjectCallee(scope.context, call.callee) ? ESCAPED : NEUTRAL;
  }
  return helperOutcome(services, call, index);
}

function isContainer(node: TSESTree.Node): node is Container {
  return (
    node.type === AST_NODE_TYPES.ObjectExpression ||
    node.type === AST_NODE_TYPES.ArrayExpression ||
    node.type === AST_NODE_TYPES.Property ||
    node.type === AST_NODE_TYPES.SpreadElement
  );
}

function containerRoot(node: Inner): Inner {
  return (
    chainOf<Inner>(node, (current) =>
      isContainer(current.parent) ? current.parent : undefined,
    ).at(-1) ?? node
  );
}

function isReaderInput(scope: EmitterScope, property: TSESTree.Property): boolean {
  const object = property.parent;
  const call = object.parent;
  return (
    staticKey(property) === 'input' &&
    isCall(call) &&
    call.arguments[0] === object &&
    isCallTo(scope, call, INPUT_READERS) !== undefined
  );
}

function containedOutcome(scope: EmitterScope, node: Inner): Outcome {
  if (node.parent.type === AST_NODE_TYPES.Property && isReaderInput(scope, node.parent)) {
    return HANDLED;
  }
  const root = containerRoot(node);
  return escapeOutcome(root.parent, root);
}

function escapeOutcome(parent: TSESTree.Node, node: TSESTree.Node): Outcome {
  const field = ESCAPES.get(parent.type);
  return field !== undefined && Reflect.get(parent, field) === node ? ESCAPED : NEUTRAL;
}

function referenceOutcome(scope: EmitterScope, reference: Inner): Outcome {
  const node = outerOf(reference);
  const { parent } = node;
  if (parent.type === AST_NODE_TYPES.MemberExpression && parent.object === node) {
    return receiverOutcome(scope.context, parent);
  }
  if (parent.type === AST_NODE_TYPES.ForOfStatement && parent.await && parent.right === node) {
    return HANDLED;
  }
  if (isCall(parent) && parent.callee !== node) {
    return argumentOutcome(scope, parent, node);
  }
  if (
    (parent.type === AST_NODE_TYPES.Property && parent.value === node) ||
    parent.type === AST_NODE_TYPES.ArrayExpression
  ) {
    return containedOutcome(scope, node);
  }
  return escapeOutcome(parent, node);
}

export function referencesOutcome(
  scope: EmitterScope,
  references: readonly Inner[],
): typeof HANDLED | typeof ESCAPED | 'unhandled' {
  const outcomes = new Set(references.map((reference) => referenceOutcome(scope, reference)));
  if (outcomes.has(HANDLED)) {
    return HANDLED;
  }
  return outcomes.has(ESCAPED) ? ESCAPED : 'unhandled';
}
