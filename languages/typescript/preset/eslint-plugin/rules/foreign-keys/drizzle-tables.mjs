import { initializer, libraryBinding, variableOf } from '../../../libraries/module-bindings.mjs';
import { staticKeyName } from '../analysis/static-shapes.mjs';
import { objectOf, propertiesOf, valueOf } from '../persistence/orm-bindings.mjs';

const DRIZZLE = ['drizzle-orm'];
const TABLES = new Set(['pgTable']);
const KEYED_COLUMN = new Set(['primaryKey', 'unique']);
const INDEX_BUILDERS = new Set(['index', 'uniqueIndex', 'unique']);
const KEY_BUILDERS = new Set(['primaryKey', 'foreignKey']);
const MODIFIERS = new Set(['asc', 'desc', 'op', 'nullsFirst', 'nullsLast']);
const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression']);
const NO_FACTS = { indexes: [], foreignKeys: [] };

function importedName(sourceCode, callee) {
  const base = callee?.type === 'MemberExpression' ? callee.object : callee;
  if (base?.type !== 'Identifier') {
    return undefined;
  }
  const binding = libraryBinding(variableOf(sourceCode, base), DRIZZLE);
  if (binding === undefined) {
    return undefined;
  }
  if (base === callee) {
    return binding.name ?? callee.name;
  }
  return binding.name === undefined ? staticKeyName(callee.property, callee.computed) : undefined;
}

function methodName(call) {
  return call.callee.type === 'MemberExpression'
    ? staticKeyName(call.callee.property, call.callee.computed)
    : undefined;
}

function chainOf(expression) {
  const calls = [];
  const pending = [expression];
  for (const node of pending) {
    if (node?.type === 'CallExpression') {
      calls.unshift(node);
      pending.push(node.callee.type === 'MemberExpression' ? node.callee.object : undefined);
    }
  }
  return calls;
}

function createdBy(sourceCode, node, name) {
  const created = node?.type === 'Identifier' ? initializer(variableOf(sourceCode, node)) : node;
  return created?.type === 'CallExpression' && importedName(sourceCode, created.callee) === name;
}

function isTable(sourceCode, call) {
  const { callee } = call;
  if (
    TABLES.has(importedName(sourceCode, callee)) ||
    createdBy(sourceCode, callee, 'pgTableCreator')
  ) {
    return true;
  }
  return (
    callee.type === 'MemberExpression' &&
    staticKeyName(callee.property, callee.computed) === 'table' &&
    createdBy(sourceCode, callee.object, 'pgSchema')
  );
}

function returned(callback) {
  if (callback.body.type !== 'BlockStatement') {
    return callback.body;
  }
  return callback.body.body.find((statement) => statement.type === 'ReturnStatement')?.argument;
}

function columnNamer(parameter) {
  if (parameter?.type === 'Identifier') {
    return (node) =>
      node.type === 'MemberExpression' &&
      node.object.type === 'Identifier' &&
      node.object.name === parameter.name
        ? staticKeyName(node.property, node.computed)
        : undefined;
  }
  const locals = new Map(
    (parameter?.type === 'ObjectPattern' ? parameter.properties : [])
      .filter((property) => property.type === 'Property' && property.value.type === 'Identifier')
      .map((property) => [property.value.name, staticKeyName(property.key, property.computed)]),
  );
  return (node) => (node.type === 'Identifier' ? locals.get(node.name) : undefined);
}

function columnsOf(nodes, namer) {
  return nodes.map((node) => {
    const [base] = chainOf(node);
    const unwrapped =
      base !== undefined && MODIFIERS.has(methodName(base)) ? base.callee.object : node;
    return unwrapped === undefined ? undefined : namer(unwrapped);
  });
}

function listedColumns(sourceCode, call, namer) {
  const options = propertiesOf(sourceCode, objectOf(sourceCode, call.arguments[0])).get('columns');
  const listed = valueOf(sourceCode, options?.value);
  return listed?.type === 'ArrayExpression'
    ? columnsOf(listed.elements, namer)
    : columnsOf(call.arguments, namer);
}

function indexFacts(rest, namer) {
  if (rest.some((call) => methodName(call) === 'where')) {
    return NO_FACTS;
  }
  const on = rest.find((call) => methodName(call) === 'on');
  const using = rest.find((call) => methodName(call) === 'using');
  return {
    indexes: [columnsOf(on?.arguments ?? using?.arguments.slice(1) ?? [], namer)],
    foreignKeys: [],
  };
}

function builderFacts(sourceCode, expression, namer) {
  const [first, ...rest] = chainOf(expression);
  const builder = first === undefined ? undefined : importedName(sourceCode, first.callee);
  if (INDEX_BUILDERS.has(builder)) {
    return indexFacts(rest, namer);
  }
  if (!KEY_BUILDERS.has(builder)) {
    return NO_FACTS;
  }
  const columns = listedColumns(sourceCode, first, namer);
  return builder === 'primaryKey'
    ? { indexes: [columns], foreignKeys: [] }
    : { indexes: [], foreignKeys: [{ node: first, columns }] };
}

function extraEntries(sourceCode, config) {
  const callback = valueOf(sourceCode, config);
  if (!FUNCTIONS.has(callback?.type)) {
    return [];
  }
  const namer = columnNamer(callback.params[0]);
  const body = returned(callback);
  const entries = body?.type === 'ArrayExpression' ? body.elements : [];
  const values =
    body?.type === 'ObjectExpression' ? [...propertiesOf(sourceCode, body).values()] : [];
  return [...entries, ...values.map((property) => property.value)].map((node) =>
    builderFacts(sourceCode, node, namer),
  );
}

function columnObject(sourceCode, columns) {
  const value = valueOf(sourceCode, columns);
  return FUNCTIONS.has(value?.type) ? returned(value) : value;
}

function columnFacts(sourceCode, columns) {
  const object = objectOf(sourceCode, columnObject(sourceCode, columns));
  return [...propertiesOf(sourceCode, object)].flatMap(([name, property]) => {
    const chain = chainOf(property.value);
    const references = chain.find((call) => methodName(call) === 'references');
    if (chain.some((call) => KEYED_COLUMN.has(methodName(call)))) {
      return [{ indexes: [[name]], foreignKeys: [] }];
    }
    return references === undefined
      ? []
      : [{ indexes: [], foreignKeys: [{ node: references, columns: [name] }] }];
  });
}

function isLeadingCover(index, columns) {
  const lead = index.slice(0, columns.length);
  return columns.every((column) => lead.includes(column));
}

export function unindexedTableKeys(sourceCode, call) {
  if (!isTable(sourceCode, call)) {
    return [];
  }
  const [, columns, config] = call.arguments;
  const facts = [...columnFacts(sourceCode, columns), ...extraEntries(sourceCode, config)];
  const indexes = facts.flatMap((fact) => fact.indexes);
  return facts
    .flatMap((fact) => fact.foreignKeys)
    .filter(
      ({ columns: keys }) =>
        keys.every(Boolean) && !indexes.some((index) => isLeadingCover(index, keys)),
    );
}
