import { headOf, type Source } from '../source/java-source.mts';
import {
  compact,
  lineOf,
  splitTopLevel,
  type Method,
  type TypeBlock,
} from '../source/java-text.mts';

export type ForwarderKind = 'wrapper' | 'shim';
export type Signature = { readonly types: readonly string[]; readonly names: readonly string[] };
export type Forwarder = {
  readonly kind: ForwarderKind;
  readonly source: Source;
  readonly method: Method;
  readonly owner: TypeBlock;
  readonly signature: Signature;
  readonly returns: string;
  readonly target: string;
  readonly qualifier: string | undefined;
  readonly line: number;
  readonly range: { readonly start: number; readonly end: number };
};
export type Parsed =
  { readonly forwarder: Forwarder } | { readonly declined: string; readonly line: number };

const WRAPPER = 'wrapper';
const BODY =
  /^(?<returned>return\s+)?(?:(?<qualifier>[A-Z]\w*)\s*\.\s*)?(?<target>[A-Za-z_]\w*)\s*\((?<passed>[^()]*)\)\s*;$/u;
const DEPRECATED = /^@Deprecated(?:\([^()]*\))?$/u;
const WRAPPER_EXEMPT = new Set(['main', 'valueOf', 'fromString', 'of', 'from']);
const COPYING_TARGET = /^(?:copyOf|copyOfRange|unmodifiable\w*|synchronized\w*|checked\w*)$/u;
const STEREOTYPES =
  /Component|Service|Repository|Controller|RestController|ControllerAdvice|RestControllerAdvice/u;
const SPRING_STEREOTYPE = new RegExp(
  String.raw`@\s*(?:[a-z]\w*\.)*(?:${STEREOTYPES.source}|Configuration|SpringBootApplication)\b`,
  'u',
);
const FORBIDDEN = new Set(['synchronized', 'native', 'abstract', 'default']);
const DOC_COMMENT_END = /\*\/[ \t]*\r?\n[ \t]*$/u;

const IDENTIFIER = /^[A-Za-z_]\w*$/u;

function parameterOf(part: string): { type: string; name: string } | undefined {
  const words = part.replace(/^final\s+/u, '').split(/\s+/u);
  const name = words.pop() ?? '';
  return IDENTIFIER.test(name) && words.length > 0 ? { type: words.join(' '), name } : undefined;
}

export function signatureOf(parameters: string): Signature | undefined {
  if (parameters.includes('@') || parameters.includes('...')) {
    return undefined;
  }
  const parts = splitTopLevel(parameters).filter((part) => part !== '');
  const parsed = parts.flatMap((part) => parameterOf(part) ?? []);
  return parsed.length === parts.length
    ? { types: parsed.map(({ type }) => compact(type)), names: parsed.map(({ name }) => name) }
    : undefined;
}

function statementStart(text: string, start: number): number {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  return text.slice(lineStart, start).trim() === '' ? lineStart : start;
}

function withDocComment(text: string, from: number): number {
  const before = text.slice(0, from);
  if (!DOC_COMMENT_END.test(before)) {
    return from;
  }
  const close = before.lastIndexOf('*/');
  const open = before.lastIndexOf('/**', close);
  return open === -1 || before.indexOf('*/', open) !== close ? from : statementStart(text, open);
}

function deletion(source: Source, method: Method): { start: number; end: number } {
  const { text } = source;
  const from = withDocComment(text, statementStart(text, method.start));
  const newline = text.indexOf('\n', method.close);
  const to = newline === -1 ? text.length : newline + 1;
  const before = text.slice(0, from);
  const after = text.slice(to);
  const blankBefore = /\n([ \t]*\r?\n)$/u.exec(before);
  const blankAfter = /^[ \t]*\r?\n/u.exec(after);
  if (blankBefore !== null && /^[ \t]*\}/u.test(after)) {
    return { start: from - (blankBefore[1]?.length ?? 0), end: to };
  }
  const opening = /\{[ \t]*\r?\n$/u.test(before);
  return {
    start: from,
    end: (blankBefore !== null || opening) && blankAfter !== null ? to + blankAfter[0].length : to,
  };
}

