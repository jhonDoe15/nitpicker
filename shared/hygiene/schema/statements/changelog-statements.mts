import { sqlSchema } from './sql-statements.mts';
import { appendAll } from '../../../lists/lists.mts';
import {
  fieldOf,
  fieldsOf,
  listOf,
  objectOf,
  optionalText,
  textOf,
} from '../../../values/readers.mts';
import type { ParseYaml } from '../../check-types.mts';
import type { IndexFact, SchemaFacts } from '../schema-types.mts';

type Attributes = Readonly<Record<string, string>>;
type TagInfo = { readonly attributes: Attributes; readonly at: number };
type State = {
  table: string | undefined;
  column: string | undefined;
  index: IndexFact | undefined;
};
type TagHandler = (state: State, tag: TagInfo, schema: SchemaFacts) => void;
type Span = { readonly start: number; end?: number };
type YamlContext = {
  readonly schema: SchemaFacts;
  readonly text: string;
  readonly cursor: { at: number };
};
type YamlColumn = { readonly name: string; readonly constraints: unknown };

const BLANKED = /<!--[\s\S]*?-->|<rollback\b[\s\S]*?<\/rollback>/gu;
const TAG = /<(\/?)([\w:.-]+)((?:[\s/][^<>]*)?)>/gu;
const ATTRIBUTE = /([\w:.-]+)\s*=\s*"([^"]*)"/gu;
const SQL_BLOCK = /<sql\b([^<>]*)>([\s\S]*?)<\/sql>/gu;
const CHANGE_SET = /<(\/?)(?:[\w.-]+:)?changeSet\b([^<>]*)>/gu;
const POSTGRES_NAMES = new Set(['postgresql', 'all']);
const TRUE = 'true';
const TABLE_NAME = 'tableName';
const CREATE_TABLE = 'createTable';
const ADD_COLUMN = 'addColumn';
const CREATE_INDEX = 'createIndex';
const LIST = /\s*,\s*/u;

function blank(text: string): string {
  return text.replace(/[^\n]/gu, ' ');
}

function attributesOf(text: string): Attributes {
  return Object.fromEntries(
    [...text.matchAll(ATTRIBUTE)].map(([, key, value]): [string, string] => [
      key ?? '',
      value ?? '',
    ]),
  );
}

function namesIn(text: string | undefined): string[] {
  return (text ?? '')
    .split(LIST)
    .map((name) => name.toLowerCase())
    .filter(Boolean);
}

function local(name: string): string {
  return name.split(':').at(-1) ?? name;
}

function columnConstraints(state: State, { attributes, at }: TagInfo, schema: SchemaFacts): void {
  if (state.table === undefined || state.column === undefined) {
    return;
  }
  if (attributes['primaryKey'] === TRUE || attributes['unique'] === TRUE) {
    schema.indexes.push({ table: state.table, columns: [state.column] });
  }
  if (
    attributes['references'] ??
    attributes['referencedTableName'] ??
    attributes['foreignKeyName']
  ) {
    schema.foreignKeys.push({ table: state.table, columns: [state.column], at });
  }
}

function tableTag(state: State, { attributes }: TagInfo): void {
  Object.assign(state, {
    table: attributes[TABLE_NAME]?.toLowerCase(),
    column: undefined,
    index: undefined,
  });
}

function indexTag(state: State, { attributes }: TagInfo, schema: SchemaFacts): void {
  const index: IndexFact = {
    table: attributes[TABLE_NAME]?.toLowerCase(),
    columns: [],
  };
  state.index = index;
  schema.indexes.push(index);
}

function columnTag(state: State, { attributes }: TagInfo): void {
  state.column = attributes['name']?.toLowerCase();
  state.index?.columns.push(state.column);
}

function foreignKeyTag(_state: State, { attributes, at }: TagInfo, schema: SchemaFacts): void {
  const columns = namesIn(attributes['baseColumnNames']);
  schema.foreignKeys.push({ table: attributes['baseTableName']?.toLowerCase(), columns, at });
}

function keyTag(_state: State, { attributes }: TagInfo, schema: SchemaFacts): void {
  schema.indexes.push({
    table: attributes[TABLE_NAME]?.toLowerCase(),
    columns: namesIn(attributes['columnNames']),
  });
}

const OPEN_TAGS = new Map<string, TagHandler>([
  [CREATE_TABLE, tableTag],
  [ADD_COLUMN, tableTag],
  [CREATE_INDEX, indexTag],
  ['column', columnTag],
  ['constraints', columnConstraints],
  ['addForeignKeyConstraint', foreignKeyTag],
  ['addUniqueConstraint', keyTag],
  ['addPrimaryKey', keyTag],
]);

function appliesToPostgres(dbms: string | undefined): boolean {
  const listed = namesIn(dbms);
  return (
    dbms === undefined ||
    listed.some(
      (name) => POSTGRES_NAMES.has(name) || (name.startsWith('!') && name !== '!postgresql'),
    )
  );
}

function otherDatabaseSpans(text: string): Span[] {
  const spans: { start: number; end?: number }[] = [];
  for (const match of text.matchAll(CHANGE_SET)) {
    const open = match[1] !== '/';
    const last = spans.at(-1);
    if (open && !appliesToPostgres(attributesOf(match[2] ?? '')['dbms'])) {
      spans.push({ start: match.index });
    } else if (!open && last !== undefined && last.end === undefined) {
      last.end = match.index;
    }
  }
  return spans;
}

function withoutOtherDatabases(text: string): string {
  return otherDatabaseSpans(text).reduceRight(
    (current, { start, end = text.length }) =>
      current.slice(0, start) + blank(current.slice(start, end)) + current.slice(end),
    text,
  );
}

