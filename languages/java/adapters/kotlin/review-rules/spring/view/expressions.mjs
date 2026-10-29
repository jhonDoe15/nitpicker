import { closingIndex, scanKotlinSource } from '../../../scan/kotlin-source.mjs';

const OPENING = new Map([
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
]);
const MARK = /[()[\]{}.,]/gu;
const ANGLE = /[<>]/gu;
const LEADING_SPACES = /^ */u;
const IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_]*/u;
const NAMED_ARGUMENT = /^[\p{L}_][\p{L}\p{N}_]*\s*=(?!=)\s*/u;
const DIGIT = /\d/u;
const CLOSING = new Set(OPENING.values());

function sourceOf(text) {
  return { text, code: scanKotlinSource(text).code };
}

function topLevelMarks(text, wanted) {
  const stack = [];
  const marks = [];
  for (const { index, 0: mark } of sourceOf(text).code.matchAll(MARK)) {
    if (OPENING.has(mark)) {
      stack.push(OPENING.get(mark));
    } else if (mark === wanted) {
      marks.push(...(stack.length === 0 ? [index] : []));
    } else if (CLOSING.has(mark) && stack.pop() !== mark) {
      return undefined;
    }
  }
  return stack.length === 0 ? marks : undefined;
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
  const split = topLevelMarks(text, '.')
    ?.filter((index) => memberDot(text, index))
    .at(-1);
  if (split === undefined || split <= 0) {
    return undefined;
  }
  return {
    head: text.slice(0, split).replace(/\?$/u, '').trim(),
    selector: text.slice(split + 1).trim(),
  };
}

export function splitArguments(text) {
  const bounds = [-1, ...(topLevelMarks(text, ',') ?? []), text.length];
  return bounds
    .slice(1)
    .map((end, index) => text.slice(bounds[index] + 1, end).trim())
    .filter((part) => part !== '')
    .map((part) => {
      const value = part.replace(NAMED_ARGUMENT, '');
      return { text: value.replace(/^\*\s*/u, ''), spread: value.startsWith('*') };
    });
}

function closingAngle(code, from) {
  let depth = 0;
  for (const { index, 0: mark } of code.slice(from).matchAll(ANGLE)) {
    depth += mark === '<' ? 1 : -1;
    if (depth === 0) {
      return from + index;
    }
  }
  return code.length;
}

function section(source, start, open) {
  const from = start + LEADING_SPACES.exec(source.text.slice(start))[0].length;
  if (source.text[from] !== open) {
    return { end: start };
  }
  const end = open === '<' ? closingAngle(source.code, from) : closingIndex(source.code, from);
  return end >= source.text.length
    ? undefined
    : { inner: source.text.slice(from + 1, end), end: end + 1 };
}

export function parseSelector(text) {
  const name = IDENTIFIER.exec(text)?.[0];
  if (name === undefined) {
    return undefined;
  }
  const source = sourceOf(text);
  const types = section(source, name.length, '<');
  const values = types && section(source, types.end, '(');
  const lambda = values && section(source, values.end, '{');
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
  if (!trimmed.startsWith('(') || closingIndex(sourceOf(trimmed).code, 0) !== trimmed.length - 1) {
    return undefined;
  }
  return trimmed.slice(1, -1);
}
