import type TypeScript from 'typescript';
import { ts } from '../../typed/typescript-views.mts';
import { resolvedExpression } from '../bindings/ts-nodes.mts';
import type { Checker, Finding, Kind, Problem } from '../problem-types.mts';
import { isMethodCall, libraryCall, listed, type LibraryCall } from './schema-libraries.mts';
import { shapeFields, type Field } from './schema-shapes.mts';

type LeafStep = {
  readonly next?: TypeScript.Node | undefined;
  readonly problem?: Problem | undefined;
};
type Level = { readonly fields: Field[]; readonly prefix: string; readonly depth: number };

const MAX_DEPTH = 4;
const MAX_LEAF_STEPS = 16;
const NUMBER = 'number';
const BIGINT = 'bigint';
const BOOLEAN = 'boolean';
const OPEN_METHODS = new Set(['or', 'and', 'catch']);
const INTEGERS = new Set<string | undefined>(['int', 'int32', 'uint32']);

function literalKind(argument: TypeScript.Expression | undefined): Kind | undefined {
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

function callProblem(call: TypeScript.CallExpression, found: LibraryCall): Problem | undefined {
  if (found.coerce) {
    return found.name === 'boolean'
      ? { kind: BOOLEAN, cast: true, form: found.display, library: found.library.id }
      : undefined;
  }
  const kind =
    (found.name === undefined ? undefined : found.library.kinds[found.name]) ??
    (found.name === 'literal' ? literalKind(call.arguments[0]) : undefined);
  const form = found.display ?? `${found.name ?? ''}()`;
  if (kind === undefined) {
    return undefined;
  }
  const integer = found.library.id === 'zod' && INTEGERS.has(found.name);
  return { kind: integer ? 'integer' : kind, form, library: found.library.id };
}

function leafStep(node: TypeScript.Node): LeafStep {
  if (isMethodCall(node)) {
    return OPEN_METHODS.has(node.expression.name.text) ? {} : { next: node.expression.expression };
  }
  if (!ts.isCallExpression(node)) {
    return {};
  }
  const found = libraryCall(node);
  if (found === undefined) {
    return {};
  }
  return !found.coerce && listed(found.library.wrappers, found.name)
    ? { next: node.arguments[0] }
    : { problem: callProblem(node, found) };
}

export function leafProblem(
  expression: TypeScript.Node | undefined,
  checker: Checker,
): Problem | undefined {
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

function fieldProblems(
  { fields, prefix, depth }: Level,
  checker: Checker,
): { readonly problems: Finding[]; readonly nested: Level[] } {
  const problems: Finding[] = [];
  const nested: Level[] = [];
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

export function schemaProblems(
  expression: TypeScript.Node | undefined,
  checker: Checker,
): Finding[] | undefined {
  const fields = shapeFields(expression, checker);
  if (fields === undefined) {
    return undefined;
  }
  const pending: Level[] = [{ fields, prefix: '', depth: 0 }];
  const problems: Finding[] = [];
  for (const level of pending) {
    const found = fieldProblems(level, checker);
    problems.push(...found.problems);
    pending.push(...found.nested);
  }
  return problems;
}
