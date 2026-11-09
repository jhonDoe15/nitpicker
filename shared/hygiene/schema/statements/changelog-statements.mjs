import { parseAllDocuments } from 'yaml';
import { sqlSchema } from './sql-statements.mjs';

const BLANKED = /<!--[\s\S]*?-->|<rollback\b[\s\S]*?<\/rollback>/gu;
const TAG = /<(\/?)([\w:.-]+)([^<>]*)>/gu;
const ATTRIBUTE = /([\w:.-]+)\s*=\s*"([^"]*)"/gu;
const SQL_BLOCK = /<sql\b[^<>]*>([\s\S]*?)<\/sql>/gu;
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

function columnConstraints(state, attributes, at, schema) {
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

function openTag(state, { name, attributes, at }, schema) {
  const table = attributes.tableName?.toLowerCase();
  if (name === 'createTable' || name === 'addColumn') {
    Object.assign(state, { table, column: undefined, index: undefined });
  } else if (name === 'createIndex') {
    state.index = { table, columns: [] };
    schema.indexes.push(state.index);
  } else if (name === 'column') {
    state.column = attributes.name?.toLowerCase();
    state.index?.columns.push(state.column);
  } else if (name === 'constraints') {
    columnConstraints(state, attributes, at, schema);
  } else if (name === 'addForeignKeyConstraint') {
    const columns = namesIn(attributes.baseColumnNames);
    schema.foreignKeys.push({ table: attributes.baseTableName?.toLowerCase(), columns, at });
  } else if (name === 'addUniqueConstraint' || name === 'addPrimaryKey') {
    schema.indexes.push({ table, columns: namesIn(attributes.columnNames) });
  }
}

function closeTag(state, name) {
  if (name === 'createIndex') {
    state.index = undefined;
  } else if (name === 'createTable' || name === 'addColumn') {
    state.table = undefined;
  }
}

export function xmlSchema(raw) {
  const text = raw.replaceAll(BLANKED, blank);
  const schema = { foreignKeys: [], indexes: [] };
  const state = {};
  for (const [, closing, tag, attributes, at] of [...text.matchAll(TAG)].map((match) => [
    ...match,
    match.index,
  ])) {
    if (closing === '/') {
      closeTag(state, local(tag));
    } else {
      openTag(state, { name: local(tag), attributes: attributesOf(attributes), at }, schema);
    }
  }
  for (const block of text.matchAll(SQL_BLOCK)) {
    const sql = sqlSchema(block[1], block.index + block[0].indexOf('>') + 1);
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

function locate(text, cursor, name) {
  const found = text.indexOf(name, cursor.at);
  cursor.at = found < 0 ? cursor.at : found + 1;
  return found < 0 ? cursor.at : found;
}

function yamlChange(name, change, context) {
  const { schema, text, cursor } = context;
  const table = change.tableName?.toLowerCase();
  if (name === 'createTable' || name === 'addColumn') {
    for (const column of columnsOf(change.columns)) {
      const constraints = column.constraints ?? {};
      const columnName = column.name.toLowerCase();
      if (constraints.primaryKey === true || constraints.unique === true) {
        schema.indexes.push({ table, columns: [columnName] });
      }
      if (constraints.references ?? constraints.referencedTableName ?? constraints.foreignKeyName) {
        const at = locate(text, cursor, column.name);
        schema.foreignKeys.push({ table, columns: [columnName], at });
      }
    }
  } else if (name === 'createIndex') {
    schema.indexes.push({
      table,
      columns: columnsOf(change.columns).map((c) => c.name.toLowerCase()),
    });
  } else if (name === 'addForeignKeyConstraint') {
    const at = locate(text, cursor, String(change.baseColumnNames));
    const columns = namesIn(String(change.baseColumnNames ?? ''));
    schema.foreignKeys.push({ table: change.baseTableName?.toLowerCase(), columns, at });
  } else if (name === 'addUniqueConstraint' || name === 'addPrimaryKey') {
    schema.indexes.push({ table, columns: namesIn(String(change.columnNames ?? '')) });
  } else if (name === 'sql') {
    const sql = sqlSchema(typeof change === 'string' ? change : String(change.sql ?? ''));
    schema.indexes.push(...sql.indexes);
  }
}

function parsedDocuments(text) {
  try {
    return parseAllDocuments(text).map((document) => document.toJS());
  } catch {
    return [];
  }
}

export function yamlSchema(text) {
  const schema = { foreignKeys: [], indexes: [] };
  const context = { schema, text, cursor: { at: 0 } };
  const pending = parsedDocuments(text);
  for (const node of pending) {
    if (Array.isArray(node)) {
      pending.push(...node);
    } else if (node !== null && typeof node === 'object') {
      for (const [key, value] of Object.entries(node).filter(([name]) => name !== 'rollback')) {
        if (value !== null && typeof value === 'object') {
          yamlChange(key, value, context);
          pending.push(value);
        }
      }
    }
  }
  return schema;
}
