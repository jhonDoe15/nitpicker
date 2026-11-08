import { ts } from '../../../../../typescript-api/typescript-api.mjs';
import {
  baseIdentifier,
  importOf,
  isFromPackage,
  nameOf,
  resolvedExpression,
} from '../bindings/ts-nodes.mjs';

const MAX_DEPTH = 4;
const MAX_LEAF_STEPS = 16;

const NUMBER = 'number';
const BIGINT = 'bigint';
const BOOLEAN = 'boolean';
const DATE = 'date';

const SCHEMA_LIBRARIES = [
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
const SHAPE_OPERATIONS = new Set([...PICKERS, ...MERGERS]);

function libraryOf(identifier) {
  return SCHEMA_LIBRARIES.find((library) => isFromPackage(identifier, library.packages));
}

function namespaceCall(callee, library) {
  const owner = callee.expression;
  if (ts.isIdentifier(owner)) {
    return { library, name: callee.name.text, display: `${owner.text}.${callee.name.text}()` };
  }
  const isCoerce =
    ts.isPropertyAccessExpression(owner) &&
    ts.isIdentifier(owner.expression) &&
    owner.name.text === 'coerce';
  return isCoerce
    ? {
        library,
        name: callee.name.text,
        coerce: true,
        display: `${owner.expression.text}.coerce.${callee.name.text}()`,
      }
    : undefined;
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
  return ts.isPropertyAccessExpression(callee) ? namespaceCall(callee, library) : undefined;
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

function leafStep(node) {
  if (isMethodCall(node)) {
    return { next: node.expression.expression };
  }
  const found = libraryCall(node);
  if (found === undefined) {
    return {};
  }
  return !found.coerce && found.library.wrappers.includes(found.name)
    ? { next: node.arguments[0] }
    : { problem: callProblem(node, found) };
}

export function leafProblem(expression, checker) {
  const pending = [expression];
  for (const current of pending) {
    const node = resolvedExpression(current, checker);
    const step = node === undefined || pending.length > MAX_LEAF_STEPS ? {} : leafStep(node);
    if (step.next !== undefined) {
      pending.push(step.next);
    } else {
      return step.problem;
    }
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

function applied(fields, { method, argument }, checker) {
  if (PICKERS.has(method)) {
    const keys = keyNames(argument);
    return keys === undefined
      ? fields
      : fields.filter(({ name }) => keys.has(name) === (method === 'pick'));
  }
  const added = addedFields(argument, checker);
  if (added === undefined) {
    return undefined;
  }
  const names = new Set(added.map(({ name }) => name));
  return [...fields.filter(({ name }) => !names.has(name)), ...added];
}

function shapeStep(node) {
  if (isMethodCall(node)) {
    const method = node.expression.name.text;
    const operation = SHAPE_OPERATIONS.has(method)
      ? { method, argument: node.arguments[0] }
      : undefined;
    return { next: node.expression.expression, operation };
  }
  const found = libraryCall(node);
  if (found === undefined || found.coerce) {
    return {};
  }
  if (found.library.objects.includes(found.name)) {
    return { shape: node.arguments[0] };
  }
  return found.library.wrappers.includes(found.name) ? { next: node.arguments[0] } : {};
}

function shapeRoot(expression, checker) {
  const pending = [expression];
  const operations = [];
  for (const current of pending) {
    const node = resolvedExpression(current, checker);
    const step = node === undefined || pending.length > MAX_LEAF_STEPS ? {} : shapeStep(node);
    if (step.operation !== undefined) {
      operations.unshift(step.operation);
    }
    if (step.next !== undefined) {
      pending.push(step.next);
    } else {
      return step.shape === undefined ? undefined : { shape: step.shape, operations };
    }
  }
  return undefined;
}

function addedFields(argument, checker) {
  const direct = literalFields(resolvedExpression(argument, checker));
  if (direct !== undefined || argument === undefined) {
    return direct;
  }
  const isShape = ts.isPropertyAccessExpression(argument) && argument.name.text === 'shape';
  const root = shapeRoot(isShape ? argument.expression : argument, checker);
  return root !== undefined && root.operations.length === 0
    ? literalFields(resolvedExpression(root.shape, checker))
    : undefined;
}

function shapeFields(expression, checker) {
  const root = shapeRoot(expression, checker);
  const initial =
    root === undefined ? undefined : literalFields(resolvedExpression(root.shape, checker));
  return (root?.operations ?? []).reduce(
    (fields, operation) => (fields === undefined ? undefined : applied(fields, operation, checker)),
    initial,
  );
}

function fieldProblems({ fields, prefix, depth }, checker) {
  const problems = [];
  const nested = [];
  for (const { name, value } of fields) {
    const field = `${prefix}${name}`;
    const problem = leafProblem(value, checker);
    const inner =
      problem === undefined && depth < MAX_DEPTH ? shapeFields(value, checker) : undefined;
    if (problem !== undefined) {
      problems.push({ field, node: value, problem });
    }
    if (inner !== undefined) {
      nested.push({ fields: inner, prefix: `${field}.`, depth: depth + 1 });
    }
  }
  return { problems, nested };
}

export function schemaProblems(expression, checker) {
  const fields = shapeFields(expression, checker);
  if (fields === undefined) {
    return undefined;
  }
  const pending = [{ fields, prefix: '', depth: 0 }];
  const problems = [];
  for (const level of pending) {
    const found = fieldProblems(level, checker);
    problems.push(...found.problems);
    pending.push(...found.nested);
  }
  return problems;
}
