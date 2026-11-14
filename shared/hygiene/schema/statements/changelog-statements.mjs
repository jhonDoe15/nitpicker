import { sqlSchema } from './sql-statements.mjs';

const BLANKED = /<!--[\s\S]*?-->|<rollback\b[\s\S]*?<\/rollback>/gu;
const TAG = /<(\/?)([\w:.-]+)((?:[\s/][^<>]*)?)>/gu;
const ATTRIBUTE = /([\w:.-]+)\s*=\s*"([^"]*)"/gu;
const SQL_BLOCK = /<sql\b([^<>]*)>([\s\S]*?)<\/sql>/gu;
const CHANGE_SET = /<(\/?)(?:[\w.-]+:)?changeSet\b([^<>]*)>/gu;
const POSTGRES_NAMES = new Set(['postgresql', 'all']);
const TRUE = 'true';
const LIST = /\s*,\s*/u;

function blank(text) {
  return text.replace(/[^\n]/gu, ' ');
}

function attributesOf(text) {
  return Object.fromEntries([...text.matchAll(ATTRIBUTE)].map(([, key, value]) => [key, value]));
}

function namesIn(text) {
  return (text ?? '')
    .split(LIST)
    .map((name) => name.toLowerCase())
    .filter(Boolean);
}

function local(name) {
  return name.split(':').at(-1);
}

function columnConstraints(state, { attributes, at }, schema) {
  if (state.table === undefined || state.column === undefined) {
    return;
  }
  if (attributes.primaryKey === TRUE || attributes.unique === TRUE) {
    schema.indexes.push({ table: state.table, columns: [state.column] });
  }
  if (attributes.references ?? attributes.referencedTableName ?? attributes.foreignKeyName) {
    schema.foreignKeys.push({ table: state.table, columns: [state.column], at });
  }
}

function tableTag(state, { attributes }) {
  Object.assign(state, {
    table: attributes.tableName?.toLowerCase(),
    column: undefined,
    index: undefined,
  });
}

function indexTag(state, { attributes }, schema) {
  state.index = { table: attributes.tableName?.toLowerCase(), columns: [] };
  schema.indexes.push(state.index);
}

function columnTag(state, { attributes }) {
  state.column = attributes.name?.toLowerCase();
  state.index?.columns.push(state.column);
}

function foreignKeyTag(_state, { attributes, at }, schema) {
  const columns = namesIn(attributes.baseColumnNames);
  schema.foreignKeys.push({ table: attributes.baseTableName?.toLowerCase(), columns, at });
}

function keyTag(_state, { attributes }, schema) {
  schema.indexes.push({
    table: attributes.tableName?.toLowerCase(),
    columns: namesIn(attributes.columnNames),
  });
}

const OPEN_TAGS = new Map([
  ['createTable', tableTag],
  ['addColumn', tableTag],
  ['createIndex', indexTag],
  ['column', columnTag],
  ['constraints', columnConstraints],
  ['addForeignKeyConstraint', foreignKeyTag],
  ['addUniqueConstraint', keyTag],
  ['addPrimaryKey', keyTag],
]);

function appliesToPostgres(dbms) {
  const listed = namesIn(dbms);
  return (
    dbms === undefined ||
    listed.some(
      (name) => POSTGRES_NAMES.has(name) || (name.startsWith('!') && name !== '!postgresql'),
    )
  );
}

function otherDatabaseSpans(text) {
  const spans = [];
  for (const match of text.matchAll(CHANGE_SET)) {
    const open = match[1] !== '/';
    if (open && !appliesToPostgres(attributesOf(match[2]).dbms)) {
      spans.push({ start: match.index });
    } else if (!open && spans.length > 0 && spans.at(-1).end === undefined) {
      spans.at(-1).end = match.index;
    }
  }
  return spans;
}

function withoutOtherDatabases(text) {
  return otherDatabaseSpans(text).reduceRight(
    (current, { start, end = text.length }) =>
      current.slice(0, start) + blank(current.slice(start, end)) + current.slice(end),
    text,
  );
}

function closeTag(state, name) {
  if (name === 'createIndex') {
    state.index = undefined;
  } else if (name === 'createTable' || name === 'addColumn') {
    state.table = undefined;
  }
}

