import type { SqlPiece, TemplateState } from './sql-types.mts';

const TEMPLATE_TOKEN = /\\[\s\S]|\$\{|\$[A-Za-z_]\w*|[{}]/g;
const RAW_TEMPLATE_TOKEN = /\$\{|\$[A-Za-z_]\w*|[{}]/g;
const ESCAPES: Readonly<Record<string, string>> = { n: '\n', t: '\t', r: '\r', b: '\b' };

function unescaped(text: string, raw: boolean): string {
  return raw
    ? text
    : text.replaceAll(
        /\\([\s\S])/g,
        (_: string, character: string) => ESCAPES[character] ?? character,
      );
}

function pushText(state: TemplateState, end: number): void {
  state.pieces.push({ text: unescaped(state.text.slice(state.cursor, end), state.raw) });
}

function insideTemplate(state: TemplateState, index: number, token: string): void {
  if (token === '}' && state.depth === 0) {
    state.pieces.push({ expression: state.text.slice(state.open, index).trim() });
    state.cursor = index + 1;
    state.open = -1;
  } else if (token === '}' || token === '{' || token === '${') {
    state.depth += token === '}' ? -1 : 1;
  }
}

function outsideTemplate(state: TemplateState, index: number, token: string): void {
  if (!token.startsWith('$')) {
    return;
  }
  pushText(state, index);
  if (token === '${') {
    state.open = index + 2;
    return;
  }
  state.pieces.push({ expression: token.slice(1) });
  state.cursor = index + token.length;
}

export function templatePieces({ text, raw }: { text: string; raw: boolean }): SqlPiece[] {
  const state: TemplateState = { text, raw, pieces: [], cursor: 0, open: -1, depth: 0 };
  for (const { index = 0, 0: token } of text.matchAll(raw ? RAW_TEMPLATE_TOKEN : TEMPLATE_TOKEN)) {
    if (state.open === -1) {
      outsideTemplate(state, index, token);
    } else {
      insideTemplate(state, index, token);
    }
  }
  pushText(state, text.length);
  return state.pieces;
}
