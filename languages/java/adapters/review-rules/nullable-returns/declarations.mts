import { forward, splitTopLevel } from '../max-value-sums/source-file.mts';
import type { Frame, SourceFile } from '../max-value-sums/sum-types.mts';
import type { Token } from '../../reuse/jvm-reuse-types.mts';

export type Nullable = { readonly why: 'return' | 'local' | 'javadoc'; readonly line: number };

export type MethodInfo = {
  readonly name: string;
  readonly arity: number;
  readonly returnType: string;
  readonly frame: Frame;
  readonly annotations: readonly string[];
  readonly varargs: boolean;
};

export type ClassInfo = {
  readonly name: string;
  readonly qualified: string;
  readonly nested: boolean;
  readonly open: number;
  readonly derived: boolean;
  readonly methods: readonly MethodInfo[];
  readonly fields: ReadonlyMap<string, string>;
};

export type Declared = {
  readonly name: string;
  readonly type: string;
  readonly at: number;
  readonly index: number;
};

const TYPE_KEYWORDS = new Set(['class', 'interface', 'enum', 'record']);
const MODIFIERS = new Set([
  'public',
  'protected',
  'private',
  'static',
  'final',
  'abstract',
  'synchronized',
  'native',
  'default',
  'strictfp',
]);
const NOT_TYPES = new Set(['return', 'else', 'new', 'throw', 'case', 'var', 'instanceof']);
const AFTER_NAME = new Set(['=', ';', ':', ',', ')']);
const BEFORE_DECLARATION = new Set([';', '{', '}', '(', 'final', ')']);
const BOUNDARIES = new Set([';', '{', '}']);

function qualifiedStart(tokens: readonly Token[], last: number): number {
  let start = last;
  while (tokens[start - 1]?.text === '.' && tokens[start - 2]?.kind === 'identifier') {
    start -= 2;
  }
  return start;
}

export function typeBefore(tokens: readonly Token[], nameIndex: number): Declared | undefined {
  let at = nameIndex - 1;
  if (tokens[at]?.text === '>') {
    let depth = 0;
    while (at >= 0 && !(depth === 1 && tokens[at]?.text === '<')) {
      depth += tokens[at]?.text === '>' ? 1 : tokens[at]?.text === '<' ? -1 : 0;
      at -= 1;
    }
    at -= 1;
  }
  const type = tokens[at];
  const name = tokens[nameIndex];
  if (type?.kind !== 'identifier' || NOT_TYPES.has(type.text) || name === undefined) {
    return undefined;
  }
  return { name: name.text, type: type.text, at: qualifiedStart(tokens, at), index: nameIndex };
}

function declarationAt(source: SourceFile, index: number, member = false): Declared | undefined {
  const { tokens } = source;
  const after = tokens[index + 1]?.text ?? '';
  if (tokens[index]?.kind !== 'identifier' || !AFTER_NAME.has(after)) {
    return undefined;
  }
  const declared = typeBefore(tokens, index);
  const before = tokens[(declared?.at ?? 0) - 1];
  const annotated = before?.kind === 'identifier' && tokens[(declared?.at ?? 0) - 2]?.text === '@';
  const modifier = member && MODIFIERS.has(before?.text ?? '');
  const typed =
    before !== undefined && (BEFORE_DECLARATION.has(before.text) || annotated || modifier);
  return typed ? declared : undefined;
}

export function declaredIn(source: SourceFile, frame: Frame): Declared[] {
  const { tokens, partner } = source;
  const close = partner[frame.open] ?? frame.open;
  const params = splitTopLevel(source, { from: frame.open + 1, to: close }).flatMap((span) => {
    const declared = typeBefore(tokens, span.to - 1);
    return declared === undefined ? [] : [{ ...declared, index: frame.open }];
  });
  const locals = tokens
    .slice(frame.body.from, frame.body.to)
    .flatMap((_, offset) => declarationAt(source, frame.body.from + offset) ?? []);
  return [...params, ...locals];
}

function classBody(source: SourceFile, keyword: number): number {
  for (const { index } of forward(source, keyword + 2)) {
    const text = source.tokens[index]?.text;
    if (text === '{') {
      return index;
    }
    if (text === ';' || text === undefined) {
      return -1;
    }
  }
  return -1;
}

function methodHeader(tokens: readonly Token[], nameIndex: number): Token[] {
  let from = nameIndex;
  while (from > 0 && !BOUNDARIES.has(tokens[from - 1]?.text ?? ';')) {
    from -= 1;
  }
  return tokens.slice(from, nameIndex);
}

function annotationsOf(header: readonly Token[]): string[] {
  return header.flatMap((token, index) =>
    header[index - 1]?.text === '@' && token.kind === 'identifier' ? [token.text] : [],
  );
}

