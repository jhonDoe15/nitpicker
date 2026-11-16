import { importedBindings } from '../security/imported-names.mts';
import { childrenOf } from '../loops/loop-shapes.mts';
import { middlewareIn, middlewareName } from './middleware-names.mts';
import { decoratorInfo, isAuthName } from './shapes.mts';

const VERBS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'All', 'Options', 'Head']);
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
const NEST_COMMON = '@nestjs/common';

function isNestDecorator(decorator, name, bindings) {
  const expression =
    decorator.expression.type === 'CallExpression'
      ? decorator.expression.callee
      : decorator.expression;
  return (
    expression.type === 'Identifier' &&
    expression.name === name &&
    bindings.get(name)?.module === NEST_COMMON
  );
}

function describeHandler(method, classDecorators) {
  const decorators = [...(method.decorators ?? []), ...classDecorators].map(decoratorInfo);
  return {
    node: method,
    shapes: new Set(decorators.filter((each) => each.isAuth).map((each) => each.shape)),
    isAuth: decorators.some((each) => each.isAuth),
    isPublic: decorators.some((each) => each.isPublic),
  };
}

function controllerHandlers(klass, bindings) {
  const isController = (klass.decorators ?? []).some((each) =>
    isNestDecorator(each, 'Controller', bindings),
  );
  if (!isController) {
    return [];
  }
  const classDecorators = klass.decorators;
  return klass.body.body
    .filter((member) => member.type === 'MethodDefinition')
    .filter((member) =>
      (member.decorators ?? []).some((each) =>
        [...VERBS].some((verb) => isNestDecorator(each, verb, bindings)),
      ),
    )
    .map((member) => describeHandler(member, classDecorators));
}

function walk(program, visitorKeys, visit) {
  const pending = [program];
  for (const node of pending) {
    visit(node);
    pending.push(...childrenOf(node, visitorKeys));
  }
}

function isNamedCall(node, name) {
  return (
    node?.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    node.callee.property.name === name
  );
}

function appliesAuthMiddleware(node) {
  if (!isNamedCall(node, 'forRoutes')) {
    return false;
  }
  const chain = [node.callee.object];
  for (const link of chain) {
    if (isNamedCall(link, 'exclude')) {
      chain.push(link.callee.object);
    }
  }
  const current = chain.at(-1);
  return (
    isNamedCall(current, 'apply') &&
    current.arguments.some((arg) => isAuthName(middlewareName(arg)))
  );
}

export function nestFacts(program, visitorKeys) {
  const bindings = importedBindings(program);
  const handlers = [];
  let global = false;
  walk(program, visitorKeys, (node) => {
    if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      handlers.push(...controllerHandlers(node, bindings));
    }
    global ||= node.type === 'Identifier' && node.name === 'APP_GUARD';
    global ||=
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.property.name === 'useGlobalGuards';
    global ||= appliesAuthMiddleware(node);
  });
  return { handlers, global };
}

function receiverName(callee) {
  return callee.object.type === 'Identifier' ? callee.object.name : undefined;
}

function isPath(node) {
  const text = node?.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined;
  return text !== undefined && /^(?:\/|\*|$)/u.test(text);
}

function isFrameworkModule(module) {
  return ROUTER_MODULES.includes(module) || module.startsWith('@fastify/');
}

function unwrapped(node) {
  const pending = [node];
  for (const current of pending) {
    if (current?.type === 'AwaitExpression' || current?.type === 'TSAsExpression') {
      pending.push(current.expression);
    }
  }
  return pending.at(-1);
}

function calleeRoot(callee) {
  const pending = [callee];
  for (const current of pending) {
    if (current.type === 'MemberExpression') {
      pending.push(current.object);
    }
  }
  const root = pending.at(-1);
  return root.type === 'Identifier' ? root : undefined;
}

function calleeLeaf(callee) {
  return callee.type === 'MemberExpression' ? callee.property.name : callee.name;
}

function isRouterFactory(init, bindings) {
  const call = unwrapped(init);
  if (call?.type !== 'CallExpression' && call?.type !== 'NewExpression') {
    return false;
  }
  const module = bindings.get(calleeRoot(call.callee)?.name)?.module;
  return (
    module !== undefined && isFrameworkModule(module) && FACTORIES.has(calleeLeaf(call.callee))
  );
}

function isTypedReceiver(node) {
  const name = node.typeAnnotation?.typeAnnotation?.typeName?.name;
  return node.type === 'Identifier' && FRAMEWORK_TYPES.has(name);
}

function collectSyntax(program, visitorKeys, bindings) {
  const calls = [];
  const receivers = new Set();
  walk(program, visitorKeys, (node) => {
    const declared = node.type === 'VariableDeclarator' && node.id.type === 'Identifier';
    if (declared && isRouterFactory(node.init, bindings)) {
      receivers.add(node.id.name);
    }
    if (isTypedReceiver(node)) {
      receivers.add(node.name);
    }
    if (node.type === 'CallExpression') {
      calls.push(node);
    }
  });
  return { calls: calls.toSorted((left, right) => left.range[0] - right.range[0]), receivers };
}

function isFunction(node) {
  return node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression';
}

function registersPlugin(call, receivers) {
  const callee = call.callee;
  const plugin = call.arguments[0];
  const registers = callee.property.name === 'register' && receivers.has(receiverName(callee));
  return registers && isFunction(plugin) && plugin.params[0]?.type === 'Identifier'
    ? plugin.params[0].name
    : undefined;
}

function isRouteHandler(node) {
  return node !== undefined && node.type !== 'Literal' && node.type !== 'ObjectExpression';
}

function isOpenPath(node) {
  return node?.type === 'Literal' && OPEN_PATH.test(String(node.value).toLowerCase());
}

function routeOf(node, { receivers, scoped }) {
  const { callee } = node;
  const receiver = receiverName(callee);
  const method = callee.property.name;
  const isScope = method === 'use' || method === 'addHook';
  const isRoute =
    HTTP_METHODS.has(method) &&
    node.arguments.length >= 2 &&
    isPath(node.arguments[0]) &&
    isRouteHandler(node.arguments.at(-1));
  if (!(receivers.has(receiver) && (isScope || isRoute))) {
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

export function routeFacts(program, visitorKeys) {
  const bindings = importedBindings(program);
  if (![...bindings.values()].some(({ module }) => isFrameworkModule(module))) {
    return { routes: [] };
  }
  const { calls, receivers } = collectSyntax(program, visitorKeys, bindings);
  const state = { receivers, scoped: new Map() };
  const members = calls.filter(
    (node) => node.callee.type === 'MemberExpression' && !node.callee.computed,
  );
  const routes = [];
  for (const node of members) {
    const plugin = registersPlugin(node, receivers);
    if (plugin !== undefined) {
      receivers.add(plugin);
    }
    routes.push(routeOf(node, state));
  }
  return { routes: routes.filter((route) => route !== undefined) };
}
