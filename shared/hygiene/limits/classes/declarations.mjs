import { blankComments, closingIndex, lineAt, parseArguments } from '../scanning/scan.mjs';

const ANNOTATION = /@(?:\w+:)?([\w.]+)/uy;
const SPACE = /\s+/uy;
const AT_ANNOTATION = /@(?:\w+:)?[\w.]+/gu;
const STATEMENT_TOKEN = /[;\n(]/gu;
const MODIFIER_GAP = /^[\s\w]*$/u;
const LOOKBACK = 3000;

function readAnnotation(text, start) {
  ANNOTATION.lastIndex = start;
  const match = ANNOTATION.exec(text);
  if (match === null) {
    return undefined;
  }
  let end = start + match[0].length;
  let args = '';
  if (text[end] === '(') {
    const close = closingIndex(text, end);
    args = text.slice(end + 1, close);
    end = close + 1;
  }
  return {
    annotation: { name: match[1].split('.').at(-1), args: parseArguments(args), raw: args },
    end,
  };
}

function annotationsIn(text) {
  const found = [];
  let consumed = 0;
  for (const match of text.matchAll(AT_ANNOTATION)) {
    if (match.index >= consumed) {
      const { annotation, end } = readAnnotation(text, match.index);
      found.push({ ...annotation, index: match.index, end });
      consumed = end;
    }
  }
  return found;
}

export function trailingAnnotations(text, start) {
  const from = Math.max(0, start - LOOKBACK);
  const found = annotationsIn(text.slice(from, start));
  const chain = [];
  let boundary = start - from;
  for (const annotation of found.reverse()) {
    if (!MODIFIER_GAP.test(text.slice(from + annotation.end, from + boundary))) {
      break;
    }
    chain.push(annotation);
    boundary = annotation.index;
  }
  return chain;
}

function skipStatement(text, from) {
  let skipTo = from;
  for (const token of text.slice(from).matchAll(STATEMENT_TOKEN)) {
    const at = from + token.index;
    if (at < skipTo) {
      continue;
    }
    if (token[0] !== '(') {
      return at + 1;
    }
    skipTo = closingIndex(text, at) + 1;
  }
  return text.length + 1;
}

function declarationAt(text, index, declaration) {
  declaration.lastIndex = index;
  return index < text.length ? (declaration.exec(text) ?? undefined) : undefined;
}

function stepAt(text, index, declaration) {
  const read = text[index] === '@' ? readAnnotation(text, index) : undefined;
  if (read !== undefined) {
    return { annotation: read.annotation, end: read.end };
  }
  const match = declarationAt(text, index, declaration);
  const end =
    match === undefined ? skipStatement(text, index) : Math.max(declaration.lastIndex, index + 1);
  return { match, end };
}

export function scanDeclarations(text, declaration, baseLine = 1) {
  const fields = [];
  let pending = [];
  let next = 0;
  for (const position of [...text].keys()) {
    if (position < next) {
      continue;
    }
    SPACE.lastIndex = position;
    const index = position + (SPACE.exec(text)?.[0].length ?? 0);
    const { annotation, match, end } = stepAt(text, index, declaration);
    if (match !== undefined) {
      fields.push({
        ...match.groups,
        annotations: pending,
        line: baseLine + lineAt(text, index) - 1,
      });
    }
    pending = annotation === undefined ? [] : [...pending, annotation];
    next = end;
  }
  return fields;
}

export function classesIn({ file, source, pattern, build }) {
  const text = blankComments(source);
  return [...text.matchAll(pattern)].map((match) => build(file, text, match));
}

export function fieldsWithAncestors(entity, byName) {
  const seen = new Set();
  const fields = [];
  const queue = [entity];
  for (const current of queue) {
    if (seen.has(current.name)) {
      continue;
    }
    seen.add(current.name);
    fields.push(...current.fields.map((field) => ({ ...field, file: current.file })));
    const parent = byName.get(current.parent);
    queue.push(...(parent === undefined ? [] : [parent]));
  }
  return fields;
}

export function declarationPattern(modifiers, rest) {
  return new RegExp(`(?:(?:${modifiers})\\s+)*${rest}`, 'uy');
}
