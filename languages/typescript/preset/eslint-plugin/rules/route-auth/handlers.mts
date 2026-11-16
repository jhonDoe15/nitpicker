import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { rootIdentifier } from '../lifecycles/scope/close-owners.mts';
import { importedBindings } from '../security/imported-names.mts';
import { nameOf, type VisitorKeys } from '../typed/node-views.mts';
import { isCallback } from '../typed/syntax-views.mts';
import { middlewareIn } from './middleware-names.mts';
import { type MemberCall } from '../events/emitter-creations.mts';
import { walk, type Bindings, type Facts, type MaybeNode } from './nest-facts.mts';
import { isAuthName } from './shapes.mts';

export { nestFacts } from './nest-facts.mts';
export type Route = Facts & { readonly node: TSESTree.CallExpression };

type RouteState = {
  readonly receivers: Set<string>;
  readonly scoped: Map<string, string[]>;
};

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'all', 'options', 'head']);
const ROUTER_MODULES = ['express', 'fastify', 'koa-router', '@koa/router', 'restify', 'hono'];
const FACTORIES = new Set(['express', 'Router', 'fastify', 'Fastify', 'Hono', 'createServer']);
const FRAMEWORK_TYPES = new Set([
  'Express',
  'Application',
  'Router',
  'IRouter',
  'FastifyInstance',
  'Hono',
]);
const OPEN_WORDS = [
  String.raw`health\w*`,
  String.raw`ready\w*`,
  String.raw`live\w*`,
  'ping',
  'metrics',
  'status',
  'login',
  'signup',
  'register',
  'logout',
  'callback',
  'webhooks?',
  'public',
  String.raw`oauth\w*`,
];
const OPEN_PATH = new RegExp(`(?:^|[/_-])(?:${OPEN_WORDS.join('|')})(?:$|[/_.-])`, 'u');

function receiverName(callee: TSESTree.MemberExpression): string | undefined {
  return callee.object.type === AST_NODE_TYPES.Identifier ? callee.object.name : undefined;
}

function isPath(node: MaybeNode): boolean {
  const text =
    node?.type === AST_NODE_TYPES.Literal && typeof node.value === 'string'
      ? node.value
      : undefined;
  return text !== undefined && /^(?:\/|\*|$)/u.test(text);
}

function isFrameworkModule(module: string): boolean {
  return ROUTER_MODULES.includes(module) || module.startsWith('@fastify/');
}

function unwrapped(node: MaybeNode): MaybeNode {
  const pending = [node];
  for (const current of pending) {
    if (current?.type === AST_NODE_TYPES.TSAsExpression) {
      pending.push(current.expression);
    }
  }
  return pending.at(-1);
}

function calleeLeaf(callee: TSESTree.Node): string | undefined {
  return callee.type === AST_NODE_TYPES.MemberExpression ? nameOf(callee.property) : nameOf(callee);
}

function isRouterFactory(init: MaybeNode, bindings: Bindings): boolean {
  const call = unwrapped(init);
  if (call?.type !== AST_NODE_TYPES.CallExpression && call?.type !== AST_NODE_TYPES.NewExpression) {
    return false;
  }
  const root = rootIdentifier(call.callee);
  const module = root === undefined ? undefined : bindings.get(root.name)?.module;
  return (
    module !== undefined &&
    isFrameworkModule(module) &&
    FACTORIES.has(calleeLeaf(call.callee) ?? '')
  );
}

function isTypedReceiver(node: TSESTree.Node): node is TSESTree.Identifier {
  const reference =
    node.type === AST_NODE_TYPES.Identifier ? node.typeAnnotation?.typeAnnotation : undefined;
  return (
    reference?.type === AST_NODE_TYPES.TSTypeReference &&
    FRAMEWORK_TYPES.has(nameOf(reference.typeName) ?? '')
  );
}

function collectSyntax(
  program: TSESTree.Program,
  visitorKeys: VisitorKeys,
  bindings: Bindings,
): { readonly calls: TSESTree.CallExpression[]; readonly receivers: Set<string> } {
  const calls: TSESTree.CallExpression[] = [];
  const receivers = new Set<string>();
  walk(program, visitorKeys, (node) => {
    if (
      node.type === AST_NODE_TYPES.VariableDeclarator &&
      node.id.type === AST_NODE_TYPES.Identifier &&
      isRouterFactory(node.init ?? undefined, bindings)
    ) {
      receivers.add(node.id.name);
    }
    if (isTypedReceiver(node)) {
      receivers.add(node.name);
    }
    if (node.type === AST_NODE_TYPES.CallExpression) {
      calls.push(node);
    }
  });
  return { calls: calls.toSorted((left, right) => left.range[0] - right.range[0]), receivers };
}

function registersPlugin(call: MemberCall, receivers: ReadonlySet<string>): string | undefined {
  const { callee } = call;
  const plugin = call.arguments[0];
  const receiver = receiverName(callee);
  const registers =
    nameOf(callee.property) === 'register' && receiver !== undefined && receivers.has(receiver);
  return registers && isCallback(plugin) && plugin.params[0]?.type === AST_NODE_TYPES.Identifier
    ? plugin.params[0].name
    : undefined;
}

function isRouteHandler(node: MaybeNode): boolean {
  return (
    node !== undefined &&
    node.type !== AST_NODE_TYPES.Literal &&
    node.type !== AST_NODE_TYPES.ObjectExpression
  );
}

function isOpenPath(node: MaybeNode): boolean {
  return node?.type === AST_NODE_TYPES.Literal && OPEN_PATH.test(String(node.value).toLowerCase());
}

function routeOf(node: MemberCall, { receivers, scoped }: RouteState): Route | undefined {
  const { callee } = node;
  const receiver = receiverName(callee);
  const method = nameOf(callee.property) ?? '';
  const isScope = method === 'use' || method === 'addHook';
  const isRoute =
    HTTP_METHODS.has(method) &&
    node.arguments.length >= 2 &&
    isPath(node.arguments[0]) &&
    isRouteHandler(node.arguments.at(-1));
  if (receiver === undefined || !receivers.has(receiver) || !(isScope || isRoute)) {
    return undefined;
  }
  const candidates = isScope ? node.arguments : node.arguments.slice(0, -1);
  const names = candidates
    .flatMap((arg) => (isPath(arg) ? [] : middlewareIn(arg)))
    .filter(isAuthName);
  if (isScope) {
    scoped.set(receiver, [...(scoped.get(receiver) ?? []), ...names]);
    return undefined;
  }
  const shared = scoped.get(receiver) ?? [];
  return {
    node,
    shapes: new Set([...names, ...shared]),
    isAuth: names.length + shared.length > 0,
    isPublic: isOpenPath(node.arguments[0]),
  };
}

export function routeFacts(
  program: TSESTree.Program,
  visitorKeys: VisitorKeys,
): { readonly routes: Route[] } {
  const bindings = importedBindings(program);
  if (![...bindings.values()].some(({ module }) => isFrameworkModule(module))) {
    return { routes: [] };
  }
  const { calls, receivers } = collectSyntax(program, visitorKeys, bindings);
  const state: RouteState = { receivers, scoped: new Map() };
  const members = calls.filter(
    (node): node is MemberCall =>
      node.callee.type === AST_NODE_TYPES.MemberExpression && !node.callee.computed,
  );
  const routes: (Route | undefined)[] = [];
  for (const node of members) {
    const plugin = registersPlugin(node, receivers);
    if (plugin !== undefined) {
      receivers.add(plugin);
    }
    routes.push(routeOf(node, state));
  }
  return { routes: routes.filter((route) => route !== undefined) };
}
