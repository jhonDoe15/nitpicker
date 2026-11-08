import { findVariable, stringValue } from '../analysis/constant-resolution.mjs';
import { moduleScope } from '../database/orm-modules.mjs';
import { memberName, typeServices, unwrapped } from '../security/security-values.mjs';

export const KYSELY = 'kysely';
export const KNEX = 'knex';
export const QUERY_BUILDER = 'query-builder';
export const DRIZZLE = 'drizzle';

const LIBRARIES = [
  [KYSELY, (source) => source === 'kysely' || source.startsWith('kysely/')],
  [KNEX, (source) => source === 'knex'],
  [QUERY_BUILDER, (source) => ['typeorm', '@nestjs/typeorm'].includes(source)],
  [QUERY_BUILDER, (source) => source.startsWith('@mikro-orm/')],
  [DRIZZLE, (source) => source === 'drizzle-orm' || source.startsWith('drizzle-orm/')],
];
const ROOT_TYPES = new Map([
  ['Kysely', KYSELY],
  ['Transaction', KYSELY],
  ['Knex', KNEX],
  ['Repository', QUERY_BUILDER],
  ['EntityManager', QUERY_BUILDER],
  ['DataSource', QUERY_BUILDER],
]);
const DRIZZLE_DATABASE = /^(?:\w+Database|PgTransaction|MySqlTransaction|SQLiteTransaction)$/u;
const ORDER_STEPS = new Set(['orderBy', 'addOrderBy', 'orderByRaw']);
const OPAQUE_STEPS = new Set(['$call', '$if', 'modify', '$dynamic', 'call', 'apply', 'pipe']);
const WRITE_STEPS = new Set([
  'insert',
  'insertInto',
  'update',
  'updateTable',
  'delete',
  'deleteFrom',
  'del',
  'softDelete',
  'restore',
  'replaceInto',
  'mergeInto',
  'truncate',
  'relation',
]);
const SELECT_STEPS = new Set(['select', 'selectDistinct', 'selectDistinctOn', 'from', 'distinct']);
const BUILTIN_ROOTS = new Set([
  'Array',
  'Iterator',
  'Object',
  'Promise',
  'Buffer',
  'Observable',
  'Readable',
]);

function libraryOf(source) {
  return LIBRARIES.find(([, matches]) => matches(source))?.[0];
}

export function queryScope(context) {
  const scope = moduleScope(context);
  const sources = [...scope.bindings.values()].map(({ source }) => source);
  const libraries = new Set(sources.map(libraryOf).filter((library) => library !== undefined));
  return { ...scope, libraries };
}

function stepOf(node) {
  const call = unwrapped(node);
  const callee = call?.type === 'CallExpression' ? unwrapped(call.callee) : undefined;
  if (callee?.type !== 'MemberExpression') {
    return undefined;
  }
  return { name: memberName(callee), call, object: unwrapped(callee.object) };
}

export function chainSteps(node) {
  const steps = [];
  let current = unwrapped(node);
  for (let step = stepOf(current); step !== undefined; step = stepOf(current)) {
    steps.unshift(step);
    current = step.object;
  }
  return { root: current, steps };
}

export function isOutermostStep(node) {
  const parent = node.parent;
  const member = parent?.type === 'MemberExpression' && parent.object === node;
  return !(member && parent.parent?.type === 'CallExpression' && parent.parent.callee === parent);
}

function rootTypeName(context, root) {
  const services = typeServices(context);
  if (services === undefined || root === undefined) {
    return undefined;
  }
  const type = services.getTypeAtLocation(root);
  return (type.getSymbol() ?? type.aliasSymbol)?.getName();
}

function typedLibrary(context, root) {
  const name = rootTypeName(context, root);
  if (name === undefined) {
    return undefined;
  }
  return ROOT_TYPES.get(name) ?? (DRIZZLE_DATABASE.test(name) ? DRIZZLE : undefined);
}

function rootName(root) {
  const target = unwrapped(root);
  if (target?.type === 'Identifier') {
    return target.name;
  }
  return target?.type === 'MemberExpression' ? memberName(target) : undefined;
}

