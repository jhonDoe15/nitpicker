import { findVariable, isFunctionNode, resolveConstant } from '../analysis/constant-resolution.mjs';
import ts from 'typescript';
import {
  bindingsOf,
  importedFunction,
  leafValues,
  memberName,
  propertyNamed,
  unwrapped,
} from './security-values.mjs';

const FETCH_MODULES = new Set([
  'undici',
  'node-fetch',
  'cross-fetch',
  'isomorphic-fetch',
  'isomorphic-unfetch',
]);
const AXIOS_MODULES = new Set(['axios']);
const GOT_MODULES = new Set(['got']);
const HTTP_MODULES = new Set(['http', 'node:http', 'https', 'node:https']);
const GLOBAL_OBJECTS = new Set(['globalThis', 'window', 'self', 'global']);
const SECOND_ARGUMENT = new Set(['get', 'delete', 'head', 'options', 'getUri']);
const THIRD_ARGUMENT = new Set(['post', 'put', 'patch', 'postForm', 'putForm', 'patchForm']);
const GOT_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'stream']);
const HTTP_METHODS = new Set(['request', 'get']);
const NO_VALUE = new Set(['undefined', 'null']);

function isAbsent(context, node) {
  const leaves = leafValues(context, node);
  return leaves.every(
    (leaf) =>
      (leaf.type === 'Identifier' && NO_VALUE.has(leaf.name)) ||
      (leaf.type === 'Literal' && (leaf.value === null || leaf.value === 0)),
  );
}

function isUrlType(context, node) {
  const services = context.sourceCode.parserServices;
  if (services?.program === undefined || services.program === null) {
    return false;
  }
  const type = services.getTypeAtLocation(node);
  return (type.flags & ts.TypeFlags.StringLike) !== 0 || type.symbol?.name === 'URL';
}

function isObjectLiteral(context, node) {
  return unwrapped(resolveConstant(context, unwrapped(node)))?.type === 'ObjectExpression';
}

function configNodes(context, args) {
  const object = args.slice(0, 2).find((argument) => isObjectLiteral(context, argument));
  return object === undefined ? [args[1]] : [object];
}

function configState(context, node, keys) {
  if (node === undefined) {
    return 'missing';
  }
  const resolved = unwrapped(resolveConstant(context, unwrapped(node)));
  if (
    resolved.type === 'Literal' ||
    resolved.type === 'TemplateLiteral' ||
    isUrlType(context, node)
  ) {
    return 'url';
  }
  if (resolved.type !== 'ObjectExpression') {
    return isAbsent(context, resolved) ? 'missing' : 'unknown';
  }
  for (const key of keys) {
    const value = propertyNamed(context, resolved, key);
    if (value !== undefined) {
      return isAbsent(context, value) ? 'missing' : 'set';
    }
  }
  const spreads = resolved.properties.filter((entry) => entry.type === 'SpreadElement');
  const resolvable = spreads.every(
    (entry) =>
      unwrapped(resolveConstant(context, unwrapped(entry.argument))).type === 'ObjectExpression',
  );
  return resolvable ? 'missing' : 'unknown';
}

function lacksTimeout(context, nodes, keys) {
  const states = nodes.map((node) => configState(context, node, keys));
  return !states.includes('set') && !states.includes('unknown');
}

function isGlobalFetch(context, callee) {
  const target = unwrapped(resolveConstant(context, unwrapped(callee)));
  if (target.type === 'MemberExpression') {
    const owner = unwrapped(target.object);
    return (
      owner.type === 'Identifier' &&
      GLOBAL_OBJECTS.has(owner.name) &&
      memberName(target) === 'fetch'
    );
  }
  if (target.type !== 'Identifier' || target.name !== 'fetch') {
    return false;
  }
  return (findVariable(context, target, 'fetch')?.defs.length ?? 0) === 0;
}

function hasSetTimeoutCall(context, call) {
  const owner = call.parent;
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

function axiosPosition(method) {
  if (SECOND_ARGUMENT.has(method)) {
    return 1;
  }
  if (THIRD_ARGUMENT.has(method)) {
    return 2;
  }
  return method === 'request' ? 0 : undefined;
}

export function clientBindings(program) {
  return {
    fetchModules: bindingsOf(program, FETCH_MODULES),
    axios: bindingsOf(program, AXIOS_MODULES),
    got: bindingsOf(program, GOT_MODULES),
    http: bindingsOf(program, HTTP_MODULES),
  };
}

function isFetchCall({ context, fetchModules }, callee) {
  const target = unwrapped(callee);
  const defaultImport = target.type === 'Identifier' && fetchModules.namespaces.has(target.name);
  return (
    defaultImport ||
    importedFunction(context, callee, fetchModules) === 'fetch' ||
    isGlobalFetch(context, callee)
  );
}

function checkAxios({ context, axios }, node) {
  const callee = unwrapped(node.callee);
  const method = importedFunction(context, callee, axios);
  const args = node.arguments;
  if (callee.type === 'Identifier' && axios.namespaces.has(callee.name)) {
    return lacksTimeout(context, configNodes(context, args), ['timeout']) ? 'axios()' : undefined;
  }
  if (method === 'create') {
    return lacksTimeout(context, [args[0]], ['timeout']) ? 'axios.create()' : undefined;
  }
  const position = axiosPosition(method);
  return position !== undefined && lacksTimeout(context, [args[position]], ['timeout'])
    ? `axios.${method}()`
    : undefined;
}

function checkGot({ context, got }, node) {
  const callee = unwrapped(node.callee);
  const method = importedFunction(context, callee, got);
  const direct = callee.type === 'Identifier' && got.namespaces.has(callee.name);
  if (!direct && !GOT_METHODS.has(method) && method !== 'extend') {
    return undefined;
  }
  const config = method === 'extend' ? [node.arguments[0]] : configNodes(context, node.arguments);
  return lacksTimeout(context, config, ['timeout']) ? 'got()' : undefined;
}

function checkHttp({ context, http }, node) {
  const method = importedFunction(context, node.callee, http);
  if (!HTTP_METHODS.has(method)) {
    return undefined;
  }
  const options = node.arguments.slice(0, 2).filter((argument) => !isFunctionNode(argument));
  const missing = lacksTimeout(context, options, ['timeout', 'signal']);
  return missing && !hasSetTimeoutCall(context, node) ? `http.${method}()` : undefined;
}

function checkFetch(scope, node) {
  if (!scope.checkFetch || !isFetchCall(scope, node.callee)) {
    return undefined;
  }
  const first = unwrapped(node.arguments[0]);
  const isRequest = first?.type === 'NewExpression' && first.callee.name === 'Request';
  return !isRequest && lacksTimeout(scope.context, [node.arguments[1]], ['signal'])
    ? 'fetch()'
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
