const QUOTES = new Set(['"', "'"]);
const OPENERS = new Set(['(', '[']);
const CLOSERS = new Set([')', ']']);
const CONTINUES = /[,=+.]\s*$/u;

function stringEnd(text, start) {
  const quote = text[start];
  const closing = text.startsWith(quote.repeat(3), start) ? quote.repeat(3) : quote;
  for (let index = start + closing.length; index < text.length; index += 1) {
    if (text[index] === '\\') {
      index += 1;
    } else if (text.startsWith(closing, index)) {
      return index + closing.length;
    }
  }
  return text.length;
}

function commentEnd(text, start) {
  if (text.startsWith('//', start)) {
    const end = text.indexOf('\n', start);
    return end === -1 ? text.length : end;
  }
  if (text.startsWith('/*', start)) {
    const end = text.indexOf('*/', start + 2);
    return end === -1 ? text.length : end + 2;
  }
  return undefined;
}

function tokens(text) {
  const found = [];
  let index = 0;
  while (index < text.length) {
    const comment = commentEnd(text, index);
    const end = QUOTES.has(text[index]) ? stringEnd(text, index) : (comment ?? index + 1);
    if (comment === undefined) {
      found.push(text.slice(index, end));
    }
    index = end;
  }
  return found;
}

function normalized(text) {
  return text.replaceAll(/\s+/gu, ' ').trim();
}

export function gradleStatements(text) {
  const statements = [];
  const path = [];
  let buffer = '';
  let depth = 0;
  function flush() {
    const statement = normalized(buffer);
    if (statement !== '') {
      statements.push({ path: [...path], text: statement });
    }
    buffer = '';
  }
  for (const token of tokens(text)) {
    if (token === '{') {
      path.push(normalized(buffer));
      buffer = '';
    } else if (token === '}') {
      flush();
      path.pop();
    } else if (token === ';' || (token === '\n' && depth === 0 && !CONTINUES.test(buffer))) {
      flush();
    } else {
      depth += OPENERS.has(token) ? 1 : -Number(CLOSERS.has(token) && depth > 0);
      buffer += token;
    }
  }
  flush();
  return statements;
}
