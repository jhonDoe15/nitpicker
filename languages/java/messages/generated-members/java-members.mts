import { lineAt, lineStarts } from '../../adapters/doc-comments/doc-scopes.mts';
import { GENERIC_DEPTH, PAREN_DEPTH, closingByDepth } from '../../source/frames/bracket-depths.mts';
import { frameOperations } from '../../source/frames/member-frames.mts';
import type {
  Annotation,
  Frame,
  Handler,
  JavaClass,
  JavaField,
  JavaMethod,
  State,
} from './member-types.mts';

const { braceHeader, dispatchToken, leaveBrace, resetMember } = frameOperations();

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

function balancedEnd(text: string, open: number): number {
  const close = closingByDepth(text, open, PAREN_DEPTH);
  return close < 0 ? text.length : close + 1;
}

function annotationAt(text: string, index: number): Annotation | undefined {
  ANNOTATION_START.lastIndex = index;
  const match = ANNOTATION_START.exec(text);
  if (match === null || match[1] === 'interface') {
    return undefined;
  }
  const after = index + match[0].length;
  const end = text[after] === '(' ? balancedEnd(text, after) : after;
  return {
    name: (match[1] ?? '').replaceAll(/\s+/gu, ''),
    start: index,
    end,
    argumentsStart: text[after] === '(' ? after + 1 : undefined,
    argumentsEnd: text[after] === '(' ? end - 1 : undefined,
  };
}

function leadingAnnotations(
  text: string,
  from: number,
): { annotations: Annotation[]; end: number } {
  const annotations: Annotation[] = [];
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

function splitTopLevel(text: string): string[] {
  const parts = [''];
  let depth = 0;
  for (const character of text) {
    depth += GENERIC_DEPTH[character] ?? 0;
    if (depth === 0 && character === ',') {
      parts.push('');
    } else {
      parts[parts.length - 1] = (parts.at(-1) ?? '') + character;
    }
  }
  return parts.map((part) => part.trim());
}

function withoutModifiers(words: string): { modifiers: string[]; rest: string } {
  const parts = words.split(/\s+/u);
  const count = parts.findIndex((part) => !MODIFIERS.has(part));
  const modifiers = parts.slice(0, Math.max(count, 0));
  const rest = modifiers.reduce(
    (text, modifier) => text.slice(text.indexOf(modifier) + modifier.length),
    words,
  );
  return { modifiers, rest: rest.trim() };
}

function declaratorName(text: string): string | undefined {
  const name = text.replaceAll(/\[\s*\]/gu, '').trim();
  return IDENTIFIER.test(name) ? name : undefined;
}

function fieldsOf({
  text,
  start,
  end,
  starts,
}: {
  text: string;
  start: number;
  end: number;
  starts: number[];
}): JavaField[] {
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
  const headType = head[1] ?? '';
  const declarators = [head[2] ?? '', ...others.map((other) => other.split(/\s/u)[0] ?? '')];
  let searchFrom = afterAnnotations + declaration.indexOf(rest) + headType.length;
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
        type: `${headType.trim()}${declarator.includes('[') ? '[]' : ''}`,
        modifiers,
        annotations,
        line: lineAt(starts, offset),
        offset,
      },
    ];
  });
}

function methodOf(header: string): JavaMethod | undefined {
  const match = METHOD_NAME.exec(header.trim());
  if (match === null) {
    return undefined;
  }
  const argumentsText = match[2] ?? '';
  const parameters = argumentsText.trim() === '' ? 0 : splitTopLevel(argumentsText).length;
  return { name: match[1] ?? '', parameters };
}

function withoutGenerics(text: string): string {
  let depth = 0;
  return Array.from(text)
    .filter((character) => {
      depth += GENERIC_DEPTH[character] ?? 0;
      return depth === 0 && character !== '>';
    })
    .join('');
}

