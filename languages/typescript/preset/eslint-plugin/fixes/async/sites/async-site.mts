import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, stringValue } from '../../../rules/analysis/constant-resolution.mts';
import { isDirectlyIn } from '../../../rules/async/async-contexts.mts';
import type { Context } from '../../../rules/security/security-values.mts';
import { ancestorsOf } from '../../../rules/typed/node-views.mts';
import { isStampede } from './stampede-guard.mts';

type FunctionNode =
  TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

const LISTENER_METHODS = new Set([
  'on',
  'once',
  'addListener',
  'prependListener',
  'prependOnceListener',
  'addEventListener',
]);
const FINAL_EVENTS = new Set([
  'exit',
  'beforeExit',
  'SIGINT',
  'SIGTERM',
  'SIGHUP',
  'SIGBREAK',
  'uncaughtException',
  'beforeunload',
  'unload',
  'pagehide',
]);
const CLASS_INITIALIZERS = new Set<string>([
  AST_NODE_TYPES.PropertyDefinition,
  AST_NODE_TYPES.AccessorProperty,
  AST_NODE_TYPES.StaticBlock,
  AST_NODE_TYPES.Decorator,
]);

function isInBody(call: TSESTree.Node, fn: FunctionNode): boolean {
  const chain = ancestorsOf(call);
  const inside = chain.slice(0, chain.indexOf(fn));
  return call === fn.body || inside.includes(fn.body);
}

function avoidsClassInitializers(call: TSESTree.Node, fn: FunctionNode): boolean {
  const chain = ancestorsOf(call);
  return !chain.slice(0, chain.indexOf(fn)).some((node) => CLASS_INITIALIZERS.has(node.type));
}

function nameBinding(fn: FunctionNode): TSESTree.Identifier | undefined {
  if (fn.type === AST_NODE_TYPES.FunctionDeclaration) {
    return fn.id ?? undefined;
  }
  const declarator = fn.parent;
  return declarator.type === AST_NODE_TYPES.VariableDeclarator &&
    declarator.id.type === AST_NODE_TYPES.Identifier
    ? declarator.id
    : undefined;
}

function registrations(context: Context, fn: FunctionNode): TSESTree.Node[] {
  const binding = nameBinding(fn);
  const variable = binding === undefined ? undefined : findVariable(context, binding, binding.name);
  const references = (variable?.references ?? []).filter((reference) => !reference.init);
  return [fn, ...references.map((reference) => reference.identifier)];
}

function registersFinalListener(node: TSESTree.Node): boolean {
  const call: TSESTree.Node | undefined = node.parent;
  if (
    call?.type !== AST_NODE_TYPES.CallExpression ||
    !call.arguments.some((argument) => argument === node) ||
    call.callee.type !== AST_NODE_TYPES.MemberExpression ||
    call.callee.computed ||
    call.callee.property.type !== AST_NODE_TYPES.Identifier
  ) {
    return false;
  }
  const event = stringValue(call.arguments[0]);
  return (
    LISTENER_METHODS.has(call.callee.property.name) &&
    event !== undefined &&
    FINAL_EVENTS.has(event)
  );
}

function isFunctionNode(node: TSESTree.Node): node is FunctionNode {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

function isDirectCall(node: TSESTree.Node): boolean {
  const call: TSESTree.Node | undefined = node.parent;
  return call?.type === AST_NODE_TYPES.CallExpression && call.callee === node;
}

function callersOf(context: Context, fn: FunctionNode): FunctionNode[] {
  const registered = registrations(context, fn).slice(1);
  return registered
    .filter(isDirectCall)
    .map((node) => ancestorsOf(node).find(isFunctionNode))
    .filter((caller) => caller !== undefined);
}

function isCalledFromFinalHandler(context: Context, fn: FunctionNode): boolean {
  return callersOf(context, fn).some((caller) =>
    registrations(context, caller).some(registersFinalListener),
  );
}

export function isSafeAsyncSite(context: Context, call: TSESTree.Node, fn: FunctionNode): boolean {
  return (
    fn.async &&
    isDirectlyIn(call, fn) &&
    isInBody(call, fn) &&
    avoidsClassInitializers(call, fn) &&
    !registrations(context, fn).some(registersFinalListener) &&
    !isCalledFromFinalHandler(context, fn) &&
    !isStampede(context, call, fn)
  );
}
