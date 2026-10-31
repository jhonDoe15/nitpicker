import { chainOf } from '../../analysis/ancestry.mjs';
import { findVariable } from '../../analysis/constant-resolution.mjs';
import { bindingsOf, importedFunction } from '../imported-names.mjs';
import { memberName, unwrapped } from '../security-values.mjs';
import { configNodes, isCallback, isLocalUrl, lacksTimeout, typeNamed } from './http-config.mjs';
import { axiosPosition, createdInstance } from './http-defaults.mjs';
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
} from './http-modules.mjs';

const GOT_CALLS = new Set(GOT_METHODS);
const HTTP_METHODS = new Set(HTTP_MODULE_FUNCTIONS);
const CHAINED_LISTENERS = new Set(['on', 'once', 'prependListener', 'setHeader', 'setNoDelay']);
const REQUEST_NAME = /^(?:request|req)$/u;
const TIMEOUT_KEYS = ['timeout', 'signal'];

function chainedListener(call) {
  const owner = call.parent;
  const chained =
    owner.type === 'MemberExpression' &&
    owner.object === call &&
    CHAINED_LISTENERS.has(memberName(owner)) &&
    owner.parent.type === 'CallExpression' &&
    owner.parent.callee === owner;
  return chained ? owner.parent : undefined;
}

function requestHolder(call) {
  return chainOf(call, chainedListener).at(-1);
}

function hasSetTimeoutCall(context, call) {
  const holder = requestHolder(call);
  const owner = holder.parent;
  if (owner.type === 'MemberExpression' && memberName(owner) === 'setTimeout') {
    return true;
  }
  const id = owner.type === 'VariableDeclarator' ? owner.id : undefined;
  const variable = id?.type === 'Identifier' ? findVariable(context, id, id.name) : undefined;
  return (
    variable?.references.some(
      (reference) =>
        reference.identifier.parent.type === 'MemberExpression' &&
        memberName(reference.identifier.parent) === 'setTimeout',
    ) === true
  );
}

export function clientBindings(program) {
  return {
    fetchModules: bindingsOf(program, new Set(FETCH_MODULES)),
    nodeFetch: bindingsOf(program, new Set(NODE_FETCH_MODULES)),
    undici: bindingsOf(program, new Set(UNDICI_MODULES)),
    axios: bindingsOf(program, new Set(AXIOS_MODULES)),
    got: bindingsOf(program, new Set(GOT_MODULES)),
    http: bindingsOf(program, new Set(HTTP_MODULES)),
  };
}

function isFetchFrom(context, callee, bindings) {
  const target = unwrapped(callee);
  const defaultImport = target.type === 'Identifier' && bindings.namespaces.has(target.name);
  return defaultImport || importedFunction(context, callee, bindings) === 'fetch';
}

function fetchClient(scope, callee) {
  const { context } = scope;
  if (isGlobalFetch(context, callee) || isFetchFrom(context, callee, scope.undici)) {
    return 'fetch';
  }
  if (isFetchFrom(context, callee, scope.nodeFetch)) {
    return 'node-fetch';
  }
  return isFetchFrom(context, callee, scope.fetchModules) ? 'fetch-module' : undefined;
}

function axiosOwner(callee) {
  const target = unwrapped(callee);
  const owner = target.type === 'MemberExpression' ? unwrapped(target.object) : target;
  return owner.type === 'Identifier' ? owner.name : undefined;
}

function checkAxios({ context, axios }, node) {
  const callee = unwrapped(node.callee);
  const method = importedFunction(context, callee, axios);
  const args = node.arguments;
  const found = { client: 'axios', owner: axiosOwner(callee) };
  if (callee.type === 'Identifier' && axios.namespaces.has(callee.name)) {
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
  return position !== undefined && lacksTimeout(context, [args[position]], TIMEOUT_KEYS)
    ? { ...found, call: `axios.${method}()` }
    : undefined;
}

function checkGot({ context, got }, node) {
  const callee = unwrapped(node.callee);
  const method = importedFunction(context, callee, got);
  const direct = callee.type === 'Identifier' && got.namespaces.has(callee.name);
  if (!direct && !GOT_CALLS.has(method) && method !== 'extend') {
    return undefined;
  }
  const config = method === 'extend' ? [node.arguments[0]] : configNodes(context, node.arguments);
  return lacksTimeout(context, config, TIMEOUT_KEYS) ? { client: 'got', call: 'got()' } : undefined;
}

function checkHttp({ context, http }, node) {
  const method = importedFunction(context, node.callee, http);
  if (!HTTP_METHODS.has(method)) {
    return undefined;
  }
  const args = node.arguments;
  const options = args.slice(0, 2).filter((_, index) => !isCallback(context, args, index));
  const missing = lacksTimeout(context, options, TIMEOUT_KEYS);
  return missing && !hasSetTimeoutCall(context, node)
    ? { client: 'http', call: `http.${method}()` }
    : undefined;
}

function isRequestValue(context, node) {
  const target = unwrapped(node);
  if (typeNamed(context, target, 'Request')) {
    return true;
  }
  return (
    (target?.type === 'MemberExpression' && memberName(target) === 'request') ||
    (target?.type === 'Identifier' && REQUEST_NAME.test(target.name))
  );
}

function fetchInits(context, node) {
  const [first, init] = node.arguments;
  const target = unwrapped(first);
  if (target?.type === 'NewExpression' && target.callee.name === 'Request') {
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

function fetchKeys(scope, client) {
  const timeout = client === 'node-fetch' && scope.nodeFetchTimeout;
  return ['signal', 'dispatcher', ...(timeout ? ['timeout'] : [])];
}

function checkFetch(scope, node) {
  const client = scope.checkFetch ? fetchClient(scope, node.callee) : undefined;
  if (client === undefined) {
    return undefined;
  }
  const inits = fetchInits(scope.context, node);
  return inits.length > 0 && lacksTimeout(scope.context, inits, fetchKeys(scope, client))
    ? { client, call: 'fetch()' }
    : undefined;
}

export function clientCall(scope, node) {
  return (
    checkFetch(scope, node) ??
    checkAxios(scope, node) ??
    checkGot(scope, node) ??
    checkHttp(scope, node)
  );
}
