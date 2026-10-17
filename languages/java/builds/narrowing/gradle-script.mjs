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

function tokens(text) {
  return text.match(TOKEN)?.filter((token) => !/^\/[*/]/u.test(token)) ?? [];
}

function normalized(text) {
  return text.replaceAll(/\s+/gu, ' ').trim();
}

function flush(state) {
  const statement = normalized(state.buffer);
  if (statement !== '') {
    state.statements.push({ path: [...state.path], text: statement });
  }
  state.buffer = '';
}

function consume(state, token) {
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

export function gradleStatements(text) {
  const state = { statements: [], path: [], buffer: '', depth: 0 };
  for (const token of tokens(text)) {
    consume(state, token);
  }
  flush(state);
  return state.statements;
}
