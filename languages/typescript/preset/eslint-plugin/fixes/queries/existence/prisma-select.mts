import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { calleeFamily, PRISMA } from '../../../rules/queries/receivers/orm-callee.mts';
import {
  memberName,
  typeServices,
  type Context,
} from '../../../rules/security/security-values.mts';
import { ts } from '../../../rules/typed/typescript-views.mts';
import { appendingArgument } from '../../support/calls.mts';
import { addingProperty, isPlainObject, keyName } from '../../support/objects.mts';
import { hasCommentIn, type FixPlan } from '../../support/ranges.mts';

const METHODS = new Map([
  ['findFirst', true],
  ['findUnique', false],
]);
const BLOCKING_KEYS = new Set([
  'select',
  'include',
  'omit',
  'relationLoadStrategy',
  'rejectOnNotFound',
  'distinct',
]);
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;
const PRIMARY = 'id';
const SCALARS =
  ts.TypeFlags.StringLike |
  ts.TypeFlags.NumberLike |
  ts.TypeFlags.BooleanLike |
  ts.TypeFlags.BigIntLike;

export type SelectFix = { readonly field: string; readonly plan: FixPlan };

function isScalar(type: TypeScript.Type): boolean {
  const parts = type.isUnion() ? type.types : [type];
  return parts.every(
    (part) => (part.flags & SCALARS) !== 0 || part.getSymbol()?.getName() === 'Date',
  );
}

function scalarFieldOf(
  checker: TypeScript.TypeChecker,
  row: TypeScript.Type,
  node: TypeScript.Node,
): string | undefined {
  if (row.isUnion() || (row.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) {
    return undefined;
  }
  const scalars = checker
    .getPropertiesOfType(row)
    .filter((symbol) => IDENTIFIER.test(symbol.getName()))
    .filter((symbol) => {
      const type = checker.getTypeOfSymbolAtLocation(symbol, node);
      return !isNullable(type) && isScalar(type);
    })
    .map((symbol) => symbol.getName());
  return scalars.includes(PRIMARY) ? PRIMARY : scalars[0];
}

function isNullable(type: TypeScript.Type): boolean {
  const parts = type.isUnion() ? type.types : [type];
  return parts.some((part) => (part.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) !== 0);
}

function rowFieldOf(context: Context, awaited: TSESTree.AwaitExpression): string | undefined {
  const services = typeServices(context);
  if (services === undefined) {
    return undefined;
  }
  const checker = services.program.getTypeChecker();
  const row = checker.getNonNullableType(services.getTypeAtLocation(awaited));
  return scalarFieldOf(checker, row, services.esTreeNodeToTSNodeMap.get(awaited));
}

function selectPlan(
  context: Context,
  call: TSESTree.CallExpression,
  { text, allowEmpty }: { readonly text: string; readonly allowEmpty: boolean },
): FixPlan | undefined {
  const [options, ...rest] = call.arguments;
  if (rest.length > 0) {
    return undefined;
  }
  if (options === undefined) {
    return allowEmpty && !hasCommentIn(context.sourceCode, call.range)
      ? appendingArgument(context.sourceCode, call, `{ ${text} }`)
      : undefined;
  }
  const blocked =
    !isPlainObject(options) ||
    options.properties.some((property) => BLOCKING_KEYS.has(keyName(property) ?? ''));
  return blocked ? undefined : addingProperty(context.sourceCode, options, text);
}

export function prismaSelectFix(
  context: Context,
  call: TSESTree.CallExpression,
  awaited: TSESTree.AwaitExpression,
): SelectFix | undefined {
  const { callee } = call;
  const allowEmpty =
    callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed
      ? METHODS.get(memberName(callee) ?? '')
      : undefined;
  if (allowEmpty === undefined || calleeFamily(context, call) !== PRISMA) {
    return undefined;
  }
  const field = rowFieldOf(context, awaited);
  const plan =
    field === undefined
      ? undefined
      : selectPlan(context, call, { text: `select: { ${field}: true }`, allowEmpty });
  return field === undefined || plan === undefined ? undefined : { field, plan };
}
