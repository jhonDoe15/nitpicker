const TOKEN =
  /\s+|--[^\n]*|\/\*[\s\S]*?\*\/|"(?:[^"]|"")*"|`[^`]*`|\[[^\]]*\]|'(?:[^']|'')*'|[\w$]+|[^\s\w$]/gu;
const SKIPPED = /^(?:\s|--|\/\*)/u;
const QUOTED = /^["`[]/u;
const TABLE_MODIFIERS = new Set([
  'or',
  'replace',
  'global',
  'local',
  'temporary',
  'temp',
  'unlogged',
]);
const INDEX_MODIFIERS = new Set(['unique', 'concurrently']);
const OPTIONAL = new Set(['if', 'not', 'exists', 'only']);
const KEYED = new Set(['primary', 'unique', 'index', 'key']);
const NAME_TOKENS = 5;

function tokensOf(text, offset) {
  return [...text.matchAll(TOKEN)]
    .filter(([value]) => !SKIPPED.test(value))
    .map((match) => {
      const [value] = match;
      const quoted = QUOTED.test(value);
      const plain = quoted ? value.slice(1, -1) : value;
      return { value: plain, word: plain.toLowerCase(), quoted, at: offset + match.index };
    });
}

function isWord(token, word) {
  return token !== undefined && !token.quoted && token.word === word;
}

function skipped(tokens, start, words) {
  const found = tokens.slice(start).findIndex((token) => token.quoted || !words.has(token.word));
  return found < 0 ? tokens.length : start + found;
}

function nameAt(tokens, start) {
  let next = start;
  let name;
  let done = false;
  for (const [offset, token] of tokens.slice(start, start + NAME_TOKENS).entries()) {
    if (!done && start + offset === next) {
      name = token;
      done = tokens[next + 1]?.value !== '.';
      next += done ? 1 : 2;
    }
  }
  return { name: name?.word, next: Math.max(next, start + 1) };
}

function closing(tokens, open) {
  let depth = 0;
  for (const [offset, token] of tokens.slice(open).entries()) {
    depth += { '(': 1, ')': -1 }[token.value] ?? 0;
    if (depth === 0) {
      return open + offset;
    }
  }
  return tokens.length;
}

function topLevelParts(tokens) {
  const parts = [[]];
  let depth = 0;
  for (const token of tokens) {
    depth += { '(': 1, ')': -1 }[token.value] ?? 0;
    if (token.value === ',' && depth === 0) {
      parts.push([]);
    } else {
      parts.at(-1).push(token);
    }
  }
  return parts.filter((part) => part.length > 0);
}

function columnList(tokens, open) {
  if (tokens[open]?.value !== '(') {
    return [];
  }
  return topLevelParts(tokens.slice(open + 1, closing(tokens, open))).map((part) =>
    part[1]?.value === '(' ? undefined : part[0].word,
  );
}

function afterConstraint(part) {
  return isWord(part[0], 'constraint') ? part.slice(2) : part;
}

function keyedColumns(part) {
  const open = part.findIndex((token) => token.value === '(');
  return open < 0 ? [] : columnList(part, open);
}

function definitionFacts(table, rawPart, schema) {
  const part = afterConstraint(rawPart);
  const [first] = part;
  if (first === undefined) {
    return;
  }
  if (isWord(first, 'foreign') && isWord(part[1], 'key')) {
    schema.foreignKeys.push({ table, columns: keyedColumns(part), at: first.at });
    return;
  }
  if (!first.quoted && KEYED.has(first.word)) {
    schema.indexes.push({ table, columns: keyedColumns(part) });
    return;
  }
  if (!first.quoted && ['check', 'exclude', 'like'].includes(first.word)) {
    return;
  }
  const rest = part.slice(1);
  const reference = rest.find((token) => isWord(token, 'references'));
  if (reference !== undefined) {
    schema.foreignKeys.push({ table, columns: [first.word], at: reference.at });
  }
  if (rest.some((token) => isWord(token, 'primary') || isWord(token, 'unique'))) {
    schema.indexes.push({ table, columns: [first.word] });
  }
}

function createTable(tokens, start, schema) {
  const { name, next } = nameAt(tokens, skipped(tokens, start, OPTIONAL));
  if (tokens[next]?.value !== '(') {
    return next;
  }
  const close = closing(tokens, next);
  for (const part of topLevelParts(tokens.slice(next + 1, close))) {
    definitionFacts(name, part, schema);
  }
  return close;
}

function alterTable(tokens, start, schema) {
  const { name, next } = nameAt(tokens, skipped(tokens, start, OPTIONAL));
  const end = tokens.findIndex((token, index) => index >= next && token.value === ';');
  const actions = topLevelParts(tokens.slice(next, end < 0 ? tokens.length : end));
  for (const action of actions.filter((part) => isWord(part[0], 'add'))) {
    const body = action.slice(1);
    const column = isWord(body[0], 'column') ? body.slice(skipped(body, 1, OPTIONAL)) : body;
    definitionFacts(name, column, schema);
  }
  return end < 0 ? tokens.length : end;
}

function createIndex(tokens, start, schema) {
  const at = skipped(tokens, skipped(tokens, start, INDEX_MODIFIERS), OPTIONAL);
  const on = tokens.findIndex((token, index) => index >= at && isWord(token, 'on'));
  if (on < 0 || on > at + 1) {
    return at;
  }
  const { name, next } = nameAt(tokens, skipped(tokens, on + 1, OPTIONAL));
  const open = isWord(tokens[next], 'using') ? next + 2 : next;
  schema.indexes.push({ table: name, columns: columnList(tokens, open) });
  return open;
}

function statementAt(tokens, index, schema) {
  const [first, second] = [tokens[index], tokens[index + 1]];
  if (isWord(first, 'alter') && isWord(second, 'table')) {
    return alterTable(tokens, index + 2, schema);
  }
  if (!isWord(first, 'create')) {
    return index;
  }
  const kind = skipped(tokens, index + 1, TABLE_MODIFIERS);
  if (isWord(tokens[kind], 'table')) {
    return createTable(tokens, kind + 1, schema);
  }
  const indexed = skipped(tokens, index + 1, new Set(['unique']));
  return isWord(tokens[indexed], 'index') ? createIndex(tokens, indexed + 1, schema) : index;
}

export function sqlSchema(text, offset = 0) {
  const tokens = tokensOf(text, offset);
  const schema = { foreignKeys: [], indexes: [] };
  let resume = 0;
  for (const index of tokens.keys()) {
    if (index >= resume) {
      resume = statementAt(tokens, index, schema) + 1;
    }
  }
  return schema;
}