export function xmlSchema(raw) {
  const text = withoutOtherDatabases(raw.replaceAll(BLANKED, blank));
  const schema = { foreignKeys: [], indexes: [] };
  const state = {};
  for (const [, closing, tag, attributes, at] of [...text.matchAll(TAG)].map((match) => [
    ...match,
    match.index,
  ])) {
    if (closing === '/') {
      closeTag(state, local(tag));
    } else {
      OPEN_TAGS.get(local(tag))?.(state, { attributes: attributesOf(attributes), at }, schema);
    }
  }
  const blocks = [...text.matchAll(SQL_BLOCK)].filter((block) =>
    appliesToPostgres(attributesOf(block[1]).dbms),
  );
  for (const block of blocks) {
    const sql = sqlSchema(block[2], block.index + block[0].indexOf('>') + 1);
    schema.foreignKeys.push(...sql.foreignKeys);
    schema.indexes.push(...sql.indexes);
  }
  return schema;
}

function columnsOf(value) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => entry?.column)
    .filter((column) => typeof column?.name === 'string');
}

function locate({ text, cursor }, name) {
  const found = text.indexOf(name, cursor.at);
  cursor.at = found < 0 ? cursor.at : found + 1;
  return found < 0 ? cursor.at : found;
}

function yamlColumns(change, context) {
  const table = change.tableName?.toLowerCase();
  for (const column of columnsOf(change.columns)) {
    const constraints = column.constraints ?? {};
    const columns = [column.name.toLowerCase()];
    if (constraints.primaryKey === true || constraints.unique === true) {
      context.schema.indexes.push({ table, columns });
    }
    if (constraints.references ?? constraints.referencedTableName ?? constraints.foreignKeyName) {
      context.schema.foreignKeys.push({ table, columns, at: locate(context, column.name) });
    }
  }
}

function yamlIndex(change, { schema }) {
  const columns = columnsOf(change.columns).map((column) => column.name.toLowerCase());
  schema.indexes.push({ table: change.tableName?.toLowerCase(), columns });
}

function yamlForeignKey(change, context) {
  const listed = String(change.baseColumnNames ?? '');
  const table = change.baseTableName?.toLowerCase();
  context.schema.foreignKeys.push({ table, columns: namesIn(listed), at: locate(context, listed) });
}

function yamlKey(change, { schema }) {
  const columns = namesIn(String(change.columnNames ?? ''));
  schema.indexes.push({ table: change.tableName?.toLowerCase(), columns });
}

function yamlSql(change, context) {
  const sql = sqlSchema(String(change.sql ?? ''));
  const at = locate(context, 'sql');
  context.schema.indexes.push(...sql.indexes);
  context.schema.foreignKeys.push(...sql.foreignKeys.map((foreignKey) => ({ ...foreignKey, at })));
}

const YAML_CHANGES = new Map([
  ['createTable', yamlColumns],
  ['addColumn', yamlColumns],
  ['createIndex', yamlIndex],
  ['addForeignKeyConstraint', yamlForeignKey],
  ['addUniqueConstraint', yamlKey],
  ['addPrimaryKey', yamlKey],
  ['sql', yamlSql],
]);

function parsedDocuments(text, parseYaml) {
  return parseYaml === undefined ? [] : parseYaml(text);
}

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function isChecked(value) {
  return (
    isObject(value) && appliesToPostgres(typeof value.dbms === 'string' ? value.dbms : undefined)
  );
}

function childEntries(node) {
  if (Array.isArray(node)) {
    return node.map((value) => ['', value]);
  }
  return isObject(node) ? Object.entries(node).filter(([key]) => key !== 'rollback') : [];
}

export function yamlSchema(text, parseYaml) {
  const schema = { foreignKeys: [], indexes: [] };
  const context = { schema, text, cursor: { at: 0 } };
  const pending = parsedDocuments(text, parseYaml);
  for (const node of pending) {
    for (const [key, value] of childEntries(node).filter((entry) => isChecked(entry[1]))) {
      YAML_CHANGES.get(key)?.(value, context);
      pending.push(value);
    }
  }
  return schema;
}
