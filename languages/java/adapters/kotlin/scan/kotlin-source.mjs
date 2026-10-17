const CHARACTER_LITERAL = /'(?:\\(?:u[0-9a-fA-F]{4}|.)|[^'\\\n])'/y;
const TOKEN = /"+|\\|'|\/\/|\/\*|\$\{|\$[A-Za-z_]|[{}\n]/g;
const BLOCK_COMMENT_MARK = /\/\*|\*\//g;
const RAW_QUOTES = '"""';
const BRACKETS = { '(': /[()]/g, '{': /[{}]/g, '[': /[[\]]/g };
const ARGUMENT_MARK = /[()[\]{},]/g;

function blank(state, from, to) {
  state.ranges.push({ from, to });
}

function blankRanges(source, ranges) {
  const pieces = [];
  let cursor = 0;
  for (const { from, to } of ranges.toSorted((left, right) => left.from - right.from)) {
    const start = Math.max(from, cursor);
    if (to > start) {
      pieces.push(source.slice(cursor, start), source.slice(start, to).replaceAll(/[^\n]/g, ' '));
      cursor = to;
    }
  }
  pieces.push(source.slice(cursor));
  return pieces.join('');
}

function matchesFrom(text, pattern, from) {
  const marks = new RegExp(pattern.source, 'g');
  marks.lastIndex = from;
  return text.matchAll(marks);
}

function blockCommentEnd(source, start) {
  let depth = 0;
  for (const { index, 0: mark } of matchesFrom(source, BLOCK_COMMENT_MARK, start)) {
    depth += mark === '/*' ? 1 : -1;
    if (depth === 0) {
      return index + mark.length;
    }
  }
  return source.length;
}

function lineComment(state, index) {
  const { source } = state;
  const newline = source.indexOf('\n', index);
  const end = newline === -1 ? source.length : newline;
  state.comments.push({ start: index, end, kind: 'line', text: source.slice(index + 2, end) });
  blank(state, index, end);
  state.position = end;
}

function blockComment(state, index) {
  const { source } = state;
  const end = blockCommentEnd(source, index);
  const kdoc = source.startsWith('/**', index) && !source.startsWith('/**/', index);
  const text = source.slice(index + 2, Math.max(index + 2, end - 2));
  state.comments.push({ start: index, end, kind: kdoc ? 'doc' : 'block', text });
  blank(state, index, end);
  state.position = end;
}

function characterLiteral(state, index) {
  const literal = new RegExp(CHARACTER_LITERAL.source, 'y');
  literal.lastIndex = index;
  if (literal.test(state.source)) {
    blank(state, index + 1, literal.lastIndex - 1);
    state.position = literal.lastIndex;
  }
}

function openBrace(state) {
  state.stack.at(-1).depth += 1;
}

function closeBrace(state) {
  const top = state.stack.at(-1);
  if (top.template === true && top.depth === 0) {
    state.stack.pop();
    return;
  }
  top.depth -= 1;
}

const CODE_TOKENS = {
  '//': lineComment,
  '/*': blockComment,
  "'": characterLiteral,
  '{': openBrace,
  '${': openBrace,
  '}': closeBrace,
};

function closeLiteral(state, bodyEnd, end) {
  const entry = state.stack.pop();
  state.literals.push({
    start: entry.start,
    end,
    bodyStart: entry.bodyStart,
    text: state.source.slice(entry.bodyStart, bodyEnd),
    template: entry.template,
    raw: entry.mode === 'raw',
  });
  blank(state, entry.bodyStart, bodyEnd);
}

function openLiteral(state, start, mode) {
  const width = mode === 'raw' ? RAW_QUOTES.length : 1;
  state.stack.push({ mode, start, bodyStart: start + width, template: false });
  return start + width;
}

function quoteStep(state, from, end) {
  if (from >= end) {
    return [];
  }
  const { mode } = state.stack.at(-1);
  if (mode === 'raw') {
    if (end - from >= RAW_QUOTES.length) {
      closeLiteral(state, end - RAW_QUOTES.length, end);
    }
    return [];
  }
  if (mode === 'string') {
    closeLiteral(state, from, from + 1);
    return [from + 1];
  }
  const raw = end - from >= RAW_QUOTES.length;
  return [openLiteral(state, from, raw ? 'raw' : 'string')];
}

