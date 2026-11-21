import { commaParts } from './comma-parts.mts';
import type { SchemaFacts } from '../schema-types.mts';

type Token = { readonly value: string; readonly string: boolean; readonly at: number };
type Call = {
  readonly positional: Token[][];
  readonly keywords: Readonly<Record<string, Token[]>>;
};
type FactArguments = {
  readonly table: string | undefined;
  readonly part: readonly Token[];
  readonly call: Call;
  readonly schema: SchemaFacts;
};
type Operation = Call & {
  readonly batch: boolean;
  readonly batchTable: string | undefined;
  readonly at: number;
  readonly schema: SchemaFacts;
};

const TOKEN =
  /\s+|#[^\n]*|[rRbBuUfF]{0,2}(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|[\w.]+|[^\s\w.]/gu;
const STRING = /^[rRbBuUfF]{0,2}(["'])/u;
const QUOTES = /^[rRbBuUfF]{0,2}(?:"""|'''|"|')|(?:"""|'''|"|')$/gu;
const SKIPPED = /^(?:\s|#)/u;
const DEPTH: Readonly<Record<string, number>> = {
  '(': 1,
  '[': 1,
  '{': 1,
  ')': -1,
  ']': -1,
  '}': -1,
};
const BATCH = 'batch_alter_table';
const OPS = new Set(['op', 'batch_op']);

function tokensOf(text: string): Token[] {
  return [...text.matchAll(TOKEN)]
    .filter(([value]) => !SKIPPED.test(value))
    .map((match) => {
      const [value] = match;
      const string = STRING.test(value);
      return { value: string ? value.replaceAll(QUOTES, '') : value, string, at: match.index };
    });
}

function closing(tokens: readonly Token[], open: number): number {
  let depth = 0;
  for (const [offset, token] of tokens.slice(open).entries()) {
    depth += token.string ? 0 : (DEPTH[token.value] ?? 0);
    if (depth === 0) {
      return open + offset;
    }
  }
  return tokens.length;
}

function closeLast(ends: Map<number, number>, opened: number[], index: number): void {
  const start = opened.pop();
  if (start !== undefined) {
    ends.set(start, index);
  }
}

function closings(tokens: readonly Token[]): Map<number, number> {
  const ends = new Map<number, number>();
  const opened: number[] = [];
  for (const [index, token] of tokens.entries()) {
    const step = token.string ? 0 : (DEPTH[token.value] ?? 0);
    if (step > 0) {
      opened.push(index);
    } else if (step < 0 && opened.length > 0) {
      closeLast(ends, opened, index);
    }
  }
  return ends;
}

function partsOf(tokens: readonly Token[]): Token[][] {
  return commaParts(tokens, {
    step: (token) => (token.string ? 0 : (DEPTH[token.value] ?? 0)),
    isComma: (token) => !token.string && token.value === ',',
  });
}

function isNamed(part: readonly Token[]): boolean {
  return part[1]?.value === '=' && part[0]?.string === false && part[2]?.value !== '=';
}

function argumentsOf(
  tokens: readonly Token[],
  open: number,
  ends?: ReadonlyMap<number, number>,
): Call {
  const close = ends === undefined ? closing(tokens, open) : (ends.get(open) ?? tokens.length);
  const parts = partsOf(tokens.slice(open + 1, close));
  return {
    positional: parts.filter((part) => !isNamed(part)),
    keywords: Object.fromEntries(
      parts.filter(isNamed).map((part): [string, Token[]] => [part[0]?.value ?? '', part.slice(2)]),
    ),
  };
}

function strings(part: readonly Token[] | undefined): string[] {
  return (part ?? []).filter((token) => token.string).map((token) => token.value.toLowerCase());
}

function isTrue(part: readonly Token[] | undefined): boolean {
  return part?.length === 1 && part[0]?.value === 'True';
}

function calledAt(tokens: readonly Token[], index: number): string | undefined {
  const token = tokens[index];
  return token !== undefined && !token.string && tokens[index + 1]?.value === '('
    ? token.value
    : undefined;
}

function columnCall({ table, part, call, schema }: FactArguments): void {
  const [column] = strings(call.positional[0]);
  if (column === undefined) {
    return;
  }
  const foreignKey = part.find((token) => token.value.split('.').at(-1) === 'ForeignKey');
  if (foreignKey !== undefined) {
    schema.foreignKeys.push({ table, columns: [column], at: foreignKey.at });
  }
  if (['index', 'primary_key', 'unique'].some((name) => isTrue(call.keywords[name]))) {
    schema.indexes.push({ table, columns: [column] });
  }
}

function foreignKeyConstraint({ table, part, call, schema }: FactArguments): void {
  schema.foreignKeys.push({ table, columns: strings(call.positional[0]), at: part[0]?.at ?? 0 });
}

function keyConstraint({ table, call, schema }: FactArguments): void {
  schema.indexes.push({ table, columns: call.positional.flatMap(strings) });
}

function indexCall({ table, call, schema }: FactArguments): void {
  schema.indexes.push({ table, columns: call.positional.slice(1).flatMap(strings) });
}

const COLUMN_FACTS = new Map<string, (facts: FactArguments) => void>([
  ['Column', columnCall],
  ['ForeignKeyConstraint', foreignKeyConstraint],
  ['PrimaryKeyConstraint', keyConstraint],
  ['UniqueConstraint', keyConstraint],
  ['Index', indexCall],
]);

function columnFacts(table: string | undefined, part: readonly Token[], schema: SchemaFacts): void {
  const open = part.findIndex((token) => token.value === '(');
  const called = part[open - 1]?.value.split('.').at(-1);
  const facts = open < 0 || called === undefined ? undefined : COLUMN_FACTS.get(called);
  facts?.({ table, part, call: argumentsOf(part, open), schema });
}

function argument(operation: Operation, keyword: string, index: number): Token[] | undefined {
  return operation.keywords[keyword] ?? operation.positional[operation.batch ? index : index + 1];
}

function namedTable(operation: Operation, keyword: string): string | undefined {
  return operation.batch
    ? operation.batchTable
    : strings(operation.keywords[keyword] ?? operation.positional[1])[0];
}

function tableColumns(operation: Operation): void {
  const { batch, positional, keywords, schema } = operation;
  const table = batch ? operation.batchTable : strings(keywords['table_name'] ?? positional[0])[0];
  for (const part of batch ? positional : positional.slice(1)) {
    columnFacts(table, part, schema);
  }
}

function createIndex(operation: Operation): void {
  operation.schema.indexes.push({
    table: namedTable(operation, 'table_name'),
    columns: strings(argument(operation, 'columns', 1)),
  });
}

function createForeignKey(operation: Operation): void {
  operation.schema.foreignKeys.push({
    table: namedTable(operation, 'source_table'),
    columns: strings(argument(operation, 'local_cols', 2)),
    at: operation.at,
  });
}

const OPERATIONS = new Map<string, (operation: Operation) => void>([
  ['create_table', tableColumns],
  ['add_column', tableColumns],
  ['create_index', createIndex],
  ['create_unique_constraint', createIndex],
  ['create_primary_key', createIndex],
  ['create_foreign_key', createForeignKey],
]);

type SchemaScan = {
  readonly tokens: readonly Token[];
  readonly ends: Map<number, number>;
  readonly batches: (string | undefined)[];
  readonly schema: SchemaFacts;
};

function scanCall(scan: SchemaScan, index: number): void {
  const { tokens, ends, batches, schema } = scan;
  const [owner, name] = calledAt(tokens, index)?.split('.') ?? [];
  if (name === BATCH) {
    batches.push(strings(argumentsOf(tokens, index + 1, ends).positional[0])[0]);
  } else if (owner !== undefined && OPS.has(owner)) {
    const call = argumentsOf(tokens, index + 1, ends);
    const operation = name === undefined ? undefined : OPERATIONS.get(name);
    operation?.({
      ...call,
      batch: owner === 'batch_op',
      batchTable: batches.at(-1),
      at: tokens[index]?.at ?? 0,
      schema,
    });
  }
}

export function alembicSchema(text: string): SchemaFacts {
  const tokens = tokensOf(text);
  const schema: SchemaFacts = { foreignKeys: [], indexes: [] };
  const scan = { tokens, ends: closings(tokens), batches: [], schema };
  for (const index of tokens.keys()) {
    scanCall(scan, index);
  }
  return schema;
}
