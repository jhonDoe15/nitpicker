const CLASS_HEADER =
  /(?<![\w$.])(class|interface|enum|record|@interface)\s+([A-Za-z_$][\w$]*)(?![\w$])/u;
const TOKEN = /(?<![=!<>+\-*/%&|^])=(?!=)|[(){};]/gu;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;
const ANNOTATION_START = /@\s*([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*/uy;
const MODIFIERS = new Set([
  'public',
  'protected',
  'private',
  'static',
  'final',
  'transient',
  'volatile',
  'abstract',
  'synchronized',
  'native',
  'strictfp',
  'default',
  'sealed',
  'non-sealed',
]);
const METHOD_NAME = /([A-Za-z_$][\w$]*)\s*\(([^()]*)\)\s*(?:throws\b[^{;]*)?$/u;
const EXTENDS = /\bextends\s+([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)/u;
const GENERIC_DEPTH = { '<': 1, '>': -1 };
const PAREN_DEPTH = { '(': 1, ')': -1 };

export function lineStarts(text) {
  const starts = [0];
  for (const [index, character] of [...text].entries()) {
    if (character === '\n') {
      starts.push(index + 1);
    }
  }
  return starts;
}

export function lineAt(starts, offset) {
  return starts.findLastIndex((start) => start <= offset) + 1;
}

function balancedEnd(text, open) {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    depth += PAREN_DEPTH[text[index]] ?? 0;
    if (depth === 0) {
      return index + 1;
    }
  }
  return text.length;
}

export function leadingAnnotations(text, from) {
  const annotations = [];
  let index = from;
  for (;;) {
    while (/\s/u.test(text[index] ?? '')) {
      index += 1;
    }
    ANNOTATION_START.lastIndex = index;
    const match = ANNOTATION_START.exec(text);
    if (match === null || match[1] === 'interface') {
      return { annotations, end: index };
    }
    const after = index + match[0].length;
    const end = text[after] === '(' ? balancedEnd(text, after) : after;
    annotations.push({
      name: match[1].replaceAll(/\s+/gu, ''),
      start: index,
      argumentsStart: text[after] === '(' ? after + 1 : undefined,
      argumentsEnd: text[after] === '(' ? end - 1 : undefined,
    });
    index = end;
  }
}

function splitTopLevel(text) {
  const parts = [''];
  let depth = 0;
  for (const character of text) {
    depth += GENERIC_DEPTH[character] ?? 0;
    if (depth === 0 && character === ',') {
      parts.push('');
    } else {
      parts[parts.length - 1] += character;
    }
  }
  return parts.map((part) => part.trim());
}

function withoutModifiers(words) {
  let rest = words;
  const modifiers = [];
  for (;;) {
    const word = /^(\S+)\s+/u.exec(rest);
    if (word === null || !MODIFIERS.has(word[1])) {
      return { modifiers, rest };
    }
    modifiers.push(word[1]);
    rest = rest.slice(word[0].length);
  }
}

function declaratorName(text) {
  const name = text.replaceAll(/\[\s*\]/gu, '').trim();
  return IDENTIFIER.test(name) ? name : undefined;
}

function fieldsOf({ text, start, end, starts }) {
  const { annotations, end: afterAnnotations } = leadingAnnotations(text, start);
  const declaration = text.slice(afterAnnotations, end);
  if (declaration.includes('(')) {
    return [];
  }
  const { modifiers, rest } = withoutModifiers(declaration.trim());
  const [first, ...others] = splitTopLevel(rest);
  const head = /^([\s\S]*?[\w$>\]?])\s+([A-Za-z_$][\w$]*(?:\s*\[\s*\])*)$/u.exec(first ?? '');
  if (head === null) {
    return [];
  }
  const declarators = [head[2], ...others.map((other) => other.split(/\s/u)[0])];
  let searchFrom = afterAnnotations + declaration.indexOf(rest) + head[1].length;
  return declarators.flatMap((declarator) => {
    const name = declaratorName(declarator);
    if (name === undefined) {
      return [];
    }
    const offset = text.indexOf(name, searchFrom);
    searchFrom = offset + name.length;
    return [
      {
        name,
        type: `${head[1].trim()}${declarator.includes('[') ? '[]' : ''}`,
        modifiers,
        annotations,
        line: lineAt(starts, offset),
        offset,
      },
    ];
  });
}

function methodOf(header) {
  const match = METHOD_NAME.exec(header.trim());
  if (match === null) {
    return undefined;
  }
  const parameters = match[2].trim() === '' ? 0 : splitTopLevel(match[2]).length;
  return { name: match[1], parameters };
}

function newClass(state, { header, headerStart, bodyStart, kind, name }) {
  const owner = state.frames.at(-1).klass;
  const { annotations } = leadingAnnotations(state.text, headerStart);
  const superclass = kind === 'class' ? EXTENDS.exec(header.split(/\bimplements\b/u)[0]) : null;
  const klass = {
    name: owner === undefined ? name : `${owner.name}.${name}`,
    simple: name,
    kind,
    owner,
    annotations,
    line: lineAt(state.starts, headerStart + header.search(/\S/u)),
    extendsName: superclass?.[1].replaceAll(/\s+/gu, ''),
    bodyStart,
    fields: [],
    methods: [],
  };
  state.classes.push(klass);
  return klass;
}

function frameOf(klass, memberStart) {
  return { klass, memberStart, parentheses: 0, equals: -1, braces: 0 };
}

function reset(frame, memberStart) {
  Object.assign(frame, { memberStart, parentheses: 0, equals: -1, braces: 0 });
}

function onSemicolon(state, frame, offset) {
  if (frame.parentheses !== 0 || frame.braces !== 0) {
    return;
  }
  if (frame.klass !== undefined) {
    const end = frame.equals < 0 ? offset : frame.equals;
    const header = state.text.slice(frame.memberStart, end);
    const method = methodOf(header);
    if (method === undefined) {
      frame.klass.fields.push(...fieldsOf({ ...state, start: frame.memberStart, end }));
    } else {
      frame.klass.methods.push(method);
    }
  }
  reset(frame, offset + 1);
}

function onOpenBrace(state, frame, offset) {
  if (frame.parentheses !== 0 || frame.equals >= 0 || frame.braces !== 0) {
    frame.braces += 1;
    return;
  }
  const header = state.text.slice(frame.memberStart, offset);
  const declared = CLASS_HEADER.exec(header);
  if (declared === null) {
    const method = frame.klass === undefined ? undefined : methodOf(header);
    if (method !== undefined) {
      frame.klass.methods.push(method);
    }
    state.skip = 1;
    return;
  }
  const kind = declared[1] === '@interface' ? 'annotation' : declared[1];
  const klass = newClass(state, {
    header,
    headerStart: frame.memberStart,
    bodyStart: offset + 1,
    kind,
    name: declared[2],
  });
  state.frames.push(frameOf(klass, offset + 1));
}

function onCloseBrace(state, frame, offset) {
  if (frame.braces > 0) {
    frame.braces -= 1;
    return;
  }
  state.frames.pop();
  const parent = state.frames.at(-1);
  if (parent !== undefined) {
    reset(parent, offset + 1);
  }
}

const HANDLERS = {
  '(': (state, frame) => {
    frame.parentheses += 1;
  },
  ')': (state, frame) => {
    frame.parentheses -= 1;
  },
  '=': (state, frame, offset) => {
    if (frame.parentheses === 0 && frame.equals < 0) {
      frame.equals = offset;
    }
  },
  '{': onOpenBrace,
  '}': onCloseBrace,
  ';': onSemicolon,
};

function skipped(state, token, offset) {
  state.skip += token === '{' ? 1 : 0;
  state.skip -= token === '}' ? 1 : 0;
  if (state.skip === 0) {
    state.skip = undefined;
    reset(state.frames.at(-1), offset + 1);
  }
}

export function javaClasses(text) {
  const state = {
    text,
    starts: lineStarts(text),
    classes: [],
    frames: [frameOf(undefined, 0)],
    skip: undefined,
  };
  for (const match of text.matchAll(TOKEN)) {
    if (state.skip !== undefined) {
      skipped(state, match[0], match.index);
    } else if (state.frames.length > 0) {
      HANDLERS[match[0]](state, state.frames.at(-1), match.index);
    }
  }
  return state.classes;
}
