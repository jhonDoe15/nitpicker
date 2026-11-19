import { fieldOf } from '../../../../../shared/values/readers.mts';
import { matchingClose } from '../../../../../shared/source-text/brackets/matching-close.mts';

type Declaration = {
  readonly name: string;
  readonly arity: number;
  readonly varargs: boolean;
  readonly body: string;
};
type Call = { readonly name: string; readonly arity: number | undefined };
type Head = { readonly parenStart: number; readonly parenEnd: number; readonly tail: string };
type Found = Declaration & { readonly fluent: boolean };
type Declarations = Map<string, Found[]>;

const CHECK_RETURN_VALUE =
  /^\[CheckReturnValue\] The result of `(?:[\w$]+\.)*([A-Za-z_$][\w$]*)\(([^`]*)\)`/u;
const NOT_A_TYPE_END = new Set([
  'return',
  'new',
  'throw',
  'else',
  'yield',
  'assert',
  'case',
  'await',
]);
const LITERAL =
  /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|"""[\s\S]*?(?:"""|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?/gu;
const LOOKBEHIND = 200;

function blanked(text: string): string {
  return text.replaceAll(LITERAL, (literal) => literal.replaceAll(/[^\n]/gu, ' '));
}

const RETURNS_THIS = /^\(*\s*(?:\([\w$.<>?,\s[\]]+\)\s*)?this\s*\)*$/u;
const SELF_CALL = /^([A-Za-z_$][\w$]*)\(\s*\)$/u;
const NESTED_SCOPE = /->|\bclass\b|\bnew\s[\s\w$.<>,?]+\([^;{}]*\)\s*\{/u;
const THROWS = /^\s*throws\s[\w$.,\s<>]+/u;
const RECORD = /\brecord\s+[\w$]+\s*(?:<[^>{(]*>\s*)?\(/gu;

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (const [index, char] of text.split('').entries()) {
    if ('(<[{'.includes(char)) {
      depth += 1;
    } else if (')>]}'.includes(char)) {
      depth -= 1;
    } else if (char === ',' && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part !== '');
}

function recordAccessors(text: string): Declaration[] {
  return [...text.matchAll(RECORD)].flatMap((match) => {
    const open = match.index + match[0].length - 1;
    const end = matchingClose(text, open, '()');
    const components = end === -1 ? [] : splitTopLevel(text.slice(open + 1, end));
    return components.flatMap((component) => {
      const name = /([\w$]+)\s*$/u.exec(component)?.[1];
      return name === undefined ? [] : [{ name, arity: 0, varargs: false, body: '' }];
    });
  });
}

function isTypeEnd(text: string, match: RegExpExecArray): boolean {
  const index = match.index;
  const before = text.slice(Math.max(0, index - LOOKBEHIND), index).trimEnd();
  const previous = /[\w$]+$/u.exec(before)?.[0];
  return /[\w$>\]]$/u.test(before) && !NOT_A_TYPE_END.has(previous ?? '');
}

function declarationHead(text: string, match: RegExpExecArray): Head | undefined {
  if (!isTypeEnd(text, match)) {
    return undefined;
  }
  const parenStart = match.index + match[0].length - 1;
  const parenEnd = matchingClose(text, parenStart, '()');
  if (parenEnd === -1) {
    return undefined;
  }
  const rest = text.slice(parenEnd + 1);
  const tail = rest.slice(THROWS.exec(rest)?.[0].length ?? 0).trimStart();
  return /^[{;]/u.test(tail) ? { parenStart, parenEnd, tail } : undefined;
}

function declarationAt(text: string, match: RegExpExecArray): Declaration | undefined {
  const head = declarationHead(text, match);
  if (head === undefined) {
    return undefined;
  }
  const parameters = splitTopLevel(text.slice(head.parenStart + 1, head.parenEnd));
  const declared = {
    name: match[1] ?? '',
    arity: parameters.length,
    varargs: (parameters.at(-1) ?? '').includes('...'),
  };
  if (head.tail.startsWith(';')) {
    return { ...declared, body: '' };
  }
  const open = text.length - head.tail.length;
  const end = matchingClose(text, open, '{}');
  return { ...declared, body: end === -1 ? '' : text.slice(open + 1, end) };
}

function returnedValues(body: string): string[] {
  if (body === '' || NESTED_SCOPE.test(body)) {
    return [];
  }
  const returns = [...body.matchAll(/\breturn\b([^;]*);/gu)];
  const count = (body.match(/\breturn\b/gu) ?? []).length;
  return returns.length === count ? returns.map(([, value]) => (value ?? '').trim()) : [];
}

function returnsOnlyThis(body: string, selfReturns: (name: string) => boolean): boolean {
  const values = returnedValues(body);
  return (
    values.length > 0 &&
    values.every((value) => {
      const self = SELF_CALL.exec(value)?.[1];
      return RETURNS_THIS.test(value) || (self !== undefined && selfReturns(self));
    })
  );
}

function fileDeclarations(text: string, names: ReadonlySet<string>): Found[] {
  const pattern = new RegExp(`(?<![\\w$.])([A-Za-z_$][\\w$]*)\\s*\\(`, 'gu');
  const all = [...text.matchAll(pattern)].flatMap((match) => declarationAt(text, match) ?? []);
  function plain(name: string): Declaration[] {
    return all.filter((found) => found.name === name && found.arity === 0 && !found.varargs);
  }
  function selfReturns(name: string): boolean {
    return (
      plain(name).length > 0 && plain(name).every(({ body }) => returnsOnlyThis(body, () => false))
    );
  }
  return [...all, ...recordAccessors(text)]
    .filter(({ name }) => names.has(name))
    .map((found) => ({ ...found, fluent: returnsOnlyThis(found.body, selfReturns) }));
}

function matches(declaration: Declaration, arity: number | undefined): boolean {
  if (arity === undefined) {
    return declaration.arity > 0 || declaration.varargs;
  }
  return declaration.arity === arity || (declaration.varargs && arity >= declaration.arity - 1);
}

function arityOf(inside: string): number | undefined {
  if (inside === '') {
    return 0;
  }
  return inside === '...' ? undefined : splitTopLevel(inside).length;
}

function parsedCall(diagnostic: unknown): Call | undefined {
  const message = fieldOf(diagnostic, 'message');
  if (typeof message !== 'string') {
    return undefined;
  }
  const found = CHECK_RETURN_VALUE.exec(message);
  if (found === null) {
    return undefined;
  }
  return { name: found[1] ?? '', arity: arityOf((found[2] ?? '').trim()) };
}

function isFluentCall({ name, arity }: Call, declarations: Declarations): boolean {
  const same = (declarations.get(name) ?? []).filter((found) => matches(found, arity));
  return same.length > 0 && same.every(({ fluent }) => fluent);
}

function projectDeclarations(
  names: ReadonlySet<string>,
  sources: readonly string[],
  readSource: (file: string) => string,
): Declarations {
  const declarations: Declarations = new Map();
  for (const file of sources) {
    for (const found of fileDeclarations(blanked(readSource(file)), names)) {
      declarations.set(found.name, [...(declarations.get(found.name) ?? []), found]);
    }
  }
  return declarations;
}

export function withoutFluentCalls(
  diagnostics: readonly unknown[],
  { sources, readSource }: { sources: readonly string[]; readSource: (file: string) => string },
): readonly unknown[] {
  const calls = diagnostics.map(parsedCall);
  const names = new Set(calls.flatMap((call) => (call === undefined ? [] : [call.name])));
  if (names.size === 0) {
    return diagnostics;
  }
  const declarations = projectDeclarations(names, sources, readSource);
  return diagnostics.filter((_, index) => {
    const call = calls[index];
    return call === undefined || !isFluentCall(call, declarations);
  });
}
