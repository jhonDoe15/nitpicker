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

function argumentsOf(tokens, open) {
  const parts = partsOf(tokens.slice(open + 1, closing(tokens, open)));
  const named = (part) => part[1]?.value === '=' && !part[0].string && part[2]?.value !== '=';
  return {
    positional: parts.filter((part) => !named(part)),
    keywords: Object.fromEntries(parts.filter(named).map((part) => [part[0].value, part.slice(2)])),
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

function columnFacts(table, part, schema) {
  const open = part.findIndex((token) => token.value === '(');
  const callee = part[open - 1]?.value.split('.').at(-1);
  if (open < 0) {
    return;
  }
  const { positional, keywords } = argumentsOf(part, open);
  if (callee === 'Column') {
    const [column] = strings(positional[0]);
    const foreignKey = part.find((token) => token.value.split('.').at(-1) === 'ForeignKey');
    if (column !== undefined && foreignKey !== undefined) {
      schema.foreignKeys.push({ table, columns: [column], at: foreignKey.at });
    }
    if (['index', 'primary_key', 'unique'].some((name) => isTrue(keywords[name]))) {
      schema.indexes.push({ table, columns: [column] });
    }
  } else if (callee === 'ForeignKeyConstraint') {
    schema.foreignKeys.push({ table, columns: strings(positional[0]), at: part[0].at });
  } else if (callee === 'PrimaryKeyConstraint' || callee === 'UniqueConstraint') {
    schema.indexes.push({ table, columns: positional.flatMap(strings) });
  } else if (callee === 'Index') {
    schema.indexes.push({ table, columns: positional.slice(1).flatMap(strings) });
  }
}

function tableOf(owner, positional, keywords, batches) {
  return owner === 'batch_op' ? batches.at(-1) : strings(keywords.table_name ?? positional[0])[0];
}

function operation({ owner, name, call }, schema, batches) {
  const { positional, keywords } = call;
  const batch = owner === 'batch_op';
  const rest = batch ? positional : positional.slice(1);
  const table = tableOf(owner, positional, keywords, batches);
  if (name === 'create_table' || name === 'add_column') {
    for (const part of rest) {
      columnFacts(table, part, schema);
    }
  } else if (name === 'create_index') {
    const own = batch ? positional[1] : positional[2];
    const columns = strings(keywords.columns ?? own);
    schema.indexes.push({
      table: batch ? table : strings(keywords.table_name ?? positional[1])[0],
      columns,
    });
  } else if (name === 'create_foreign_key') {
    const source = batch ? table : strings(keywords.source_table ?? positional[1])[0];
    const local = strings(keywords.local_cols ?? (batch ? positional[2] : positional[3]));
    schema.foreignKeys.push({ table: source, columns: local, at: call.at });
  } else if (name === 'create_unique_constraint' || name === 'create_primary_key') {
    const owned = batch ? table : strings(keywords.table_name ?? positional[1])[0];
    schema.indexes.push({
      table: owned,
      columns: strings(keywords.columns ?? (batch ? positional[1] : positional[2])),
    });
  }
}

export function alembicSchema(text) {
  const tokens = tokensOf(text);
  const schema = { foreignKeys: [], indexes: [] };
  const batches = [];
  for (const index of tokens.keys()) {
    const called = calledAt(tokens, index);
    const [owner, name] = called?.split('.') ?? [];
    if (name === BATCH) {
      batches.push(strings(argumentsOf(tokens, index + 1).positional[0])[0]);
    } else if (OPS.has(owner) && name !== undefined) {
      const call = { ...argumentsOf(tokens, index + 1), at: tokens[index].at };
      operation({ owner, name, call }, schema, batches);
    }
  }
  return schema;
}
