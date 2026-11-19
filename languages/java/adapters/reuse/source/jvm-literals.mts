const STRING = 'string';

type Mode = typeof STRING | 'raw' | 'code';
type Marks = Readonly<Partial<Record<Mode, RegExp>>>;
type Frame = { readonly mode: Mode; depth: number };
type StringState = {
  readonly source: string;
  readonly marks: Marks;
  readonly stack: Frame[];
  end: number;
};
type Step = { readonly mark: string; readonly index: number; readonly after: number };

const RAW_QUOTES = '"""';
const COMMENT_MARKS = /\/\*|\*\//gu;
const EXTRA_QUOTES = /"*/uy;
const MARKS: Readonly<Record<'java' | 'kotlin', Marks>> = {
  java: { [STRING]: /\\[\s\S]|"|\n/gu, raw: /\\[\s\S]|"""/gu },
  kotlin: {
    string: /\\[\s\S]|"|\n|\$\{/gu,
    raw: /"""|\$\{/gu,
    code: /"""|"|'(?:\\.|[^'\\\n])*'|\/\/[^\n]*|\/\*|[{}]/gu,
  },
};

function markFrom(pattern: RegExp, source: string, from: number): RegExpExecArray | undefined {
  const marks = new RegExp(pattern.source, pattern.flags);
  marks.lastIndex = from;
  return marks.exec(source) ?? undefined;
}

export function blockCommentEnd(source: string, index: number, kotlin: boolean): number {
  const marks = new RegExp(COMMENT_MARKS.source, COMMENT_MARKS.flags);
  marks.lastIndex = index;
  let depth = 0;
  for (const { 0: mark, index: at } of source.matchAll(marks)) {
    depth += mark === '/*' ? Number(kotlin || depth === 0) : -1;
    if (depth === 0) {
      return at + mark.length;
    }
  }
  return source.length;
}

function finish(state: StringState, end: number): number | undefined {
  state.stack.pop();
  if (state.stack.length === 0) {
    state.end = end;
    return undefined;
  }
  return end;
}

function enter(state: StringState, mode: Mode, after: number): number {
  state.stack.push({ mode, depth: 0 });
  return after;
}

function inString(state: StringState, { mark, index, after }: Step): number | undefined {
  if (mark === '"') {
    return finish(state, after);
  }
  if (mark === '\n') {
    state.end = index;
    return undefined;
  }
  return mark === '${' ? enter(state, 'code', after) : after;
}

function inRaw(state: StringState, { mark, after }: Step): number | undefined {
  if (mark === RAW_QUOTES) {
    EXTRA_QUOTES.lastIndex = after;
    return finish(state, after + (EXTRA_QUOTES.exec(state.source)?.[0].length ?? 0));
  }
  return mark === '${' ? enter(state, 'code', after) : after;
}

function inCode(state: StringState, { mark, index, after }: Step): number | undefined {
  const top = state.stack.at(-1);
  if (top !== undefined && (mark === '{' || (mark === '}' && top.depth > 0))) {
    top.depth += mark === '{' ? 1 : -1;
    return after;
  }
  if (mark === '}') {
    return finish(state, after);
  }
  if (mark === '"' || mark === RAW_QUOTES) {
    return enter(state, mark === '"' ? STRING : 'raw', after);
  }
  return mark === '/*' ? blockCommentEnd(state.source, index, true) : after;
}

const MODES = { string: inString, raw: inRaw, code: inCode };

function step(state: StringState, at: number): number | undefined {
  const mode = state.stack.at(-1)?.mode ?? STRING;
  const pattern = state.marks[mode];
  const found = pattern === undefined ? undefined : markFrom(pattern, state.source, at);
  if (found === undefined) {
    state.end = state.source.length;
    return undefined;
  }
  const mark = found[0];
  return MODES[mode](state, { mark, index: found.index, after: found.index + mark.length });
}

export function stringEnd(source: string, index: number, { kotlin }: { kotlin: boolean }): number {
  const raw = source.startsWith(RAW_QUOTES, index);
  const state: StringState = {
    source,
    marks: MARKS[kotlin ? 'kotlin' : 'java'],
    stack: [{ mode: raw ? 'raw' : STRING, depth: 0 }],
    end: source.length,
  };
  const positions = [index + (raw ? RAW_QUOTES.length : 1)];
  for (const at of positions) {
    const next = step(state, at);
    if (next !== undefined) {
      positions.push(next);
    }
  }
  return state.end;
}