function returnTypeOf(header: readonly Token[]): string {
  const kept: string[] = [];
  let depth = 0;
  for (const [index, { text }] of header.entries()) {
    const annotation = header[index - 1]?.text === '@' || text === '@';
    const argument = depth > 0 || text === '(';
    depth += text === '(' ? 1 : text === ')' ? -1 : 0;
    if (!annotation && !argument && !MODIFIERS.has(text) && text !== ')') {
      kept.push(text);
    }
  }
  const generic = kept[0] === '<' ? kept.indexOf('>') : -1;
  return kept.slice(generic + 1).join('');
}

function methodOf(source: SourceFile, frame: Frame): MethodInfo | undefined {
  const { tokens } = source;
  const header = methodHeader(tokens, frame.open - 1);
  const returnType = returnTypeOf(header);
  if (returnType === '') {
    return undefined;
  }
  const close = source.partner[frame.open] ?? frame.open;
  return {
    name: frame.name,
    arity: frame.params.length,
    returnType,
    frame,
    annotations: annotationsOf(header),
    varargs: tokens.slice(frame.open, close).some(({ text }) => text === '...'),
  };
}

function declaredWithoutBody(source: SourceFile, index: number): boolean {
  const { tokens, partner } = source;
  const close = partner[index + 1] ?? -1;
  const previous = tokens[index - 1];
  const header = methodHeader(tokens, index);
  const typed = previous?.kind === 'identifier' || previous?.text === '>' || previous?.text === ']';
  let end = close + 1;
  while (end > 0 && end < tokens.length && !['{', ';'].includes(tokens[end]?.text ?? ';')) {
    end += 1;
  }
  return (
    tokens[index]?.kind === 'identifier' &&
    tokens[index + 1]?.text === '(' &&
    close > 0 &&
    typed &&
    !NOT_TYPES.has(previous?.text ?? '') &&
    !header.some(({ text }) => text === '=' || text === 'new') &&
    tokens[end]?.text === ';'
  );
}

function bodilessMethods(source: SourceFile, open: number): MethodInfo[] {
  const { tokens, partner, opener } = source;
  const methods: MethodInfo[] = [];
  for (let index = open + 1; index < (partner[open] ?? 0); index += 1) {
    if (opener[index] === open && declaredWithoutBody(source, index)) {
      const close = partner[index + 1] ?? index;
      const params = splitTopLevel(source, { from: index + 2, to: close }).map((span) => ({
        name: tokens[span.to - 1]?.text ?? '',
      }));
      const frame = {
        open: index + 1,
        body: { from: close + 1, to: close + 1 },
        name: tokens[index]?.text ?? '',
        params,
      };
      const header = methodHeader(tokens, index);
      methods.push({
        name: frame.name,
        arity: params.length,
        returnType: returnTypeOf(header),
        frame,
        annotations: annotationsOf(header),
        varargs: tokens.slice(index + 1, close).some(({ text }) => text === '...'),
      });
    }
  }
  return methods.filter((method) => method.returnType !== '');
}

function fieldsOf(source: SourceFile, open: number): Map<string, string> {
  const { tokens, partner, opener } = source;
  const fields = new Map<string, string>();
  for (let index = open + 1; index < (partner[open] ?? 0); index += 1) {
    const declared = opener[index] === open ? declarationAt(source, index, true) : undefined;
    const after = tokens[index + 1]?.text;
    if (declared !== undefined && (after === '=' || after === ';')) {
      fields.set(declared.name, declared.type);
    }
  }
  return fields;
}

function enclosingName(source: SourceFile, found: readonly ClassInfo[], open: number): string {
  for (let at = source.opener[open] ?? -1; at >= 0; at = source.opener[at] ?? -1) {
    const outer = found.find((cls) => cls.open === at);
    if (outer !== undefined) {
      return `${outer.qualified}.`;
    }
  }
  return '';
}

export function classesOf(source: SourceFile, pkg: string): ClassInfo[] {
  const { tokens } = source;
  const found: ClassInfo[] = [];
  for (const [index, token] of tokens.entries()) {
    const named = tokens[index + 1];
    const open =
      TYPE_KEYWORDS.has(token.text) &&
      named?.kind === 'identifier' &&
      tokens[index - 1]?.text !== '.'
        ? classBody(source, index)
        : -1;
    if (open >= 0 && named !== undefined) {
      const outer = enclosingName(source, found, open);
      const methods = source.frames
        .filter((frame) => source.opener[frame.open - 1] === open)
        .flatMap((frame) => methodOf(source, frame) ?? []);
      const abstractMethods = bodilessMethods(source, open);
      const derived = tokens
        .slice(index + 2, open)
        .some(({ text }) => text === 'extends' || text === 'implements');
      const prefix = outer === '' && pkg !== '' ? `${pkg}.` : outer;
      found.push({
        name: named.text,
        qualified: `${prefix}${named.text}`,
        nested: outer !== '',
        open,
        derived,
        methods: [...methods, ...abstractMethods],
        fields: fieldsOf(source, open),
      });
    }
  }
  return found;
}
