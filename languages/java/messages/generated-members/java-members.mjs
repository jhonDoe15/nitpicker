import { lineAt, lineStarts } from '../../adapters/doc-comments/doc-scopes.mjs';

const CLASS_HEADER =
  /(?<![\w$.])(class|interface|enum|record|@interface)\s+([A-Za-z_$][\w$]*)(?![\w$])/u;
const TOKEN = /(?<![=!<>+\-*/%&|^])=(?!=)|[(){};]/gu;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;
const ANNOTATION_START = /@\s*([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*/uy;
const MODIFIERS = new Set(
  `public protected private static final transient volatile abstract
  synchronized native strictfp default sealed non-sealed`.split(/\s+/u),
);
const METHOD_NAME = /([A-Za-z_$][\w$]*)\s*\(([^()]*)\)\s*(?:throws\b[^{;]*)?$/u;
const EXTENDS = /\bextends\s+([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)/u;
const GENERIC_DEPTH = { '<': 1, '>': -1 };
const PAREN_DEPTH = { '(': 1, ')': -1 };

function balancedEnd(text, open) {
  let depth = 0;
  for (const [index, character] of [...text.slice(open)].entries()) {
    depth += PAREN_DEPTH[character] ?? 0;
    if (depth === 0) {
      return open + index + 1;
    }
  }
  return text.length;
}

function annotationAt(text, index) {
  ANNOTATION_START.lastIndex = index;
  const match = ANNOTATION_START.exec(text);
  if (match === null || match[1] === 'interface') {
    return undefined;
  }
  const after = index + match[0].length;
  const end = text[after] === '(' ? balancedEnd(text, after) : after;
  return {
    name: match[1].replaceAll(/\s+/gu, ''),
    start: index,
    end,
    argumentsStart: text[after] === '(' ? after + 1 : undefined,
    argumentsEnd: text[after] === '(' ? end - 1 : undefined,
  };
}

function leadingAnnotations(text, from) {
  const annotations = [];
  const positions = [from];
  for (const position of positions) {
    const index = position + (/^\s*/u.exec(text.slice(position))?.[0].length ?? 0);
    const annotation = annotationAt(text, index);
    if (annotation === undefined) {
      return { annotations, end: index };
    }
    annotations.push(annotation);
    positions.push(annotation.end);
  }
  return { annotations, end: from };
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
  const parts = words.split(/\s+/u);
  const count = parts.findIndex((part) => !MODIFIERS.has(part));
  const modifiers = parts.slice(0, Math.max(count, 0));
  const rest = modifiers.reduce(
    (text, modifier) => text.slice(text.indexOf(modifier) + modifier.length),
    words,
  );
  return { modifiers, rest: rest.trim() };
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

function withoutGenerics(text) {
  let depth = 0;
  return [...text]
    .filter((character) => {
      depth += GENERIC_DEPTH[character] ?? 0;
      return depth === 0 && character !== '>';
    })
    .join('');
}

function typeParametersOf(header) {
  const declared = CLASS_HEADER.exec(header);
  const after =
    declared === null ? '' : header.slice(declared.index + declared[0].length).trimStart();
  if (!after.startsWith('<')) {
    return [];
  }
  let depth = 0;
  const close = [...after].findIndex((character) => {
    depth += GENERIC_DEPTH[character] ?? 0;
    return depth === 0;
  });
  const inner = after.slice(1, close < 0 ? after.length : close);
  return splitTopLevel(inner).flatMap((part) => /^[A-Za-z_$][\w$]*/u.exec(part)?.[0] ?? []);
}

function newClass(state, { header, headerStart, bodyStart, kind, name }) {
  const owner = state.frames.at(-1).klass;
  const { annotations } = leadingAnnotations(state.text, headerStart);
  const plain = withoutGenerics(header);
  const superclass =
    kind === 'class' ? (EXTENDS.exec(plain.split(/\bimplements\b/u)[0]) ?? undefined) : undefined;
  const klass = {
    name: owner === undefined ? name : `${owner.name}.${name}`,
    simple: name,
    kind,
    owner,
    annotations,
    line: lineAt(state.starts, headerStart + header.search(/\S/u)),
    extendsName: superclass?.[1].replaceAll(/\s+/gu, ''),
    typeParameters: typeParametersOf(header),
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
  '(': (_state, frame) => {
    frame.parentheses += 1;
  },
  ')': (_state, frame) => {
    frame.parentheses -= 1;
  },
  '=': (_state, frame, offset) => {
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
    reset(state.frames.at(-1), offset + 1);
  }
}

function step(state, token, offset) {
  if (state.skip > 0) {
    skipped(state, token, offset);
    return;
  }
  const frame = state.frames.at(-1);
  if (frame !== undefined) {
    HANDLERS[token](state, frame, offset);
  }
}

export function javaClasses(text) {
  const state = {
    text,
    starts: lineStarts(text),
    classes: [],
    frames: [frameOf(undefined, 0)],
    skip: 0,
  };
  for (const match of text.matchAll(TOKEN)) {
    step(state, match[0], match.index);
  }
  return state.classes;
}
