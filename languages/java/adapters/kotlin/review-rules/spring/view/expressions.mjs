const OPENING = new Map([
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
]);
const CLOSING = new Set(OPENING.values());
const IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_]*/u;
const NAMED_ARGUMENT = /^[\p{L}_][\p{L}\p{N}_]*\s*=(?!=)\s*/u;
const DIGIT = /\d/u;

function stringEnd(text, start) {
  const quote = text[start];
  const triple = quote === '"' && text.startsWith('"""', start);
  if (triple) {
    const end = text.indexOf('"""', start + 3);
    return end < 0 ? text.length : end + 3;
  }
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === '\\') {
      index += 1;
    } else if (text[index] === quote) {
      return index + 1;
    }
  }
  return text.length;
}

function topLevel(text, visit) {
  const stack = [];
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' || character === "'") {
      index = stringEnd(text, index) - 1;
    } else if (OPENING.has(character)) {
      stack.push(OPENING.get(character));
    } else if (CLOSING.has(character)) {
      if (stack.pop() !== character) {
        return false;
      }
    } else if (stack.length === 0) {
      visit(index);
    }
  }
  return stack.length === 0;
}

function memberDot(text, index) {
  return (
    text[index] === '.' &&
    text[index - 1] !== '.' &&
    text[index + 1] !== '.' &&
    !(DIGIT.test(text[index - 1] ?? '') && DIGIT.test(text[index + 1] ?? ''))
  );
}

export function lastSelector(text) {
  let split = -1;
  const balanced = topLevel(text, (index) => {
    split = memberDot(text, index) ? index : split;
  });
  if (!balanced || split <= 0) {
    return undefined;
  }
  return {
    head: text.slice(0, split).replace(/\?$/u, '').trim(),
    selector: text.slice(split + 1).trim(),
  };
}

export function splitArguments(text) {
  const parts = [];
  let start = 0;
  topLevel(text, (index) => {
    if (text[index] === ',') {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  });
  parts.push(text.slice(start));
  return parts
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => {
      const value = part.replace(NAMED_ARGUMENT, '');
      return { text: value.replace(/^\*\s*/u, ''), spread: value.startsWith('*') };
    });
}

function closing(text, start, open, close) {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === '"' || text[index] === "'") {
      index = stringEnd(text, index) - 1;
    } else if (text[index] === open) {
      depth += 1;
    } else if (text[index] === close) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function section(text, start, open, close) {
  let from = start;
  while (text[from] === ' ') {
    from += 1;
  }
  if (text[from] !== open) {
    return { end: start };
  }
  const end = closing(text, from, open, close);
  return end < 0 ? undefined : { inner: text.slice(from + 1, end), end: end + 1 };
}

export function parseSelector(text) {
  const name = IDENTIFIER.exec(text)?.[0];
  if (name === undefined) {
    return undefined;
  }
  const types = section(text, name.length, '<', '>');
  const values = types && section(text, types.end, '(', ')');
  const lambda = values && section(text, values.end, '{', '}');
  if (lambda === undefined || text.slice(lambda.end).trim() !== '') {
    return undefined;
  }
  const call = values.inner !== undefined || lambda.inner !== undefined;
  return {
    name,
    call,
    typeArguments: types.inner === undefined ? undefined : `<${types.inner}>`,
    arguments: [
      ...splitArguments(values.inner ?? ''),
      ...(lambda.inner === undefined ? [] : [{ text: `{${lambda.inner}}`, lambda: true }]),
    ],
  };
}

export function normalized(text) {
  return (text ?? '').replaceAll('!!', '').replaceAll('?.', '.').trim();
}

export function unwrapped(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('(') || closing(trimmed, 0, '(', ')') !== trimmed.length - 1) {
    return undefined;
  }
  return trimmed.slice(1, -1);
}
