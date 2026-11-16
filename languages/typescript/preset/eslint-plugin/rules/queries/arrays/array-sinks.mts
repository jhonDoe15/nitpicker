import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { stringValue } from '../../analysis/constant-resolution.mts';
import { memberName, unwrapped } from '../../security/security-values.mts';
import { nameOf } from '../../typed/node-views.mts';
import { KNEX, KYSELY, QUERY_BUILDER, type ChainScope } from '../chains/chain-libraries.mts';
import { chainSteps, queryChain } from '../query-chains.mts';

export const IN = 'in';
const INSERT = 'insert';

export type ArraySink = {
  readonly kind: typeof IN | typeof INSERT;
  readonly array: TSESTree.Node;
};
type MaybeNode = TSESTree.Node | undefined;
type Module = {
  readonly sources: (source: string) => boolean;
  readonly names: ReadonlySet<string | undefined>;
};

const IN_OPERATORS = new Set<string | undefined>(['in', 'not in']);
const KNEX_IN = new Set<string | undefined>([
  'whereIn',
  'whereNotIn',
  'orWhereIn',
  'orWhereNotIn',
  'andWhereIn',
  'havingIn',
  'havingNotIn',
]);
const ID_IN = new Set<string | undefined>(['whereInIds', 'andWhereInIds', 'orWhereInIds']);
const DRIZZLE_IN = new Set<string | undefined>(['inArray', 'notInArray']);
const TYPEORM_MODULES = new Set<string>(['typeorm', '@nestjs/typeorm']);
const OPERATOR_ARGUMENTS = 3;
const TYPEORM_IN = new Set<string | undefined>(['In']);
const INSERT_ROOTS = new Set<string>(['insertInto', 'insert', 'replaceInto']);
const REPOSITORY_NAME = /repo(?:sitory)?$/iu;

function calleeOf(call: TSESTree.CallExpression): TSESTree.Node {
  return unwrapped(call.callee);
}

function stepName(call: TSESTree.CallExpression): string | undefined {
  const callee = calleeOf(call);
  return callee.type === AST_NODE_TYPES.MemberExpression ? memberName(callee) : undefined;
}

function importedAs(
  scope: ChainScope,
  call: TSESTree.CallExpression,
  { sources, names }: Module,
): boolean {
  const callee = calleeOf(call);
  const binding =
    callee.type === AST_NODE_TYPES.Identifier ? scope.bindings.get(callee.name) : undefined;
  return binding !== undefined && sources(binding.source) && names.has(binding.imported);
}

function isTypeormModule(source: string): boolean {
  return TYPEORM_MODULES.has(source);
}

function isDrizzleModule(source: string): boolean {
  return source === 'drizzle-orm' || source.startsWith('drizzle-orm/');
}

function operatorSink(scope: ChainScope, call: TSESTree.CallExpression): MaybeNode {
  const operator = stringValue(unwrapped(call.arguments[1]))?.toLowerCase();
  const usesBuilder = scope.libraries.has(KYSELY) || scope.libraries.has(KNEX);
  return call.arguments.length === OPERATOR_ARGUMENTS && IN_OPERATORS.has(operator) && usesBuilder
    ? call.arguments[2]
    : undefined;
}

function builderSink(scope: ChainScope, call: TSESTree.CallExpression): MaybeNode {
  const name = stepName(call);
  if (
    KNEX_IN.has(name) &&
    (scope.libraries.has(KNEX) || queryChain(scope, call)?.library === KNEX)
  ) {
    return call.arguments[1];
  }
  return ID_IN.has(name) && scope.libraries.has(QUERY_BUILDER) ? call.arguments[0] : undefined;
}

function functionSink(scope: ChainScope, call: TSESTree.CallExpression): MaybeNode {
  if (importedAs(scope, call, { sources: isTypeormModule, names: TYPEORM_IN })) {
    return call.arguments[0];
  }
  return importedAs(scope, call, { sources: isDrizzleModule, names: DRIZZLE_IN })
    ? call.arguments[1]
    : undefined;
}

function insertSink(scope: ChainScope, call: TSESTree.CallExpression): MaybeNode {
  const name = stepName(call);
  const { steps } = chainSteps(call);
  const names = new Set(steps.map((step) => step.name));
  if (name === 'values' && [...INSERT_ROOTS].some((root) => names.has(root))) {
    return call.arguments[0];
  }
  if (name !== 'insert' || steps.length === 0) {
    return undefined;
  }
  const chain = queryChain(scope, call);
  if (chain?.library === KNEX) {
    return call.arguments[0];
  }
  const receiver =
    call.callee.type === AST_NODE_TYPES.MemberExpression
      ? unwrapped(call.callee.object)
      : undefined;
  const named = REPOSITORY_NAME.test(
    receiver?.type === AST_NODE_TYPES.MemberExpression
      ? (memberName(receiver) ?? '')
      : (nameOf(receiver) ?? ''),
  );
  const repository =
    scope.libraries.has(QUERY_BUILDER) && steps.length === 1 && (named || chain !== undefined);
  return repository ? call.arguments.at(-1) : undefined;
}

/** The runtime array a query call expands into one bound parameter per element, and how. */
export function arraySink(scope: ChainScope, call: TSESTree.CallExpression): ArraySink | undefined {
  const expanded =
    operatorSink(scope, call) ?? builderSink(scope, call) ?? functionSink(scope, call);
  if (expanded !== undefined) {
    return { kind: IN, array: expanded };
  }
  const rows = scope.libraries.size > 0 ? insertSink(scope, call) : undefined;
  return rows === undefined ? undefined : { kind: INSERT, array: rows };
}