function isKnexCall(scope, root) {
  const call = root?.type === 'CallExpression' ? root : undefined;
  const name = call === undefined ? undefined : rootName(call.callee);
  const table = call !== undefined && stringValue(unwrapped(call.arguments[0])) !== undefined;
  return name === 'knex' || (table && scope.libraries.has(KNEX) && call.arguments.length === 1);
}

function isKnexHandle(root) {
  return rootName(root) === 'knex';
}

function stepLibrary(scope, root, names) {
  if (names.has('selectFrom')) {
    return KYSELY;
  }
  if (names.has('createQueryBuilder')) {
    return QUERY_BUILDER;
  }
  if (isKnexHandle(root) && [...names].some((name) => SELECT_STEPS.has(name))) {
    return KNEX;
  }
  const imported = [DRIZZLE, KNEX].find((library) => scope.libraries.has(library));
  return names.has('from') && !BUILTIN_ROOTS.has(rootName(root)) ? imported : undefined;
}

function chainLibrary(scope, root, names) {
  if (isKnexCall(scope, root)) {
    return KNEX;
  }
  return stepLibrary(scope, root, names) ?? typedLibrary(scope.context, root);
}

function builderVariable(context, identifier) {
  if (identifier?.type !== 'Identifier') {
    return undefined;
  }
  const variable = findVariable(context, identifier, identifier.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return definition?.type === 'Variable' && definition.node.init ? variable : undefined;
}

function heldBy(node) {
  const parent = node.parent;
  if (parent?.type === 'VariableDeclarator' && parent.init === node) {
    return parent.id;
  }
  return parent?.type === 'AssignmentExpression' && parent.right === node ? parent.left : undefined;
}

function referenceChain(reference) {
  if (reference.isWrite()) {
    return reference.writeExpr ? chainSteps(reference.writeExpr) : undefined;
  }
  const identifier = reference.identifier;
  const member = identifier.parent;
  if (member?.type !== 'MemberExpression' || member.object !== identifier) {
    return undefined;
  }
  if (member.parent?.type !== 'CallExpression' || member.parent.callee !== member) {
    return { root: identifier, steps: [] };
  }
  let top = member.parent;
  while (!isOutermostStep(top)) {
    top = top.parent.parent;
  }
  return chainSteps(top);
}

function variableChains(variable) {
  const chains = variable.references.map((reference) => referenceChain(reference));
  return chains.includes(undefined) ? undefined : chains;
}

function declaredRoot(variable) {
  return chainSteps(variable.defs[0].node.init);
}

function expandedChain(context, node) {
  const own = chainSteps(node);
  const variables = [own.root, heldBy(node)]
    .map((identifier) => builderVariable(context, identifier))
    .filter((variable) => variable !== undefined);
  const chains = variables.map((variable) => variableChains(variable));
  if (chains.includes(undefined)) {
    return undefined;
  }
  const rootVariable = builderVariable(context, own.root);
  const related = chains.flat().flatMap((chain) => chain.steps);
  if (rootVariable === undefined) {
    return { ...own, related };
  }
  const declared = declaredRoot(rootVariable);
  if (declared.steps.length === 0) {
    return undefined;
  }
  return { root: declared.root, steps: [...declared.steps, ...own.steps], related };
}

/**
 * The query chain that ends at `node`: its library, its steps from the root, and the names of every
 * step that the local builder variable holding it gets elsewhere. `undefined` when `node` is not a
 * query builder, or when the builder escapes into code this rule cannot see.
 */
export function queryChain(scope, node) {
  const chain = expandedChain(scope.context, node);
  if (chain === undefined) {
    return undefined;
  }
  const names = new Set([...chain.steps, ...chain.related].map((step) => step.name));
  const library = chainLibrary(scope, chain.root, names);
  return library === undefined
    ? undefined
    : { library, steps: chain.steps, names, root: chain.root };
}

export function isOrdered(chain) {
  return [...chain.names].some((name) => ORDER_STEPS.has(name));
}

export function isOpaque(chain) {
  return [...chain.names].some((name) => OPAQUE_STEPS.has(name));
}

export function isWrite(chain) {
  return [...chain.names].some((name) => WRITE_STEPS.has(name));
}
