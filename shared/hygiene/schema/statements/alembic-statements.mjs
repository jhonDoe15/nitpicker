const TOKEN =
  /\s+|#[^\n]*|[rRbBuUfF]{0,2}(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|[\w.]+|[^\s\w.]/gu;
const STRING = /^[rRbBuUfF]{0,2}(["'])/u;
const QUOTES = /^[rRbBuUfF]{0,2}(?:"""|'''|"|')|(?:"""|'''|"|')$/gu;
const SKIPPED = /^(?:\s|#)/u;
const DEPTH = { '(': 1, '[': 1, '{': 1, ')': -1, ']': -1, '}': -1 };
const BATCH = 'batch_alter_table';
const OPS = new Set(['op', 'batch_op']);

function tokensOf(text) {
  return [...text.matchAll(TOKEN)]
    .filter(([value]) => !SKIPPED.test(value))
    .map((match) => {
      const [value] = match;
      const string = STRING.test(value);
      return { value: string ? value.replaceAll(QUOTES, '') : value, string, at: match.index };
    });
}

function closing(tokens, open) {
  let depth = 0;
  for (const [offset, token] of tokens.slice(open).entries()) {
    depth += token.string ? 0 : (DEPTH[token.value] ?? 0);
    if (depth === 0) {
      return open + offset;
    }
  }
  return tokens.length;
}

function closings(tokens) {
  const ends = new Map();
  const opened = [];
  for (const [index, token] of tokens.entries()) {
    const step = token.string ? 0 : (DEPTH[token.value] ?? 0);
    if (step > 0) {
      opened.push(index);
    } else if (step < 0 && opened.length > 0) {
      ends.set(opened.pop(), index);
    }
  }
  return ends;
}

function partsOf(tokens) {
  const parts = [[]];
  let depth = 0;
  for (const token of tokens) {
    depth += token.string ? 0 : (DEPTH[token.value] ?? 0);
    if (!token.string && token.value === ',' && depth === 0) {
      parts.push([]);
    } else {
      parts.at(-1).push(token);
    }
  }
  return parts.filter((part) => part.length > 0);
}

function isNamed(part) {
  return part[1]?.value === '=' && !part[0].string && part[2]?.value !== '=';
}

function argumentsOf(tokens, open, ends) {
  const close = ends === undefined ? closing(tokens, open) : (ends.get(open) ?? tokens.length);
  const parts = partsOf(tokens.slice(open + 1, close));
  return {
    positional: parts.filter((part) => !isNamed(part)),
    keywords: Object.fromEntries(
      parts.filter(isNamed).map((part) => [part[0].value, part.slice(2)]),
    ),
  };
}

function strings(part) {
  return (part ?? []).filter((token) => token.string).map((token) => token.value.toLowerCase());
}

function isTrue(part) {
  return part?.length === 1 && part[0].value === 'True';
}

function calledAt(tokens, index) {
  const token = tokens[index];
  return !token.string && tokens[index + 1]?.value === '(' ? token.value : undefined;
}

function columnCall({ table, part, call, schema }) {
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

function foreignKeyConstraint({ table, part, call, schema }) {
  schema.foreignKeys.push({ table, columns: strings(call.positional[0]), at: part[0].at });
}

function keyConstraint({ table, call, schema }) {
  schema.indexes.push({ table, columns: call.positional.flatMap(strings) });
}

function indexCall({ table, call, schema }) {
  schema.indexes.push({ table, columns: call.positional.slice(1).flatMap(strings) });
}

const COLUMN_FACTS = new Map([
  ['Column', columnCall],
  ['ForeignKeyConstraint', foreignKeyConstraint],
  ['PrimaryKeyConstraint', keyConstraint],
  ['UniqueConstraint', keyConstraint],
  ['Index', indexCall],
]);

function columnFacts(table, part, schema) {
  const open = part.findIndex((token) => token.value === '(');
  const facts = open < 0 ? undefined : COLUMN_FACTS.get(part[open - 1]?.value.split('.').at(-1));
  facts?.({ table, part, call: argumentsOf(part, open), schema });
}

function argument(operation, keyword, index) {
  return operation.keywords[keyword] ?? operation.positional[operation.batch ? index : index + 1];
}

function namedTable(operation, keyword) {
  return operation.batch
    ? operation.batchTable
    : strings(operation.keywords[keyword] ?? operation.positional[1])[0];
}

function tableColumns(operation) {
  const { batch, positional, keywords, schema } = operation;
  const table = batch ? operation.batchTable : strings(keywords.table_name ?? positional[0])[0];
  for (const part of batch ? positional : positional.slice(1)) {
    columnFacts(table, part, schema);
  }
}

function createIndex(operation) {
  operation.schema.indexes.push({
    table: namedTable(operation, 'table_name'),
    columns: strings(argument(operation, 'columns', 1)),
  });
}

function createForeignKey(operation) {
  operation.schema.foreignKeys.push({
    table: namedTable(operation, 'source_table'),
    columns: strings(argument(operation, 'local_cols', 2)),
    at: operation.at,
  });
}

const OPERATIONS = new Map([
  ['create_table', tableColumns],
  ['add_column', tableColumns],
  ['create_index', createIndex],
  ['create_unique_constraint', createIndex],
  ['create_primary_key', createIndex],
  ['create_foreign_key', createForeignKey],
]);

export function alembicSchema(text) {
  const tokens = tokensOf(text);
  const schema = { foreignKeys: [], indexes: [] };
  const batches = [];
  const ends = closings(tokens);
  for (const index of tokens.keys()) {
    const called = calledAt(tokens, index);
    const [owner, name] = called?.split('.') ?? [];
    if (name === BATCH) {
      batches.push(strings(argumentsOf(tokens, index + 1, ends).positional[0])[0]);
    } else if (OPS.has(owner)) {
      const batch = owner === 'batch_op';
      const call = argumentsOf(tokens, index + 1, ends);
      const at = tokens[index].at;
      OPERATIONS.get(name)?.({ ...call, batch, batchTable: batches.at(-1), at, schema });
    }
  }
  return schema;
}
