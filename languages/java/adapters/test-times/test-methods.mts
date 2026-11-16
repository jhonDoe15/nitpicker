import { escapeRegExp as escapedText } from '../../../../shared/paths/glob.mjs';

const escapeRegExp: (value: string) => string = escapedText;

const CALL = /^(.+?)\((?:[^()]|\([^()]*\))*\)(?:\[\d+\])?$/u;
const INDEXED = /^([\p{L}_$][\p{L}\p{N}_$]*)\[\d+\]$/u;
const DECLARED_NAME = String.raw`(\x60[^\x60]+\x60|"[^"\n]+"|'[^'\n]+'|[\p{L}_$][\p{L}\p{N}_$]*)`;
const NAME_QUOTES = /^[\x60"']|[\x60"']$/gu;
const DYNAMIC_TYPE_FORMS = String.raw`[\w.]+\s*<[^;{}()]*Dynamic\w*\s*>|Dynamic\w*(?:\[\])?`;
const DECLARATION = new RegExp(
  String.raw`(?:\b(?:void|fun|def)|${DYNAMIC_TYPE_FORMS})\s+${DECLARED_NAME}\s*\(`,
  'gu',
);
const CLASS_DECLARATION = /\bclass\s+([\p{L}_$][\p{L}\p{N}_$]*)/gu;
const TEMPLATE_ANNOTATION = /@(?:ParameterizedTest|RepeatedTest|TestFactory|TestTemplate)\b/gu;
const ANNOTATION_LINE = /^\s*@/u;
const BRACES_OUTSIDE_LITERALS = /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|[{}]/gu;
const BRACE_DEPTH: Readonly<Record<string, number>> = { '{': 1, '}': -1 };
const SPOCK_DECLARATION = /^def\s/u;
const ITERATION_SUFFIX = / \[[^\]]*#\d+\]$/u;
const PLACEHOLDER = /#[\p{L}_$][\p{L}\p{N}_$.]*(?:\(\))?/u;
const WHERE_BLOCK = /^where:/mu;

type Scope = { readonly start: number; readonly end: number; readonly classBody: boolean };
type ClassRange = {
  readonly name: string | undefined;
  readonly start: number;
  readonly end: number;
};
type Declaration = { readonly name: string; readonly index: number; readonly spock: boolean };
type MethodBlock = { readonly line: number; readonly text: string };

function quoted(text: string): string {
  return JSON.stringify(text).slice(1, -1);
}

function closingBrace(text: string, from: number): number {
  const open = text.indexOf('{', from);
  if (open < 0) {
    return text.length - 1;
  }
  let depth = 0;
  for (const token of text.slice(open).matchAll(BRACES_OUTSIDE_LITERALS)) {
    depth += BRACE_DEPTH[token[0]] ?? 0;
    if (depth === 0) {
      return open + token.index;
    }
  }
  return text.length - 1;
}

function classesIn(text: string, scope: Scope): ClassRange[] {
  return [...text.slice(scope.start, scope.end).matchAll(CLASS_DECLARATION)].map((match) => {
    const index = scope.start + match.index;
    return { name: match[1], start: text.indexOf('{', index), end: closingBrace(text, index) };
  });
}

function outermostClasses(text: string, scope: Scope): ClassRange[] {
  const classes = classesIn(text, scope).filter(({ start }) => start >= 0);
  return classes.filter(
    (inner) =>
      !classes.some(
        (outer) => outer !== inner && outer.start < inner.start && inner.end < outer.end,
      ),
  );
}

function scopeOf(text: string, className: string | undefined): Scope | undefined {
  const names = (className ?? '').split('.').pop()?.split('$') ?? [];
  let scope: Scope = { start: 0, end: text.length, classBody: false };
  for (const [index, name] of names.entries()) {
    const body = outermostClasses(text, scope).find((range) => range.name === name);
    if (body === undefined && index > 0) {
      return undefined;
    }
    scope = body === undefined ? scope : { start: body.start + 1, end: body.end, classBody: true };
  }
  return scope;
}

function declarations(text: string, scope: Scope): Declaration[] {
  const nested = scope.classBody ? outermostClasses(text, scope) : [];
  return [...text.slice(scope.start, scope.end).matchAll(DECLARATION)]
    .map((match) => ({
      name: (match[1] ?? '').replace(NAME_QUOTES, ''),
      index: scope.start + match.index,
      spock: SPOCK_DECLARATION.test(match[0]),
    }))
    .filter(({ index }) => !nested.some((range) => range.start < index && index < range.end));
}

function namedByDisplayName(
  text: string,
  { name, scope, found }: { name: string; scope: Scope; found: readonly Declaration[] },
): Declaration | undefined {
  const annotation = text.indexOf(`@DisplayName("${quoted(name)}")`, scope.start);
  return annotation < 0 || annotation > scope.end
    ? undefined
    : found.find((declaration) => declaration.index > annotation);
}

function unrolledFrom(declaration: Declaration, testName: string): boolean {
  if (!declaration.spock) {
    return false;
  }
  const pattern = declaration.name.split(PLACEHOLDER).map(escapeRegExp).join('.*');
  return new RegExp(`^${pattern}$`, 'u').test(testName.replace(ITERATION_SUFFIX, ''));
}

function methodBlock(text: string, declaration: Declaration): MethodBlock {
  const lines = text.slice(0, declaration.index).split('\n');
  const declarationLine = lines.length;
  const annotations = lines.slice(0, -1).reverse();
  const firstAnnotation = annotations.findIndex((line) => !ANNOTATION_LINE.test(line));
  const above = firstAnnotation < 0 ? annotations.length : firstAnnotation;
  const start = text
    .split('\n')
    .slice(0, declarationLine - 1 - above)
    .join('\n').length;
  const end = closingBrace(text, declaration.index);
  return {
    line: declarationLine,
    text: text
      .slice(start, end + 1)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n'),
  };
}

export function testMethod(
  text: string,
  testName: string,
  className?: string,
): MethodBlock | undefined {
  const scope = scopeOf(text, className);
  if (scope === undefined) {
    return undefined;
  }
  const found = declarations(text, scope);
  const candidates = [CALL.exec(testName)?.[1], INDEXED.exec(testName)?.[1], testName];
  const declaration =
    found.find((entry) => candidates.includes(entry.name)) ??
    found.find((entry) => unrolledFrom(entry, testName)) ??
    namedByDisplayName(text, { name: testName, scope, found });
  return declaration === undefined ? undefined : methodBlock(text, declaration);
}

export function templateMethods(text: string, className?: string): string {
  const scope = scopeOf(text, className) ?? { start: 0, end: text.length, classBody: false };
  const found = declarations(text, scope);
  const annotated = [...text.slice(scope.start, scope.end).matchAll(TEMPLATE_ANNOTATION)]
    .map((match) => found.find((declaration) => declaration.index > scope.start + match.index))
    .filter((declaration) => declaration !== undefined)
    .map((declaration) => methodBlock(text, declaration).text);
  const dataDriven = found
    .filter((declaration) => declaration.spock)
    .map((declaration) => methodBlock(text, declaration).text)
    .filter((block) => WHERE_BLOCK.test(block));
  return [...annotated, ...dataDriven].join('\n');
}
