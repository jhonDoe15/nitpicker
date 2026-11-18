import type { GradleStatement } from '../typed/narrowing-types.mts';

type ScriptState = {
  readonly statements: GradleStatement[];
  readonly path: string[];
  buffer: string;
  depth: number;
};

const OPENERS = new Set(['(', '[']);
const CLOSERS = new Set([')', ']']);
const CONTINUES = /[,=+.]\s*$/u;
const TOKEN = new RegExp(
  [
    String.raw`"""[\s\S]*?(?:"""|$)`,
    String.raw`'''[\s\S]*?(?:'''|$)`,
    String.raw`"(?:\\[\s\S]|[^"\\])*(?:"|$)`,
    String.raw`'(?:\\[\s\S]|[^'\\])*(?:'|$)`,
    String.raw`//[^\n]*`,
    String.raw`/\*[\s\S]*?(?:\*/|$)`,
    String.raw`[\s\S]`,
  ].join('|'),
  'gu',
);

export function gradleTokens(text: string): string[] {
  return text.match(TOKEN)?.filter((token) => !/^\/[*/]/u.test(token)) ?? [];
}

function normalized(text: string): string {
  return text.replaceAll(/\s+/gu, ' ').trim();
}

function flush(state: ScriptState): void {
  const statement = normalized(state.buffer);
  if (statement !== '') {
    state.statements.push({ path: [...state.path], text: statement });
  }
  state.buffer = '';
}

function consume(state: ScriptState, token: string): void {
  if (token === '{') {
    state.path.push(normalized(state.buffer));
    state.buffer = '';
  } else if (token === '}') {
    flush(state);
    state.path.pop();
  } else if (
    token === ';' ||
    (token === '\n' && state.depth === 0 && !CONTINUES.test(state.buffer))
  ) {
    flush(state);
  } else {
    state.depth += OPENERS.has(token) ? 1 : -Number(CLOSERS.has(token) && state.depth > 0);
    state.buffer += token;
  }
}

export function gradleStatements(text: string): GradleStatement[] {
  const state: ScriptState = { statements: [], path: [], buffer: '', depth: 0 };
  for (const token of gradleTokens(text)) {
    consume(state, token);
  }
  flush(state);
  return state.statements;
}

export function quotedGroups(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[1] ?? match[2] ?? '');
}
