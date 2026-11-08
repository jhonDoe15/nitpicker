import { ts } from '../../../../../typescript-api/typescript-api.mjs';
import { libraryCall, schemaProblems } from '../fields/schema-fields.mjs';
import { importOf, isFromPackage, nameOf } from './ts-nodes.mjs';

const PARSE_METHODS = new Set(['parse', 'safeParse', 'parseAsync', 'safeParseAsync', 'spa']);
const REQUEST_FIELDS = { query: 'query string', params: 'path', headers: 'headers' };
const REQUEST_NAMES = new Set(['req', 'request', 'ctx']);
const REQUEST_MEMBERS = new Set(['req', 'request']);
const HONO_ACCESSORS = {
  query: 'query string',
  queries: 'query string',
  param: 'path',
  header: 'headers',
};
const HONO_VALIDATORS = [
  '@hono/zod-validator',
  '@hono/valibot-validator',
  '@hono/standard-validator',
];
const HONO_TARGETS = {
  query: 'query string',
  param: 'path',
  header: 'headers',
  form: 'multipart form',
};
const FASTIFY_PARTS = { querystring: 'query string', params: 'path', headers: 'headers' };

function unwrapped(node) {
  const chain = [node];
  for (const current of chain) {
    if (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isNonNullExpression(current)
    ) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1);
}

function isRequest(node) {
  if (ts.isIdentifier(node)) {
    return REQUEST_NAMES.has(node.text);
  }
  return ts.isPropertyAccessExpression(node) && REQUEST_MEMBERS.has(node.name.text);
}

function honoAccessor(node) {
  const callee = node.expression;
  return node.arguments.length === 0 &&
    ts.isPropertyAccessExpression(callee) &&
    ts.isPropertyAccessExpression(callee.expression) &&
    callee.expression.name.text === 'req'
    ? HONO_ACCESSORS[callee.name.text]
    : undefined;
}

export function transportSource(expression) {
  const node = expression === undefined ? undefined : unwrapped(expression);
  if (node === undefined) {
    return undefined;
  }
  if (ts.isPropertyAccessExpression(node)) {
    return isRequest(node.expression) ? REQUEST_FIELDS[node.name.text] : undefined;
  }
  return ts.isCallExpression(node) ? honoAccessor(node) : undefined;
}

function parsed(call) {
  const found = libraryCall(call);
  if (found !== undefined) {
    return PARSE_METHODS.has(found.name)
      ? { schema: call.arguments[0], source: transportSource(call.arguments[1]) }
      : undefined;
  }
  const callee = call.expression;
  return ts.isPropertyAccessExpression(callee) && PARSE_METHODS.has(callee.name.text)
    ? { schema: callee.expression, source: transportSource(call.arguments[0]) }
    : undefined;
}

function honoValidator(call) {
  const callee = call.expression;
  const [target, schema] = call.arguments;
  if (!ts.isIdentifier(callee) || target === undefined || !ts.isStringLiteralLike(target)) {
    return undefined;
  }
  return importOf(callee) !== undefined && isFromPackage(callee, HONO_VALIDATORS)
    ? { schema, source: HONO_TARGETS[target.text] }
    : undefined;
}

function located(binding, checker, anchor) {
  if (binding?.source === undefined || binding.schema === undefined) {
    return [];
  }
  return (schemaProblems(binding.schema, checker) ?? []).map((entry) => ({
    ...entry,
    source: binding.source,
    binding: anchor,
  }));
}

export function callProblems(call, checker) {
  return located(parsed(call) ?? honoValidator(call), checker, call);
}

export function routeSchemaProblems(property, checker) {
  if (!ts.isPropertyAssignment(property) || nameOf(property.name) !== 'schema') {
    return [];
  }
  const parts = property.initializer;
  if (!ts.isObjectLiteralExpression(parts)) {
    return [];
  }
  return parts.properties.flatMap((part) => {
    const source = ts.isPropertyAssignment(part) ? FASTIFY_PARTS[nameOf(part.name)] : undefined;
    return located({ source, schema: part.initializer }, checker, part);
  });
}
