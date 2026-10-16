const CHARACTER_LITERAL = /'(?:\\(?:u[0-9a-fA-F]{4}|.)|[^'\\\n])'/y;
const TEMPLATE_NAME = /[A-Za-z_]/;

function blank(out, from, to) {
  for (let index = from; index < to; index += 1) {
    if (out[index] !== '\n') {
      out[index] = ' ';
    }
  }
}

function blockCommentEnd(source, start) {
  let depth = 0;
  let index = start;
  while (index < source.length) {
    if (source.startsWith('/*', index)) {
      depth += 1;
      index += 2;
    } else if (source.startsWith('*/', index)) {
      depth -= 1;
      index += 2;
      if (depth === 0) {
        return index;
      }
    } else {
      index += 1;
    }
  }
  return source.length;
}

function readComment(state, index) {
  const { source } = state;
  if (source.startsWith('//', index)) {
    const newline = source.indexOf('\n', index);
    const end = newline === -1 ? source.length : newline;
    state.comments.push({ start: index, end, kind: 'line', text: source.slice(index + 2, end) });
    blank(state.out, index, end);
    return end;
  }
  const end = blockCommentEnd(source, index);
  const kdoc = source.startsWith('/**', index) && !source.startsWith('/**/', index);
  const text = source.slice(index + 2, Math.max(index + 2, end - 2));
  state.comments.push({ start: index, end, kind: kdoc ? 'doc' : 'block', text });
  blank(state.out, index, end);
  return end;
}

function readCode(state, index) {
  const { source } = state;
  const top = state.stack.at(-1);
  if (source.startsWith('//', index) || source.startsWith('/*', index)) {
    return readComment(state, index);
  }
  if (source.startsWith('"""', index)) {
    state.stack.push({ mode: 'raw', start: index, bodyStart: index + 3, template: false });
    return index + 3;
  }
  const character = source[index];
  if (character === '"') {
    state.stack.push({ mode: 'string', start: index, bodyStart: index + 1, template: false });
    return index + 1;
  }
  if (character === "'") {
    CHARACTER_LITERAL.lastIndex = index;
    if (!CHARACTER_LITERAL.test(source)) {
      return index + 1;
    }
    blank(state.out, index + 1, CHARACTER_LITERAL.lastIndex - 1);
    return CHARACTER_LITERAL.lastIndex;
  }
  if (character === '{') {
    top.depth += 1;
  } else if (character === '}') {
    if (top.template === true && top.depth === 0) {
      state.stack.pop();
      return index + 1;
    }
    top.depth -= 1;
  }
  return index + 1;
}

function closeLiteral(state, bodyEnd, end) {
  const entry = state.stack.pop();
  const literal = {
    start: entry.start,
    end,
    bodyStart: entry.bodyStart,
    text: state.source.slice(entry.bodyStart, bodyEnd),
    template: entry.template,
    raw: entry.mode === 'raw',
  };
  state.literals.push(literal);
  blank(state.out, entry.bodyStart, bodyEnd);
  return end;
}

function readLiteral(state, index) {
  const { source } = state;
  const top = state.stack.at(-1);
  if (top.mode === 'string' && source[index] === '\\') {
    return index + 2;
  }
  if (top.mode === 'string' && (source[index] === '"' || source[index] === '\n')) {
    return closeLiteral(state, index, index + 1);
  }
  if (top.mode === 'raw' && source.startsWith('"""', index)) {
    let end = index;
    while (source[end] === '"') {
      end += 1;
    }
    return closeLiteral(state, end - 3, end);
  }
  if (source.startsWith('${', index)) {
    top.template = true;
    state.stack.push({ mode: 'code', template: true, depth: 0 });
    return index + 2;
  }
  if (source[index] === '$' && TEMPLATE_NAME.test(source[index + 1] ?? '')) {
    top.template = true;
  }
  return index + 1;
}

export function scanKotlinSource(source) {
  const state = {
    source,
    out: source.split(''),
    literals: [],
    comments: [],
    stack: [{ mode: 'code', depth: 0 }],
  };
  let index = 0;
  while (index < source.length) {
    index = state.stack.at(-1).mode === 'code' ? readCode(state, index) : readLiteral(state, index);
  }
  while (state.stack.length > 1) {
    const top = state.stack.at(-1);
    if (top.mode === 'code') {
      state.stack.pop();
    } else {
      closeLiteral(state, source.length, source.length);
    }
  }
  const code = state.out.join('');
  const literals = state.literals.toSorted((left, right) => left.start - right.start);
  return {
    source,
    code,
    literals,
    comments: state.comments,
    lineStarts: lineStarts(source),
  };
}

function lineStarts(source) {
  const starts = [0];
  for (const { index } of source.matchAll(/\n/g)) {
    starts.push(index + 1);
  }
  return starts;
}

export function lineOf(scanned, offset) {
  const { lineStarts: starts } = scanned;
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (starts[middle] <= offset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low + 1;
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

const CLOSING = { '(': ')', '{': '}', '[': ']' };

export function closingIndex(code, open) {
  const opener = code[open];
  const closer = CLOSING[opener];
  let depth = 0;
  for (let index = open; index < code.length; index += 1) {
    if (code[index] === opener) {
      depth += 1;
    } else if (code[index] === closer) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return code.length;
}

export function splitArguments(code, open) {
  const close = closingIndex(code, open);
  const parts = [];
  let depth = 0;
  let start = open + 1;
  for (let index = open + 1; index < close; index += 1) {
    const character = code[index];
    if ('([{'.includes(character)) {
      depth += 1;
    } else if (')]}'.includes(character)) {
      depth -= 1;
    } else if (character === ',' && depth === 0) {
      parts.push({ start, end: index });
      start = index + 1;
    }
  }
  if (code.slice(start, close).trim() !== '') {
    parts.push({ start, end: close });
  }
  return { close, parts };
}

function depthsOf(code, opener, closer) {
  const depths = new Int32Array(code.length + 1);
  let depth = 0;
  for (let index = 0; index < code.length; index += 1) {
    if (code[index] === closer) {
      depth -= 1;
    }
    depths[index] = depth;
    if (code[index] === opener) {
      depth += 1;
    }
  }
  depths[code.length] = depth;
  return depths;
}

export function braceDepths(code) {
  return depthsOf(code, '{', '}');
}

export function parenDepths(code) {
  return depthsOf(code, '(', ')');
}

export function enclosingOpen(code, offset) {
  let depth = 0;
  for (let index = offset - 1; index >= 0; index -= 1) {
    if (code[index] === '}') {
      depth += 1;
    } else if (code[index] === '{') {
      if (depth === 0) {
        return index;
      }
      depth -= 1;
    }
  }
  return -1;
}