function closeTag(state: State, name: string): void {
  if (name === CREATE_INDEX) {
    state.index = undefined;
  } else if (name === CREATE_TABLE || name === ADD_COLUMN) {
    state.table = undefined;
  }
}

export function xmlSchema(raw: string): SchemaFacts {
  const text = withoutOtherDatabases(raw.replaceAll(BLANKED, blank));
  const schema: SchemaFacts = { foreignKeys: [], indexes: [] };
  const state: State = { table: undefined, column: undefined, index: undefined };
  for (const match of text.matchAll(TAG)) {
    const [, closing, tag = '', attributes = ''] = match;
    if (closing === '/') {
      closeTag(state, local(tag));
    } else {
      OPEN_TAGS.get(local(tag))?.(
        state,
        { attributes: attributesOf(attributes), at: match.index },
        schema,
      );
    }
  }
  const blocks = [...text.matchAll(SQL_BLOCK)].filter((block) =>
    appliesToPostgres(attributesOf(block[1] ?? '')['dbms']),
  );
  for (const block of blocks) {
    const sql = sqlSchema(block[2] ?? '', block.index + block[0].indexOf('>') + 1);
    appendAll(schema.foreignKeys, sql.foreignKeys);
    appendAll(schema.indexes, sql.indexes);
  }
  return schema;
}

function columnsOf(value: unknown): YamlColumn[] {
  return listOf(value).flatMap((entry) => {
    const column = fieldOf(entry, 'column');
    const name = fieldOf(column, 'name');
    return typeof name === 'string' ? [{ name, constraints: fieldOf(column, 'constraints') }] : [];
  });
}

function lowered(value: unknown): string | undefined {
  return typeof value === 'string' ? value.toLowerCase() : undefined;
}

function locate({ text, cursor }: YamlContext, name: string): number {
  const found = text.indexOf(name, cursor.at);
  cursor.at = found < 0 ? cursor.at : found + 1;
  return found < 0 ? cursor.at : found;
}

function yamlColumns(change: unknown, context: YamlContext): void {
  const table = lowered(fieldOf(change, TABLE_NAME));
  for (const column of columnsOf(fieldOf(change, 'columns'))) {
    const constraints = column.constraints ?? {};
    const columns = [column.name.toLowerCase()];
    if (fieldOf(constraints, 'primaryKey') === true || fieldOf(constraints, 'unique') === true) {
      context.schema.indexes.push({ table, columns });
    }
    const referenced =
      fieldOf(constraints, 'references') ??
      fieldOf(constraints, 'referencedTableName') ??
      fieldOf(constraints, 'foreignKeyName');
    if (referenced) {
      context.schema.foreignKeys.push({ table, columns, at: locate(context, column.name) });
    }
  }
}

function yamlIndex(change: unknown, { schema }: YamlContext): void {
  const columns = columnsOf(fieldOf(change, 'columns')).map((column) => column.name.toLowerCase());
  schema.indexes.push({ table: lowered(fieldOf(change, TABLE_NAME)), columns });
}

function yamlForeignKey(change: unknown, context: YamlContext): void {
  const listed = textOf(fieldOf(change, 'baseColumnNames') ?? '');
  const table = lowered(fieldOf(change, 'baseTableName'));
  context.schema.foreignKeys.push({ table, columns: namesIn(listed), at: locate(context, listed) });
}

function yamlKey(change: unknown, { schema }: YamlContext): void {
  const columns = namesIn(textOf(fieldOf(change, 'columnNames') ?? ''));
  schema.indexes.push({ table: lowered(fieldOf(change, TABLE_NAME)), columns });
}

function yamlSql(change: unknown, context: YamlContext): void {
  const sql = sqlSchema(textOf(fieldOf(change, 'sql') ?? ''));
  const at = locate(context, 'sql');
  appendAll(context.schema.indexes, sql.indexes);
  appendAll(
    context.schema.foreignKeys,
    sql.foreignKeys.map((foreignKey) => ({ ...foreignKey, at })),
  );
}

const YAML_CHANGES = new Map<string, (change: unknown, context: YamlContext) => void>([
  [CREATE_TABLE, yamlColumns],
  [ADD_COLUMN, yamlColumns],
  [CREATE_INDEX, yamlIndex],
  ['addForeignKeyConstraint', yamlForeignKey],
  ['addUniqueConstraint', yamlKey],
  ['addPrimaryKey', yamlKey],
  ['sql', yamlSql],
]);

function parsedDocuments(text: string, parseYaml: ParseYaml | undefined): unknown[] {
  return parseYaml === undefined ? [] : parseYaml(text);
}

function isChecked(value: unknown): boolean {
  return objectOf(value) !== undefined && appliesToPostgres(optionalText(fieldOf(value, 'dbms')));
}

function childEntries(node: unknown): [string, unknown][] {
  if (Array.isArray(node)) {
    return listOf(node).map((value): [string, unknown] => ['', value]);
  }
  return objectOf(node) === undefined
    ? []
    : Object.entries(fieldsOf(node)).filter(([key]) => key !== 'rollback');
}

export function yamlSchema(text: string, parseYaml?: ParseYaml): SchemaFacts {
  const schema: SchemaFacts = { foreignKeys: [], indexes: [] };
  const context: YamlContext = { schema, text, cursor: { at: 0 } };
  const pending = parsedDocuments(text, parseYaml);
  for (const node of pending) {
    for (const [key, value] of childEntries(node).filter((entry) => isChecked(entry[1]))) {
      YAML_CHANGES.get(key)?.(value, context);
      pending.push(value);
    }
  }
  return schema;
}
