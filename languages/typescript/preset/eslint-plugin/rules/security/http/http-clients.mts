import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, resolveConstant } from '../../analysis/constant-resolution.mts';
import { chainOf, nameOf } from '../../typed/node-views.mts';
import { bindingsOf, importedFunction, type ModuleBindings } from '../imported-names.mts';
import { memberName, unwrapped, type Context } from '../security-values.mts';
import { configNodes, isCallback, isLocalUrl, lacksTimeout, typeNamed } from './http-config.mts';
import { axiosPosition, createdInstance } from './http-defaults.mts';
import {
  AXIOS_MODULES,
  FETCH_MODULES,
  GOT_METHODS,
  GOT_MODULES,
  HTTP_MODULE_FUNCTIONS,
  HTTP_MODULES,
  NODE_FETCH_MODULES,
  UNDICI_MODULES,
  isGlobalFetch,
} from './http-modules.mts';

export type ClientBindings = {
  readonly fetchModules: ModuleBindings;
  readonly nodeFetch: ModuleBindings;
  readonly undici: ModuleBindings;
  readonly axios: ModuleBindings;
  readonly got: ModuleBindings;
  readonly http: ModuleBindings;
};
export type ClientScope = ClientBindings & {
  readonly context: Context;
  readonly checkFetch: boolean;
  readonly nodeFetchTimeout: boolean;
};
const AXIOS = 'axios';

type FetchClient = 'fetch' | 'node-fetch' | 'fetch-module';
export type Found = {
  readonly client: FetchClient | typeof AXIOS | 'got' | 'http';
  readonly call: string;
  readonly owner?: string | undefined;
  readonly instance?: string | undefined;
};
type AxiosBase = { readonly client: typeof AXIOS; readonly owner: string | undefined };

const GOT_CALLS = new Set<string | undefined>(GOT_METHODS);
const HTTP_METHODS = new Set<string | undefined>(HTTP_MODULE_FUNCTIONS);
const CHAINED_LISTENERS = new Set<string | undefined>([
  'on',
  'once',
  'prependListener',
  'setHeader',
  'setNoDelay',
]);
const REQUEST_NAME = /^(?:request|req)$/u;
const TIMEOUT_KEYS = ['timeout', 'signal'];

function chainedListener(call: TSESTree.CallExpression): TSESTree.CallExpression | undefined {
  const owner = call.parent;
  return owner.type === AST_NODE_TYPES.MemberExpression &&
    owner.object === call &&
    CHAINED_LISTENERS.has(memberName(owner)) &&
    owner.parent.type === AST_NODE_TYPES.CallExpression &&
    owner.parent.callee === owner
    ? owner.parent
    : undefined;
}

function requestHolder(call: TSESTree.CallExpression): TSESTree.CallExpression {
  return chainOf(call, chainedListener).at(-1) ?? call;
}

function hasSetTimeoutCall(context: Context, call: TSESTree.CallExpression): boolean {
  const holder = requestHolder(call);
  const owner = holder.parent;
  if (owner.type === AST_NODE_TYPES.MemberExpression && memberName(owner) === 'setTimeout') {
    return true;
  }
  const id = owner.type === AST_NODE_TYPES.VariableDeclarator ? owner.id : undefined;
  const variable =
    id?.type === AST_NODE_TYPES.Identifier ? findVariable(context, id, id.name) : undefined;
  return (
    variable?.references.some(
      (reference) =>
        reference.identifier.parent.type === AST_NODE_TYPES.MemberExpression &&
        memberName(reference.identifier.parent) === 'setTimeout',
    ) === true
  );
}

export function clientBindings(program: TSESTree.Program): ClientBindings {
  return {
    fetchModules: bindingsOf(program, new Set(FETCH_MODULES)),
    nodeFetch: bindingsOf(program, new Set(NODE_FETCH_MODULES)),
    undici: bindingsOf(program, new Set(UNDICI_MODULES)),
    axios: bindingsOf(program, new Set(AXIOS_MODULES)),
    got: bindingsOf(program, new Set(GOT_MODULES)),
    http: bindingsOf(program, new Set(HTTP_MODULES)),
  };
}

function isFetchFrom(context: Context, callee: TSESTree.Node, bindings: ModuleBindings): boolean {
  const target = unwrapped(callee);
  const defaultImport =
    target.type === AST_NODE_TYPES.Identifier && bindings.namespaces.has(target.name);
  return defaultImport || importedFunction(context, callee, bindings) === 'fetch';
}

function fetchClient(scope: ClientScope, callee: TSESTree.Node): FetchClient | undefined {
  const { context } = scope;
  if (isGlobalFetch(context, callee) || isFetchFrom(context, callee, scope.undici)) {
    return 'fetch';
  }
  if (isFetchFrom(context, callee, scope.nodeFetch)) {
    return 'node-fetch';
  }
  return isFetchFrom(context, callee, scope.fetchModules) ? 'fetch-module' : undefined;
}

function axiosOwner(callee: TSESTree.Node): string | undefined {
  const target = unwrapped(callee);
  const owner = target.type === AST_NODE_TYPES.MemberExpression ? unwrapped(target.object) : target;
  return owner.type === AST_NODE_TYPES.Identifier ? owner.name : undefined;
}

