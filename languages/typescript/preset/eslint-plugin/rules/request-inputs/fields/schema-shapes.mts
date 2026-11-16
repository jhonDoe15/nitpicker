import type TypeScript from 'typescript';
import { ts } from '../../typed/typescript-views.mts';
import { nameOf } from '../bindings/import-bindings.mts';
import { resolvedExpression } from '../bindings/ts-nodes.mts';
import type { Checker } from '../problem-types.mts';
import { isMethodCall, libraryCall, listed } from './schema-libraries.mts';

export type Field = { readonly name: string; readonly value: TypeScript.Node };
type Operation = { readonly method: string; readonly argument: TypeScript.Expression | undefined };
type ShapeStep = {
  readonly next?: TypeScript.Node | undefined;
  readonly operation?: Operation | undefined;
  readonly shape?: TypeScript.Node | undefined;
};

const MAX_LEAF_STEPS = 16;
const PICKERS = new Set(['pick', 'omit']);
const MERGERS = new Set(['extend', 'safeExtend', 'merge']);
const SHAPE_OPERATIONS = new Set([...PICKERS, ...MERGERS]);

function literalFields(literal: TypeScript.Node | undefined): Field[] | undefined {
  if (literal === undefined || !ts.isObjectLiteralExpression(literal)) {
    return undefined;
  }
  return literal.properties.flatMap((property) => {
    if (ts.isPropertyAssignment(property)) {
      const name = nameOf(property.name);
      return name === undefined ? [] : [{ name, value: property.initializer }];
    }
    return ts.isShorthandPropertyAssignment(property)
      ? [{ name: property.name.text, value: property.name }]
      : [];
  });
}

function keyNames(
  expression: TypeScript.Node | undefined,
  checker: Checker,
): ReadonlySet<string | undefined> | undefined {
  const argument = resolvedExpression(expression, checker);
  const fields = literalFields(argument);
  if (fields !== undefined) {
    return new Set(fields.map(({ name }) => name));
  }
  return argument !== undefined && ts.isArrayLiteralExpression(argument)
    ? new Set(argument.elements.map((element) => nameOf(element)))
    : undefined;
}

function applied(
  fields: Field[],
  { method, argument }: Operation,
  checker: Checker,
): Field[] | undefined {
  if (PICKERS.has(method)) {
    const keys = keyNames(argument, checker);
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

function shapeStep(node: TypeScript.Node): ShapeStep {
  if (isMethodCall(node)) {
    const method = node.expression.name.text;
    const operation = SHAPE_OPERATIONS.has(method)
      ? { method, argument: node.arguments[0] }
      : undefined;
    return { next: node.expression.expression, operation };
  }
  if (!ts.isCallExpression(node)) {
    return {};
  }
  const found = libraryCall(node);
  if (found === undefined || found.coerce) {
    return {};
  }
  if (listed(found.library.objects, found.name)) {
    return { shape: node.arguments[0] };
  }
  return listed(found.library.wrappers, found.name) ? { next: node.arguments[0] } : {};
}

function shapeRoot(
  expression: TypeScript.Node | undefined,
  checker: Checker,
): { readonly shape: TypeScript.Node; readonly operations: Operation[] } | undefined {
  const pending = [expression];
  const operations: Operation[] = [];
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

function addedFields(
  argument: TypeScript.Expression | undefined,
  checker: Checker,
): Field[] | undefined {
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

export function shapeFields(
  expression: TypeScript.Node | undefined,
  checker: Checker,
): Field[] | undefined {
  const root = shapeRoot(expression, checker);
  const initial =
    root === undefined ? undefined : literalFields(resolvedExpression(root.shape, checker));
  return (root?.operations ?? []).reduce<Field[] | undefined>(
    (fields, operation) => (fields === undefined ? undefined : applied(fields, operation, checker)),
    initial,
  );
}