function typeParametersOf(header: string): string[] {
  const declared = CLASS_HEADER.exec(header);
  const after =
    declared === null ? '' : header.slice(declared.index + declared[0].length).trimStart();
  if (!after.startsWith('<')) {
    return [];
  }
  const close = closingByDepth(after, 0, GENERIC_DEPTH);
  const inner = after.slice(1, close < 0 ? after.length : close);
  return splitTopLevel(inner).flatMap((part) => /^[A-Za-z_$][\w$]*/u.exec(part)?.[0] ?? []);
}

function newClass(
  state: State,
  {
    header,
    headerStart,
    bodyStart,
    kind,
    name,
  }: { header: string; headerStart: number; bodyStart: number; kind: string; name: string },
): JavaClass {
  const owner = state.frames.at(-1)?.klass;
  const { annotations } = leadingAnnotations(state.text, headerStart);
  const plain = withoutGenerics(header);
  const superclass =
    kind === 'class'
      ? (EXTENDS.exec(plain.split(/\bimplements\b/u)[0] ?? '') ?? undefined)
      : undefined;
  const klass: JavaClass = {
    name: owner === undefined ? name : `${owner.name}.${name}`,
    simple: name,
    kind,
    owner,
    annotations,
    line: lineAt(state.starts, headerStart + header.search(/\S/u)),
    extendsName: superclass?.[1]?.replaceAll(/\s+/gu, ''),
    typeParameters: typeParametersOf(header),
    bodyStart,
    fields: [],
    methods: [],
  };
  state.classes.push(klass);
  return klass;
}

function frameOf(klass: JavaClass | undefined, memberStart: number): Frame {
  return { klass, memberStart, parentheses: 0, equals: -1, braces: 0 };
}

function recordMember(state: State, frame: Frame, offset: number): void {
  const { klass } = frame;
  if (klass === undefined) {
    return;
  }
  const end = frame.equals < 0 ? offset : frame.equals;
  const method = methodOf(state.text.slice(frame.memberStart, end));
  if (method === undefined) {
    for (const field of fieldsOf({ ...state, start: frame.memberStart, end })) {
      klass.fields.push(field);
    }
  } else {
    klass.methods.push(method);
  }
}

function onSemicolon(state: State, frame: Frame, offset: number): void {
  if (frame.parentheses !== 0 || frame.braces !== 0) {
    return;
  }
  recordMember(state, frame, offset);
  resetMember(frame, offset + 1);
}

function onOpenBrace(state: State, frame: Frame, offset: number): void {
  const header = braceHeader(state.text, frame, offset);
  if (header === undefined) {
    return;
  }
  const declared = CLASS_HEADER.exec(header);
  if (declared === null) {
    const method = frame.klass === undefined ? undefined : methodOf(header);
    if (method !== undefined && frame.klass !== undefined) {
      frame.klass.methods.push(method);
    }
    state.skip = 1;
    return;
  }
  const kind = declared[1] === '@interface' ? 'annotation' : (declared[1] ?? '');
  const klass = newClass(state, {
    header,
    headerStart: frame.memberStart,
    bodyStart: offset + 1,
    kind,
    name: declared[2] ?? '',
  });
  state.frames.push(frameOf(klass, offset + 1));
}

const HANDLERS: Record<string, Handler> = {
  '{': onOpenBrace,
  '}': (state, frame, offset) => {
    leaveBrace(state.frames, frame, offset);
  },
  ';': onSemicolon,
};

function skipped(state: State, token: string, offset: number): void {
  state.skip += token === '{' ? 1 : 0;
  state.skip -= token === '}' ? 1 : 0;
  if (state.skip === 0) {
    const top = state.frames.at(-1);
    if (top !== undefined) {
      resetMember(top, offset + 1);
    }
  }
}

export function javaClasses(text: string): JavaClass[] {
  const state: State = {
    text,
    starts: lineStarts(text),
    classes: [],
    frames: [frameOf(undefined, 0)],
    skip: 0,
  };
  for (const { 0: token, index: offset } of text.matchAll(TOKEN)) {
    if (state.skip > 0) {
      skipped(state, token, offset);
    } else {
      dispatchToken({ state, frame: state.frames.at(-1), handler: HANDLERS[token], token, offset });
    }
  }
  return state.classes;
}
