import { stringValue } from '../../analysis/constant-resolution.mjs';
import { memberName, unwrapped } from '../../security/security-values.mjs';
import { chainSteps, KNEX, KYSELY, QUERY_BUILDER, queryChain } from '../query-chains.mjs';

export const IN = 'in';
export const INSERT = 'insert';

const IN_OPERATORS = new Set(['in', 'not in']);
const KNEX_IN = new Set(['whereIn', 'whereNotIn', 'orWhereIn', 'orWhereNotIn', 'andWhereIn', 'havingIn', 'havingNotIn']);
const ID_IN = new Set(['whereInIds', 'andWhereInIds', 'orWhereInIds']);
const DRIZZLE_IN = new Set(['inArray', 'notInArray']);
const TYPEORM_MODULES = new Set(['typeorm', '@nestjs/typeorm']);
const INSERT_ROOTS = new Set(['insertInto', 'insert', 'replaceInto']);

function calleeOf(call) {
  return unwrapped(call.callee);
}

function stepName(call) {
  const callee = calleeOf(call);
  return callee.type === 'MemberExpression' ? memberName(callee) : undefined;
}

function importedAs(scope, call, sources, names) {
  const callee = calleeOf(call);
  const binding = callee.type === 'Identifier' ? scope.bindings.get(callee.name) : undefined;
  return binding !== undefined && sources(binding.source) && names.has(binding.imported);
}

function operatorSink(scope, call) {
  const operator = stringValue(unwrapped(call.arguments[1]))?.toLowerCase();
  const usesBuilder = scope.libraries.has(KYSELY) || scope.libraries.has(KNEX);
  return call.arguments.length === 3 && IN_OPERATORS.has(operator) && usesBuilder ? call.arguments[2] : undefined;
}

function builderSink(scope, call) {
  const name = stepName(call);
  if (KNEX_IN.has(name) && (scope.libraries.has(KNEX) || queryChain(scope, call)?.library === KNEX)) {
    return call.arguments[1];
  }
  return ID_IN.has(name) && scope.libraries.has(QUERY_BUILDER) ? call.arguments[0] : undefined;
}

function functionSink(scope, call) {
  if (importedAs(scope, call, (source) => TYPEORM_MODULES.has(source), new Set(['In']))) {
    return call.arguments[0];
  }
  const drizzle = (source) => source === 'drizzle-orm' || source.startsWith('drizzle-orm/');
  return importedAs(scope, call, drizzle, DRIZZLE_IN) ? call.arguments[1] : undefined;
}

function insertSink(scope, call) {
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
  const repository = scope.libraries.has(QUERY_BUILDER) && steps.length === 1;
  return repository ? call.arguments.at(-1) : undefined;
}

/** The runtime array a query call expands into one bound parameter per element, and how. */
export function arraySink(scope, call) {
  const expanded = operatorSink(scope, call) ?? builderSink(scope, call) ?? functionSink(scope, call);
  if (expanded !== undefined) {
    return { kind: IN, array: expanded };
  }
  const rows = scope.libraries.size > 0 ? insertSink(scope, call) : undefined;
  return rows === undefined ? undefined : { kind: INSERT, array: rows };
}
