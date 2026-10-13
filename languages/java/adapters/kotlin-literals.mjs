const MARK = '\u0001';
const CHARACTER_LITERAL = /'(?:\\(?:u[0-9a-fA-F]{4}|.)|[^'\\\n])'/y;
const EVERY_CHARACTER = /[^]/g;

const startsWith = (state, index, text) => state.source.startsWith(text, index);

const insideTemplate = (state) => state.stack.some(({ template }) => template);

function emit(state, text) {
  if (!insideTemplate(state)) {
    state.code += text;
  }
}

function openMode(state, entry) {
  state.stack.push(entry);
}

function closeString(state, start, end) {
  state.stack.pop();
  if (!insideTemplate(state)) {
    state.literals.push(state.source.slice(start, end));
    state.code += `"${MARK}${String(state.literals.length - 1)}${MARK}"`;
  }
}

function openRawString(state, index) {
  const start = index + 3;
  const closing = state.source.indexOf('"""', start);
  const end = closing === -1 ? state.source.length : closing;
  openMode(state, { mode: 'string', start });
  closeString(state, start, end);
  const quotes = /^"*/.exec(state.source.slice(end + 3))[0];
  return end + 3 + quotes.length;
}

function openString(state, index) {
  openMode(state, { mode: 'string', start: index + 1 });
  return index + 1;
}

function openBlockComment(state, index) {
  openMode(state, { mode: 'block', depth: 1 });
  emit(state, ' ');
  return index + 2;
}

function skipLineComment(state, index) {
  const end = state.source.indexOf('\n', index);
  emit(state, ' ');
  return end === -1 ? state.source.length : end;
}

function readCharacter(state, index) {
  CHARACTER_LITERAL.lastIndex = index;
  const matched = CHARACTER_LITERAL.test(state.source);
  emit(state, matched ? "''" : "'");
  return matched ? CHARACTER_LITERAL.lastIndex : index + 1;
}

function openBrace(state, index) {
  state.stack.at(-1).depth += 1;
  emit(state, '{');
  return index + 1;
}

function closeBrace(state, index) {
  const top = state.stack.at(-1);
  if (top.template && top.depth === 0) {
    state.stack.pop();
  } else {
    top.depth -= 1;
    emit(state, '}');
  }
  return index + 1;
}

const CODE_TOKENS = [
  ['/*', openBlockComment],
  ['//', skipLineComment],
  ['"""', openRawString],
  ['"', openString],
  ["'", readCharacter],
  ['{', openBrace],
  ['}', closeBrace],
];

function readCode(state, index) {
  const token = CODE_TOKENS.find(([text]) => startsWith(state, index, text));
  if (token === undefined) {
    emit(state, state.source[index]);
    return index + 1;
  }
  return token[1](state, index);
}

function readBlockComment(state, index) {
  const top = state.stack.at(-1);
  if (startsWith(state, index, '/*')) {
    top.depth += 1;
    return index + 2;
  }
  if (startsWith(state, index, '*/')) {
    top.depth -= 1;
    if (top.depth === 0) {
      state.stack.pop();
    }
    return index + 2;
  }
  return index + 1;
}

function readStringBody(state, index) {
  const { start } = state.stack.at(-1);
  if (startsWith(state, index, '\\')) {
    return index + 2;
  }
  if (startsWith(state, index, '"')) {
    closeString(state, start, index);
    return index + 1;
  }
  if (startsWith(state, index, '\n')) {
    closeString(state, start, index);
    return index + 1;
  }
  if (startsWith(state, index, '${')) {
    openMode(state, { mode: 'code', template: true, depth: 0 });
    return index + 2;
  }
  return index + 1;
}

const READERS = { code: readCode, block: readBlockComment, string: readStringBody };

export function maskKotlinSource(source) {
  const state = { source, code: '', literals: [], stack: [{ mode: 'code', depth: 0 }] };
  let next = 0;
  for (const { index } of source.matchAll(EVERY_CHARACTER)) {
    if (index >= next) {
      next = READERS[state.stack.at(-1).mode](state, index);
    }
  }
  return { code: state.code, literals: state.literals };
}

export const LITERAL_MARK = new RegExp(`"${MARK}(\\d+)${MARK}"`, 'g');
