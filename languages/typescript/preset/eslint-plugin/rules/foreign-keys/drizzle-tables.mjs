import { libraryBinding, variableOf } from '../../../libraries/module-bindings.mjs';
import { staticKeyName } from '../analysis/static-shapes.mjs';
import { objectOf, propertiesOf, valueOf } from '../persistence/orm-bindings.mjs';

const DRIZZLE = ['drizzle-orm'];
const TABLES = new Set(['pgTable']);
const KEYED_COLUMN = new Set(['primaryKey', 'unique']);
const INDEX_BUILDERS = new Set(['index', 'uniqueIndex', 'unique']);
const KEY_BUILDERS = new Set(['primaryKey', 'foreignKey']);

function importedName(sourceCode, callee) {
  if (callee.type !== 'Identifier') {
    return undefined;
  }
  const binding = libraryBinding(variableOf(sourceCode, callee), DRIZZLE);
  return binding === undefined ? undefined : (binding.name ?? callee.name);
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

function methodName(call) {
  return call.callee.type === 'MemberExpression'
    ? staticKeyName(call.callee.property, call.callee.computed)
    : undefined;
}

function columnsOf(nodes, table) {
  return nodes.map((node) =>
    node?.type === 'MemberExpression' &&
    node.object.type === 'Identifier' &&
    node.object.name === table
      ? staticKeyName(node.property, node.computed)
      : undefined,
  );
}

function listedColumns(sourceCode, call, table) {
  const options = propertiesOf(sourceCode, objectOf(sourceCode, call.arguments[0])).get('columns');
  const listed = valueOf(sourceCode, options?.value);
  return listed?.type === 'ArrayExpression'
    ? columnsOf(listed.elements, table)
    : columnsOf(call.arguments, table);
}

function builderFacts(sourceCode, expression, table) {
  const [first, ...rest] = chainOf(expression);
  const builder = first === undefined ? undefined : importedName(sourceCode, first.callee);
  if (INDEX_BUILDERS.has(builder)) {
    const on = rest.find((call) => methodName(call) === 'on');
    const using = rest.find((call) => methodName(call) === 'using');
    const columns = columnsOf(on?.arguments ?? using?.arguments.slice(1) ?? [], table);
    return { indexes: [columns], foreignKeys: [] };
  }
  if (!KEY_BUILDERS.has(builder)) {
    return { indexes: [], foreignKeys: [] };
  }
  const columns = listedColumns(sourceCode, first, table);
  return builder === 'primaryKey'
    ? { indexes: [columns], foreignKeys: [] }
    : { indexes: [], foreignKeys: [{ node: first, columns }] };
}

function extraEntries(sourceCode, config) {
  const callback = valueOf(sourceCode, config);
  const [parameter] = callback?.params ?? [];
  if (callback?.type !== 'ArrowFunctionExpression' || parameter?.type !== 'Identifier') {
    return [];
  }
  const { body } = callback;
  const entries = body.type === 'ArrayExpression' ? body.elements : [];
  const values =
    body.type === 'ObjectExpression' ? [...propertiesOf(sourceCode, body).values()] : [];
  return [...entries, ...values.map((property) => property.value)].map((node) =>
    builderFacts(sourceCode, node, parameter.name),
  );
}

function columnFacts(sourceCode, columns) {
  return [...propertiesOf(sourceCode, objectOf(sourceCode, columns))].flatMap(
    ([name, property]) => {
      const methods = chainOf(property.value).map((call) => methodName(call));
      const references = chainOf(property.value).find((call) => methodName(call) === 'references');
      if (methods.some((method) => KEYED_COLUMN.has(method))) {
        return [{ indexes: [[name]], foreignKeys: [] }];
      }
      return references === undefined
        ? []
        : [{ indexes: [], foreignKeys: [{ node: references, columns: [name] }] }];
    },
  );
}

function isLeadingCover(index, columns) {
  const lead = index.slice(0, columns.length);
  return columns.every((column) => lead.includes(column));
}

export function unindexedTableKeys(sourceCode, call) {
  if (!TABLES.has(importedName(sourceCode, call.callee))) {
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