function readQuotes(state, start, end) {
  const pending = [start];
  for (const from of pending) {
    pending.push(...quoteStep(state, from, end));
  }
}

function readLiteralToken(state, index, text) {
  const top = state.stack.at(-1);
  if (top.mode === 'string' && text === '\\') {
    state.position = index + 2;
  } else if (top.mode === 'string' && text === '\n') {
    closeLiteral(state, index, index + 1);
  } else if (text === '${') {
    top.template = true;
    state.stack.push({ mode: 'code', template: true, depth: 0 });
  } else if (text.startsWith('$')) {
    top.template = true;
  }
}

function readToken(state, { index, 0: text }) {
  const end = index + text.length;
  if (text.startsWith('"') && end > state.position) {
    readQuotes(state, Math.max(index, state.position), end);
    return;
  }
  if (index < state.position) {
    return;
  }
  if (state.stack.at(-1).mode === 'code') {
    CODE_TOKENS[text]?.(state, index);
    return;
  }
  readLiteralToken(state, index, text);
}

function closeOpenLiterals(state) {
  const { length } = state.source;
  for (const entry of state.stack.slice(1).toReversed()) {
    if (entry.mode === 'code') {
      state.stack.pop();
    } else {
      closeLiteral(state, length, length);
    }
  }
}

function lineStarts(source) {
  return [0, ...[...source.matchAll(/\n/g)].map(({ index }) => index + 1)];
}

export function scanKotlinSource(source) {
  const state = {
    source,
    ranges: [],
    literals: [],
    comments: [],
    stack: [{ mode: 'code', depth: 0 }],
    position: 0,
  };
  for (const token of source.matchAll(TOKEN)) {
    readToken(state, token);
  }
  closeOpenLiterals(state);
  return {
    source,
    code: blankRanges(source, state.ranges),
    literals: state.literals.toSorted((left, right) => left.start - right.start),
    comments: state.comments,
    lineStarts: lineStarts(source),
  };
}

export function lineOf(scanned, offset) {
  return scanned.lineStarts.findLastIndex((start) => start <= offset) + 1;
}

export function lineText(scanned, line) {
  const start = scanned.lineStarts[line - 1];
  const next = scanned.lineStarts[line];
  return scanned.source.slice(start, next === undefined ? undefined : next - 1);
}

export function literalAt(scanned, offset) {
  return scanned.literals.find(({ start }) => start === offset);
}

export function literalsIn(scanned, from, to) {
  return scanned.literals.filter(({ start, end }) => start >= from && end <= to);
}

export function closingIndex(code, open) {
  const opener = code[open];
  let depth = 0;
  for (const { index, 0: bracket } of matchesFrom(code, BRACKETS[opener], open)) {
    depth += bracket === opener ? 1 : -1;
    if (depth === 0) {
      return index;
    }
  }
  return code.length;
}

export function splitArguments(code, open) {
  const close = closingIndex(code, open);
  const parts = [];
  let depth = 0;
  let start = open + 1;
  for (const { index, 0: mark } of matchesFrom(code.slice(0, close), ARGUMENT_MARK, open + 1)) {
    if (mark === ',' && depth === 0) {
      parts.push({ start, end: index });
      start = index + 1;
    } else if (mark !== ',') {
      depth += '([{'.includes(mark) ? 1 : -1;
    }
  }
  if (code.slice(start, close).trim() !== '') {
    parts.push({ start, end: close });
  }
  return { close, parts };
}

function depthsOf(code, opener) {
  const depths = new Int32Array(code.length + 1);
  let depth = 0;
  let cursor = 0;
  for (const { index, 0: bracket } of code.matchAll(BRACKETS[opener])) {
    const opens = bracket === opener;
    const next = opens ? index + 1 : index;
    depths.fill(depth, cursor, next);
    depth += opens ? 1 : -1;
    cursor = next;
  }
  depths.fill(depth, cursor);
  return depths;
}

export function braceDepths(code) {
  return depthsOf(code, '{');
}

export function parenDepths(code) {
  return depthsOf(code, '(');
}

export function enclosingOpen(code, offset) {
  const open = [];
  for (const { index, 0: brace } of code.slice(0, offset).matchAll(BRACKETS['{'])) {
    if (brace === '{') {
      open.push(index);
    } else {
      open.pop();
    }
  }
  return open.at(-1) ?? -1;
}
