import type TypeScript from 'typescript';
import { ts } from '../../typed/typescript-views.mts';
import { schemaProblems } from '../fields/schema-fields.mts';
import { libraryCall } from '../fields/schema-libraries.mts';
import type { Checker, Located } from '../problem-types.mts';
import { nameOf } from './import-bindings.mts';
import { importOf, isFromPackage } from './ts-nodes.mts';

type Names = Readonly<Record<string, string>>;
type Binding = {
  readonly schema: TypeScript.Node | undefined;
  readonly source: string | undefined;
};

const PARSE_METHODS = new Set<string | undefined>([
  'parse',
  'safeParse',
  'parseAsync',
  'safeParseAsync',
  'spa',
]);
const QUERY_STRING = 'query string';
const HEADERS = 'headers';
const REQUEST_FIELDS: Names = { query: QUERY_STRING, params: 'path', headers: HEADERS };
const REQUEST_NAMES = new Set(['req', 'request', 'ctx']);
const REQUEST_MEMBERS = new Set(['req', 'request']);
const HONO_ACCESSORS: Names = {
  query: QUERY_STRING,
  queries: QUERY_STRING,
  param: 'path',
  header: HEADERS,
};
const HONO_VALIDATORS = [
  '@hono/zod-validator',
  '@hono/valibot-validator',
  '@hono/standard-validator',
];
const HONO_TARGETS: Names = {
  query: QUERY_STRING,
  param: 'path',
  header: HEADERS,
  form: 'multipart form',
};
const FASTIFY_PARTS: Names = { querystring: QUERY_STRING, params: 'path', headers: HEADERS };

export function unwrapped(node: TypeScript.Expression): TypeScript.Node | undefined {
  const chain: TypeScript.Node[] = [node];
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

export function isRequest(node: TypeScript.Node): boolean {
  if (ts.isIdentifier(node)) {
    return REQUEST_NAMES.has(node.text);
  }
  return ts.isPropertyAccessExpression(node) && REQUEST_MEMBERS.has(node.name.text);
}

function honoAccessor(node: TypeScript.CallExpression): string | undefined {
  const callee = node.expression;
  return node.arguments.length === 0 &&
    ts.isPropertyAccessExpression(callee) &&
    ts.isPropertyAccessExpression(callee.expression) &&
    callee.expression.name.text === 'req'
    ? HONO_ACCESSORS[callee.name.text]
    : undefined;
}

export function transportSource(expression: TypeScript.Expression | undefined): string | undefined {
  const node = expression === undefined ? undefined : unwrapped(expression);
  if (node === undefined) {
    return undefined;
  }
  if (ts.isPropertyAccessExpression(node)) {
    return isRequest(node.expression) ? REQUEST_FIELDS[node.name.text] : undefined;
  }
  return ts.isCallExpression(node) ? honoAccessor(node) : undefined;
}

export function calleeName(call: TypeScript.CallExpression): string | undefined {
  const callee = call.expression;
  if (ts.isPropertyAccessExpression(callee)) {
    return callee.name.text;
  }
  return ts.isIdentifier(callee) ? callee.text : undefined;
}

function parsed(call: TypeScript.CallExpression): Binding | undefined {
  if (!PARSE_METHODS.has(calleeName(call))) {
    return undefined;
  }
  const found = libraryCall(call);
  if (found !== undefined) {
    return { schema: call.arguments[0], source: transportSource(call.arguments[1]) };
  }
  const callee = call.expression;
  return ts.isPropertyAccessExpression(callee)
    ? { schema: callee.expression, source: transportSource(call.arguments[0]) }
    : undefined;
}

function honoValidator(call: TypeScript.CallExpression): Binding | undefined {
  const callee = call.expression;
  const [target, schema] = call.arguments;
  if (!ts.isIdentifier(callee) || target === undefined || !ts.isStringLiteralLike(target)) {
    return undefined;
  }
  if (!Object.hasOwn(HONO_TARGETS, target.text)) {
    return undefined;
  }
  return importOf(callee) !== undefined && isFromPackage(callee, HONO_VALIDATORS)
    ? { schema, source: HONO_TARGETS[target.text] }
    : undefined;
}

function located(
  binding: Binding | undefined,
  checker: Checker,
  anchor: TypeScript.Node,
): Located[] {
  if (binding?.source === undefined || binding.schema === undefined) {
    return [];
  }
  const { source, schema } = binding;
  return (schemaProblems(schema, checker) ?? []).map((entry) => ({
    ...entry,
    source,
    binding: anchor,
  }));
}

export function callProblems(call: TypeScript.CallExpression, checker: Checker): Located[] {
  return located(parsed(call) ?? honoValidator(call), checker, call);
}

export function routeSchemaProblems(
  property: TypeScript.PropertyAssignment,
  checker: Checker,
): Located[] {
  if (!ts.isPropertyAssignment(property) || nameOf(property.name) !== 'schema') {
    return [];
  }
  const parts = property.initializer;
  if (!ts.isObjectLiteralExpression(parts)) {
    return [];
  }
  return parts.properties.flatMap((part) => {
    if (!ts.isPropertyAssignment(part)) {
      return [];
    }
    const name = nameOf(part.name);
    const source = name === undefined ? undefined : FASTIFY_PARTS[name];
    return located({ source, schema: part.initializer }, checker, part);
  });
}
