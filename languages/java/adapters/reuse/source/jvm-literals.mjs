const RAW_QUOTES = '"""';
const COMMENT_MARKS = /\/\*|\*\//gu;
const EXTRA_QUOTES = /"*/uy;
const MARKS = {
  java: { string: /\\[\s\S]|"|\n/gu, raw: /\\[\s\S]|"""/gu },
  kotlin: {
    string: /\\[\s\S]|"|\n|\$\{/gu,
    raw: /"""|\$\{/gu,
    code: /"""|"|'(?:\\.|[^'\\\n])*'|\/\/[^\n]*|\/\*|[{}]/gu,
  },
};

function markFrom(pattern, source, from) {
  const marks = new RegExp(pattern.source, pattern.flags);
  marks.lastIndex = from;
  return marks.exec(source) ?? undefined;
}

export function blockCommentEnd(source, index, kotlin) {
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

function finish(state, end) {
  state.stack.pop();
  if (state.stack.length === 0) {
    state.end = end;
    return undefined;
  }
  return end;
}

function enter(state, mode, after) {
  state.stack.push({ mode, depth: 0 });
  return after;
}

function inString(state, { mark, index, after }) {
  if (mark === '"') {
    return finish(state, after);
  }
  if (mark === '\n') {
    state.end = index;
    return undefined;
  }
  return mark === '${' ? enter(state, 'code', after) : after;
}

function inRaw(state, { mark, after }) {
  if (mark === RAW_QUOTES) {
    EXTRA_QUOTES.lastIndex = after;
    return finish(state, after + EXTRA_QUOTES.exec(state.source)[0].length);
  }
  return mark === '${' ? enter(state, 'code', after) : after;
}

function inCode(state, { mark, index, after }) {
  const top = state.stack.at(-1);
  if (mark === '{' || (mark === '}' && top.depth > 0)) {
    top.depth += mark === '{' ? 1 : -1;
    return after;
  }
  if (mark === '}') {
    return finish(state, after);
  }
  if (mark === '"' || mark === RAW_QUOTES) {
    return enter(state, mark === '"' ? 'string' : 'raw', after);
  }
  return mark === '/*' ? blockCommentEnd(state.source, index, true) : after;
}

const MODES = { string: inString, raw: inRaw, code: inCode };

function step(state, at) {
  const { mode } = state.stack.at(-1);
  const found = markFrom(state.marks[mode], state.source, at);
  if (found === undefined) {
    state.end = state.source.length;
    return undefined;
  }
  const mark = found[0];
  return MODES[mode](state, { mark, index: found.index, after: found.index + mark.length });
}

export function stringEnd(source, index, kotlin) {
  const raw = source.startsWith(RAW_QUOTES, index);
  const state = {
    source,
    marks: MARKS[kotlin ? 'kotlin' : 'java'],
    stack: [{ mode: raw ? 'raw' : 'string', depth: 0 }],
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
