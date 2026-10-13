const MARK = '\u0001';

function startsWith(state, text) {
  return state.source.startsWith(text, state.index);
}

function skipBlockComment(state) {
  let depth = 0;
  while (state.index < state.source.length) {
    if (startsWith(state, '/*')) {
      depth += 1;
      state.index += 2;
    } else if (startsWith(state, '*/')) {
      depth -= 1;
      state.index += 2;
      if (depth === 0) {
        return;
      }
    } else {
      state.index += 1;
    }
  }
}

function skipLineComment(state) {
  const end = state.source.indexOf('\n', state.index);
  state.index = end === -1 ? state.source.length : end;
}

function skipCharacterLiteral(state) {
  state.index += 1;
  while (state.index < state.source.length) {
    const character = state.source[state.index];
    state.index += character === '\\' ? 2 : 1;
    if (character === "'" || character === '\n') {
      return;
    }
  }
}

function readRawString(state) {
  const start = state.index + 3;
  const closing = state.source.indexOf('"""', start);
  const end = closing === -1 ? state.source.length : closing;
  let after = end + 3;
  while (state.source[after] === '"') {
    after += 1;
  }
  state.index = after;
  return state.source.slice(start, end);
}

function readString(state) {
  if (startsWith(state, '"""')) {
    return readRawString(state);
  }
  state.index += 1;
  const start = state.index;
  while (state.index < state.source.length) {
    const character = state.source[state.index];
    if (character === '"' || character === '\n') {
      state.index += 1;
      return state.source.slice(start, state.index - 1);
    }
    if (startsWith(state, '${')) {
      state.index += 2;
      scanCode(state, true);
    } else {
      state.index += character === '\\' ? 2 : 1;
    }
  }
  return state.source.slice(start);
}

function maskLiteral(state) {
  state.literals.push(readString(state));
  return `"${MARK}${String(state.literals.length - 1)}${MARK}"`;
}

function readToken(state) {
  const character = state.source[state.index];
  if (startsWith(state, '/*')) {
    skipBlockComment(state);
    return ' ';
  }
  if (startsWith(state, '//')) {
    skipLineComment(state);
    return ' ';
  }
  if (character === '"') {
    return maskLiteral(state);
  }
  if (character === "'") {
    skipCharacterLiteral(state);
    return "''";
  }
  state.index += 1;
  return character;
}

function scanCode(state, insideTemplate) {
  let code = '';
  let depth = 0;
  while (state.index < state.source.length) {
    const character = state.source[state.index];
    if (insideTemplate && character === '}' && depth === 0) {
      state.index += 1;
      break;
    }
    depth += { '{': 1, '}': -1 }[character] ?? 0;
    code += readToken(state);
  }
  return code;
}

export function maskKotlinSource(source) {
  const state = { source, index: 0, literals: [] };
  const code = scanCode(state, false);
  return { code, literals: state.literals };
}

export const LITERAL_MARK = new RegExp(`"${MARK}(\\d+)${MARK}"`, 'g');
