import { ts } from '../../../../../typescript-api/typescript-api.mjs';
import {
  baseIdentifier,
  importOf,
  isFromPackage,
  nameOf,
  resolvedExpression,
} from '../bindings/ts-nodes.mjs';

const MAX_DEPTH = 4;

const NUMBER = 'number';
const BIGINT = 'bigint';
const BOOLEAN = 'boolean';
const DATE = 'date';

export const SCHEMA_LIBRARIES = [
  {
    id: 'zod',
    packages: ['zod', 'nestjs-zod'],
    objects: ['object', 'strictObject', 'looseObject'],
    wrappers: ['optional', 'nullable', 'nullish', 'array', 'readonly', 'nonoptional', 'default'],
    kinds: {
      number: NUMBER,
      int: NUMBER,
      int32: NUMBER,
      uint32: NUMBER,
      float32: NUMBER,
      float64: NUMBER,
      int64: BIGINT,
      uint64: BIGINT,
      bigint: BIGINT,
      boolean: BOOLEAN,
      date: DATE,
    },
  },
  {
    id: 'valibot',
    packages: ['valibot'],
    objects: ['object', 'strictObject', 'looseObject', 'objectWithRest'],
    wrappers: [
      'optional',
      'nullable',
      'nullish',
      'array',
      'exactOptional',
      'undefinedable',
      'nonOptional',
      'nonNullable',
      'nonNullish',
      'pipe',
      'pipeAsync',
      'fallback',
    ],
    kinds: { number: NUMBER, bigint: BIGINT, boolean: BOOLEAN, date: DATE },
  },
];

const PICKERS = new Set(['pick', 'omit']);
const MERGERS = new Set(['extend', 'safeExtend', 'merge']);

function libraryOf(identifier) {
  return SCHEMA_LIBRARIES.find((library) => isFromPackage(identifier, library.packages));
}

export function libraryCall(node) {
  if (!ts.isCallExpression(node)) {
    return undefined;
  }
  const callee = node.expression;
  const base = baseIdentifier(callee);
  const library = base === undefined ? undefined : libraryOf(base);
  if (library === undefined) {
    return undefined;
  }
  if (ts.isIdentifier(callee)) {
    const imported = importOf(callee)?.imported;
    return imported === '*' || imported === 'default' ? undefined : { library, name: imported };
  }
  if (!ts.isPropertyAccessExpression(callee)) {
    return undefined;
  }
  const owner = callee.expression;
  if (ts.isIdentifier(owner)) {
    return { library, name: callee.name.text, display: `${owner.text}.${callee.name.text}()` };
  }
  return ts.isPropertyAccessExpression(owner) &&
    ts.isIdentifier(owner.expression) &&
    owner.name.text === 'coerce'
    ? {
        library,
        name: callee.name.text,
        coerce: true,
        display: `${owner.expression.text}.coerce.${callee.name.text}()`,
      }
    : undefined;
}

function isMethodCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    libraryCall(node) === undefined
  );
}

function literalKind(argument) {
  if (argument === undefined) {
    return undefined;
  }
  if (ts.isNumericLiteral(argument) || ts.isBigIntLiteral(argument)) {
    return ts.isBigIntLiteral(argument) ? BIGINT : NUMBER;
  }
  const isBoolean =
    argument.kind === ts.SyntaxKind.TrueKeyword || argument.kind === ts.SyntaxKind.FalseKeyword;
  return isBoolean ? BOOLEAN : undefined;
}

function callProblem(call, found) {
  if (found.coerce) {
    return found.name === 'boolean'
      ? { kind: BOOLEAN, cast: true, form: found.display, library: found.library.id }
      : undefined;
  }
  const kind =
    found.library.kinds[found.name] ??
    (found.name === 'literal' ? literalKind(call.arguments[0]) : undefined);
  const form = found.display ?? `${found.name}()`;
  return kind === undefined ? undefined : { kind, form, library: found.library.id };
}

export function leafProblem(expression, checker) {
  const pending = [expression];
  for (const current of pending) {
    const node = resolvedExpression(current, checker);
    if (node === undefined || pending.length > MAX_DEPTH * 4) {
      return undefined;
    }
    if (isMethodCall(node)) {
      pending.push(node.expression.expression);
      continue;
    }
    const found = libraryCall(node);
    if (found === undefined) {
      return undefined;
    }
    if (!found.coerce && found.library.wrappers.includes(found.name)) {
      pending.push(node.arguments[0]);
      continue;
    }
    return callProblem(node, found);
  }
  return undefined;
}

function literalFields(literal) {
  if (literal === undefined || !ts.isObjectLiteralExpression(literal)) {
    return undefined;
  }
  return literal.properties.flatMap((property) => {
    if (ts.isPropertyAssignment(property)) {
      return [{ name: nameOf(property.name), value: property.initializer }];
    }
    return ts.isShorthandPropertyAssignment(property)
      ? [{ name: property.name.text, value: property.name }]
      : [];
  });
}

function keyNames(argument) {
  const fields = literalFields(argument);
  if (fields !== undefined) {
    return new Set(fields.map(({ name }) => name));
  }
  return argument !== undefined && ts.isArrayLiteralExpression(argument)
    ? new Set(argument.elements.map((element) => nameOf(element)))
    : undefined;
}

function picked(fields, method, argument) {
  const keys = keyNames(argument);
  if (fields === undefined || keys === undefined) {
    return fields;
  }
  return fields.filter(({ name }) => keys.has(name) === (method === 'pick'));
}

function methodShape(node, checker, depth) {
  const method = node.expression.name.text;
  const receiver = shapeFields(node.expression.expression, checker, depth + 1);
  if (PICKERS.has(method)) {
    return picked(receiver, method, node.arguments[0]);
  }
  if (!MERGERS.has(method) || receiver === undefined) {
    return receiver;
  }
  const added =
    literalFields(resolvedExpression(node.arguments[0], checker)) ??
    shapeFields(node.arguments[0], checker, depth + 1) ??
    [];
  const names = new Set(added.map(({ name }) => name));
  return [...receiver.filter(({ name }) => !names.has(name)), ...added];
}

export function shapeFields(expression, checker, depth = 0) {
  const node = depth > MAX_DEPTH ? undefined : resolvedExpression(expression, checker);
  if (node === undefined) {
    return undefined;
  }
  if (isMethodCall(node)) {
    return methodShape(node, checker, depth);
  }
  const found = libraryCall(node);
  if (found === undefined || found.coerce) {
    return undefined;
  }
  if (found.library.objects.includes(found.name)) {
    return literalFields(resolvedExpression(node.arguments[0], checker));
  }
  return found.library.wrappers.includes(found.name)
    ? shapeFields(node.arguments[0], checker, depth + 1)
    : undefined;
}

export function schemaProblems(expression, checker, prefix = '', depth = 0) {
  const fields = shapeFields(expression, checker);
  if (fields === undefined) {
    return undefined;
  }
  return fields.flatMap(({ name, value }) => {
    const field = `${prefix}${name}`;
    const problem = leafProblem(value, checker);
    if (problem !== undefined) {
      return [{ field, node: value, problem }];
    }
    return depth < MAX_DEPTH ? (schemaProblems(value, checker, `${field}.`, depth + 1) ?? []) : [];
  });
}