function checkAxios(
  { context, axios }: ClientScope,
  node: TSESTree.CallExpression,
): Found | undefined {
  const callee = unwrapped(node.callee);
  const method = importedFunction(context, callee, axios);
  const args = node.arguments;
  const found: AxiosBase = { client: AXIOS, owner: axiosOwner(callee) };
  if (callee.type === AST_NODE_TYPES.Identifier && axios.namespaces.has(callee.name)) {
    return lacksTimeout(context, configNodes(context, args), TIMEOUT_KEYS)
      ? { ...found, call: 'axios()' }
      : undefined;
  }
  if (method === 'create') {
    const missing = lacksTimeout(context, [args[0]], TIMEOUT_KEYS);
    const instance = createdInstance(node)?.name;
    return missing ? { ...found, call: 'axios.create()', instance } : undefined;
  }
  const position = axiosPosition(method);
  return position !== undefined &&
    method !== undefined &&
    lacksTimeout(context, [args[position]], TIMEOUT_KEYS)
    ? { ...found, call: `axios.${method}()` }
    : undefined;
}

function checkGot({ context, got }: ClientScope, node: TSESTree.CallExpression): Found | undefined {
  const callee = unwrapped(node.callee);
  const method = importedFunction(context, callee, got);
  const direct = callee.type === AST_NODE_TYPES.Identifier && got.namespaces.has(callee.name);
  if (!direct && !GOT_CALLS.has(method) && method !== 'extend') {
    return undefined;
  }
  const config = method === 'extend' ? [node.arguments[0]] : configNodes(context, node.arguments);
  return lacksTimeout(context, config, TIMEOUT_KEYS) ? { client: 'got', call: 'got()' } : undefined;
}

function checkHttp(
  { context, http }: ClientScope,
  node: TSESTree.CallExpression,
): Found | undefined {
  const method = importedFunction(context, node.callee, http);
  if (method === undefined || !HTTP_METHODS.has(method)) {
    return undefined;
  }
  const args = node.arguments;
  const options = args.slice(0, 2).filter((_, index) => !isCallback(context, args, index));
  const missing = lacksTimeout(context, options, TIMEOUT_KEYS);
  return missing && !hasSetTimeoutCall(context, node)
    ? { client: 'http', call: `http.${method}()` }
    : undefined;
}

function isRequestValue(context: Context, node: TSESTree.Node | undefined): boolean {
  const target = unwrapped(node);
  if (target !== undefined && typeNamed(context, target, 'Request')) {
    return true;
  }
  return (
    (target?.type === AST_NODE_TYPES.MemberExpression && memberName(target) === 'request') ||
    (target?.type === AST_NODE_TYPES.Identifier && REQUEST_NAME.test(target.name))
  );
}

function fetchInits(
  context: Context,
  node: TSESTree.CallExpression,
): (TSESTree.Node | undefined)[] {
  const [first, init] = node.arguments;
  const target = unwrapped(first);
  if (target?.type === AST_NODE_TYPES.NewExpression && nameOf(target.callee) === 'Request') {
    return [target.arguments[1], init];
  }
  if (isLocalUrl(context, first)) {
    return [];
  }
  if (isRequestValue(context, first)) {
    return init === undefined ? [] : [init];
  }
  return [init];
}

function fetchKeys(scope: ClientScope, client: FetchClient): string[] {
  const timeout = client === 'node-fetch' && scope.nodeFetchTimeout;
  return ['signal', 'dispatcher', ...(timeout ? ['timeout'] : [])];
}

function checkFetch(scope: ClientScope, node: TSESTree.CallExpression): Found | undefined {
  const client = scope.checkFetch ? fetchClient(scope, node.callee) : undefined;
  if (client === undefined) {
    return undefined;
  }
  const inits = fetchInits(scope.context, node);
  return inits.length > 0 && lacksTimeout(scope.context, inits, fetchKeys(scope, client))
    ? { client, call: 'fetch()' }
    : undefined;
}

export function clientCall(scope: ClientScope, node: TSESTree.CallExpression): Found | undefined {
  return (
    checkFetch(scope, node) ??
    checkAxios(scope, node) ??
    checkGot(scope, node) ??
    checkHttp(scope, node)
  );
}

function createdClient(
  scope: ClientScope,
  callee: TSESTree.Node,
): typeof AXIOS | 'got' | undefined {
  const holder = unwrapped(
    callee.type === AST_NODE_TYPES.MemberExpression ? callee.object : callee,
  );
  const created =
    holder.type === AST_NODE_TYPES.Identifier
      ? unwrapped(resolveConstant(scope.context, holder))
      : undefined;
  if (created?.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  if (importedFunction(scope.context, created.callee, scope.axios) === 'create') {
    return AXIOS;
  }
  return importedFunction(scope.context, created.callee, scope.got) === 'extend'
    ? 'got'
    : undefined;
}

function isDirectCall(callee: TSESTree.Node, bindings: ModuleBindings): boolean {
  return callee.type === AST_NODE_TYPES.Identifier && bindings.namespaces.has(callee.name);
}

function isInstanceCall(scope: ClientScope, callee: TSESTree.Node): boolean {
  const method = callee.type === AST_NODE_TYPES.MemberExpression ? memberName(callee) : undefined;
  const instance = createdClient(scope, callee);
  if (instance === AXIOS) {
    return method === undefined || axiosPosition(method) !== undefined;
  }
  return instance === 'got' && (method === undefined || GOT_CALLS.has(method));
}

export function isClientCall(scope: ClientScope, node: TSESTree.CallExpression): boolean {
  const { context } = scope;
  const callee = unwrapped(node.callee);
  return (
    (scope.checkFetch && fetchClient(scope, node.callee) !== undefined) ||
    isDirectCall(callee, scope.axios) ||
    axiosPosition(importedFunction(context, callee, scope.axios)) !== undefined ||
    isDirectCall(callee, scope.got) ||
    GOT_CALLS.has(importedFunction(context, callee, scope.got)) ||
    HTTP_METHODS.has(importedFunction(context, node.callee, scope.http)) ||
    isInstanceCall(scope, callee)
  );
}
