import { commaParts } from './comma-parts.mts';
import type { ColumnName, SchemaFacts } from '../schema-types.mts';

type Token = {
  readonly value: string;
  readonly word: string;
  readonly quoted: boolean;
  readonly at: number;
};

const PAREN: Readonly<Record<string, number>> = { '(': 1, ')': -1 };
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
const UNIQUE = 'unique';
const INDEX_MODIFIERS = new Set([UNIQUE, 'concurrently']);
const OPTIONAL = new Set(['if', 'not', 'exists', 'only']);
const KEYED = new Set(['primary', UNIQUE, 'index', 'key']);
const NAME_TOKENS = 5;

function tokensOf(text: string, offset: number): Token[] {
  return [...text.matchAll(TOKEN)]
    .filter(([value]) => !SKIPPED.test(value))
    .map((match) => {
      const [value] = match;
      const quoted = QUOTED.test(value);
      const plain = quoted ? value.slice(1, -1) : value;
      return { value: plain, word: plain.toLowerCase(), quoted, at: offset + match.index };
    });
}

function isWord(token: Token | undefined, word: string): boolean {
  return token !== undefined && !token.quoted && token.word === word;
}

function skipped(tokens: readonly Token[], start: number, words: ReadonlySet<string>): number {
  const found = tokens.slice(start).findIndex((token) => token.quoted || !words.has(token.word));
  return found < 0 ? tokens.length : start + found;
}

function nameAt(
  tokens: readonly Token[],
  start: number,
): { readonly name: string | undefined; readonly next: number } {
  let next = start;
  let name: Token | undefined;
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

function closing(tokens: readonly Token[], open: number): number {
  let depth = 0;
  for (const [offset, token] of tokens.slice(open).entries()) {
    depth += PAREN[token.value] ?? 0;
    if (depth === 0) {
      return open + offset;
    }
  }
  return tokens.length;
}

function topLevelParts(tokens: readonly Token[]): Token[][] {
  return commaParts(tokens, {
    step: (token) => PAREN[token.value] ?? 0,
    isComma: (token) => token.value === ',',
  });
}

function columnList(tokens: readonly Token[], open: number): ColumnName[] {
  if (tokens[open]?.value !== '(') {
    return [];
  }
  return topLevelParts(tokens.slice(open + 1, closing(tokens, open))).map((part) =>
    part[1]?.value === '(' ? undefined : part[0]?.word,
  );
}

function afterConstraint(part: readonly Token[]): readonly Token[] {
  return isWord(part[0], 'constraint') ? part.slice(2) : part;
}

function keyedColumns(part: readonly Token[]): ColumnName[] {
  const open = part.findIndex((token) => token.value === '(');
  return open < 0 ? [] : columnList(part, open);
}

function tableConstraint(
  table: string | undefined,
  part: readonly Token[],
  schema: SchemaFacts,
): boolean {
  const [first] = part;
  if (first === undefined) {
    return false;
  }
  if (isWord(first, 'foreign') && isWord(part[1], 'key')) {
    schema.foreignKeys.push({ table, columns: keyedColumns(part), at: first.at });
    return true;
  }
  if (!first.quoted && KEYED.has(first.word)) {
    schema.indexes.push({ table, columns: keyedColumns(part) });
    return true;
  }
  return !first.quoted && ['check', 'exclude', 'like'].includes(first.word);
}

function definitionFacts(
  table: string | undefined,
  rawPart: readonly Token[],
  schema: SchemaFacts,
): void {
  const part = afterConstraint(rawPart);
  const [first] = part;
  if (first === undefined || tableConstraint(table, part, schema)) {
    return;
  }
  const rest = part.slice(1);
  const reference = rest.find((token) => isWord(token, 'references'));
  if (reference !== undefined) {
    schema.foreignKeys.push({ table, columns: [first.word], at: reference.at });
  }
  if (rest.some((token) => isWord(token, 'primary') || isWord(token, UNIQUE))) {
    schema.indexes.push({ table, columns: [first.word] });
  }
}

function createTable(tokens: readonly Token[], start: number, schema: SchemaFacts): number {
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

function alterTable(tokens: readonly Token[], start: number, schema: SchemaFacts): number {
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

function createIndex(tokens: readonly Token[], start: number, schema: SchemaFacts): number {
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

function statementAt(tokens: readonly Token[], index: number, schema: SchemaFacts): number {
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
  const indexed = skipped(tokens, index + 1, new Set([UNIQUE]));
  return isWord(tokens[indexed], 'index') ? createIndex(tokens, indexed + 1, schema) : index;
}

function statementsOf(tokens: readonly Token[]): Token[][] {
  let current: Token[] = [];
  const statements = [current];
  for (const token of tokens) {
    if (token.value === ';' && !token.quoted) {
      current = [];
      statements.push(current);
    } else {
      current.push(token);
    }
  }
  return statements;
}

function statementFacts(tokens: readonly Token[], schema: SchemaFacts): void {
  let resume = 0;
  for (const index of tokens.keys()) {
    if (index >= resume && (isWord(tokens[index], 'create') || isWord(tokens[index], 'alter'))) {
      resume = statementAt(tokens, index, schema) + 1;
    }
  }
}

export function sqlSchema(text: string, offset = 0): SchemaFacts {
  const schema: SchemaFacts = { foreignKeys: [], indexes: [] };
  for (const tokens of statementsOf(tokensOf(text, offset))) {
    statementFacts(tokens, schema);
  }
  return schema;
}