function ownerOf(source: Source, method: Method): TypeBlock | undefined {
  return source.types.find(({ open, close }) => open < method.start && method.start < close);
}

function annotated(source: Source, owner: TypeBlock): boolean {
  return SPRING_STEREOTYPE.test(headOf(source, owner));
}

function markAt(method: Method): number {
  return method.annotations === '' ? method.nameAt : method.start;
}

function declined(method: Method, source: Source, reason: string): Parsed {
  return { declined: reason, line: lineOf(source.text, markAt(method)) };
}

function shapeProblem(kind: ForwarderKind, method: Method, owner: TypeBlock): string | undefined {
  const { modifiers, annotations } = method;
  const annotationFits = kind === WRAPPER ? annotations === '' : DEPRECATED.test(annotations);
  if (
    !annotationFits ||
    !modifiers.includes('static') ||
    modifiers.some((word) => FORBIDDEN.has(word))
  ) {
    return 'it is not a plain static method of the expected kind';
  }
  if (
    modifiers.includes('public') ||
    modifiers.includes('protected') ||
    owner.kind === 'interface'
  ) {
    return 'it is public or protected, so callers outside the project may exist';
  }
  return method.throws === '' ? undefined : 'it declares thrown exceptions';
}

function sharedLine(source: Source, method: Method): string | undefined {
  const { text, code } = source;
  const lineStart = text.lastIndexOf('\n', method.start - 1) + 1;
  const newline = code.indexOf('\n', method.close);
  const after = code.slice(method.close + 1, newline === -1 ? code.length : newline);
  return text.slice(lineStart, method.start).trim() === '' && after.trim() === ''
    ? undefined
    : 'another declaration shares a line with it';
}

function bodyOf(source: Source, method: Method) {
  return BODY.exec(source.code.slice(method.open + 1, method.close).trim())?.groups;
}

type Pieces = {
  readonly source: Source;
  readonly method: Method;
  readonly owner: TypeBlock;
  readonly signature: Signature | undefined;
  readonly groups: Readonly<Record<string, string | undefined>> | undefined;
};

function isCandidate(kind: ForwarderKind, { source, method, owner, signature, groups }: Pieces) {
  if (kind === 'shim') {
    return method.annotations.startsWith('@Deprecated');
  }
  return (
    method.annotations === '' &&
    method.modifiers.includes('static') &&
    !WRAPPER_EXEMPT.has(method.name) &&
    (signature?.names.length ?? 0) > 0 &&
    !COPYING_TARGET.test(groups?.['target'] ?? '') &&
    groups?.['qualifier'] !== undefined &&
    !annotated(source, owner)
  );
}

function forwards(kind: ForwarderKind, { method, owner, signature, groups }: Pieces): boolean {
  const target = groups?.['target'];
  const qualifier = groups?.['qualifier'];
  const passed = splitTopLevel(groups?.['passed'] ?? '').filter((part) => part !== '');
  const shaped =
    kind === WRAPPER || (target !== method.name && (qualifier ?? owner.name) === owner.name);
  return (
    signature !== undefined &&
    target !== undefined &&
    shaped &&
    (groups?.['returned'] !== undefined) === (method.returns !== 'void') &&
    passed.join(',') === signature.names.join(',')
  );
}

export function parseForwarder(
  kind: ForwarderKind,
  source: Source,
  method: Method,
): Parsed | undefined {
  const owner = ownerOf(source, method);
  if (owner === undefined || method.depth !== 1) {
    return undefined;
  }
  const signature = signatureOf(method.parameters);
  const groups = bodyOf(source, method);
  const pieces = { source, method, owner, signature, groups };
  if (!isCandidate(kind, pieces)) {
    return undefined;
  }
  const problem = shapeProblem(kind, method, owner) ?? sharedLine(source, method);
  if (problem !== undefined || signature === undefined || !forwards(kind, pieces)) {
    return declined(method, source, problem ?? 'it does more than pass its parameters on in order');
  }
  return {
    forwarder: {
      kind,
      source,
      method,
      owner,
      signature,
      returns: compact(method.returns),
      target: groups?.['target'] ?? '',
      qualifier: groups?.['qualifier'],
      line: lineOf(source.text, markAt(method)),
      range: deletion(source, method),
    },
  };
}
