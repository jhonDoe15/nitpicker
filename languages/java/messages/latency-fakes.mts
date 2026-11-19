import { existsSync } from 'node:fs';
import {
  importsOf,
  offsetOf,
  packageOf,
  pathInside,
  readJavaSource,
} from '../adapters/review-rules/java-sources.mts';
import { closingByDepth } from '../source/frames/bracket-depths.mts';

type Candidate = { open: number; supertypes: string[] };
type Enclosing = Candidate & { close: number };
type FakeFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly location?: { readonly line?: number } | undefined;
};

const NAMED_TYPE = /\b(?:class|record|enum)\s+[A-Za-z_$][\w$]*/gu;
const ANONYMOUS_TYPE = /\bnew\s+([A-Za-z_$][\w$.]*)\s*(?:<[^;{}()]*>\s*)?\(/gu;
const GENERICS = /<(?:[^<>]|<(?:[^<>]|<[^<>]*>)*>)*>/gu;
const WAIT_CALL = /\b(?:sleep|parkNanos|join|wait)\s*\(/u;
const SUPERTYPES = /\b(?:extends|implements)\b([\s\S]*)$/u;
const SUPERTYPE_SEPARATOR = /\s*(?:,|\bimplements\b)\s*/u;
const TEST_ANNOTATION = /@(?:Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate)\b/u;
const SOURCE_EXTENSIONS = ['.java', '.kt'];
const BRACKETS: Record<string, number> = { '{': 1, '(': 1, '}': -1, ')': -1 };

function closingOf(text: string, open: number): number {
  const close = closingByDepth(text, open, BRACKETS);
  return close < 0 ? text.length : close;
}

function namedTypes(text: string): Candidate[] {
  return [...text.matchAll(NAMED_TYPE)].flatMap((match) => {
    const open = text.indexOf('{', match.index);
    const header = text.slice(match.index + match[0].length, open).replaceAll(GENERICS, '');
    const supertypes = SUPERTYPES.exec(header.replaceAll(/\([^()]*\)/gu, ' '))?.[1] ?? '';
    return open < 0 ? [] : [{ open, supertypes: supertypes.split(SUPERTYPE_SEPARATOR) }];
  });
}

function anonymousTypes(text: string): Candidate[] {
  return [...text.matchAll(ANONYMOUS_TYPE)].flatMap((match) => {
    const argumentsStart = match.index + match[0].length - 1;
    const after = closingOf(text, argumentsStart) + 1;
    const open = after + (/^\s*/u.exec(text.slice(after))?.[0].length ?? 0);
    return text[open] === '{' ? [{ open, supertypes: [match[1] ?? ''] }] : [];
  });
}

function enclosingType(text: string, offset: number): Enclosing | undefined {
  return [...namedTypes(text), ...anonymousTypes(text)]
    .map((type) => ({ ...type, close: closingOf(text, type.open) }))
    .filter(({ open, close }) => open < offset && offset < close)
    .reduce<Enclosing | undefined>(
      (best, type) => (best === undefined || type.open > best.open ? type : best),
      undefined,
    );
}

export function candidatesOf(name: string, text: string): string[] {
  const [first = '', ...rest] = name.split('.');
  const imported = importsOf(text).find((entry) => entry.split('.').at(-1) === first);
  if (imported !== undefined) {
    return [[imported, ...rest].join('.')];
  }
  const local = [packageOf(text), name].filter(Boolean).join('.');
  return /^[a-z]/u.test(first) ? [name, local] : [local];
}

export function declaredIn(
  roots: readonly string[],
  projectRoot: string,
): (qualified: string) => boolean {
  return (qualified) => {
    const parts = qualified.split('.');
    return parts.some((_, index) => {
      const file = parts.slice(0, parts.length - index).join('/');
      return (
        file !== '' &&
        roots.some((root) =>
          SOURCE_EXTENSIONS.some((extension) =>
            existsSync(pathInside(projectRoot, `${root}/${file}${extension}`)),
          ),
        )
      );
    });
  };
}

function isInFake(
  finding: FakeFinding,
  { projectRoot, mainRoots }: { projectRoot: string; mainRoots: readonly string[] },
): boolean {
  const text = readJavaSource(pathInside(projectRoot, finding.path));
  const line = finding.location?.line;
  if (text === undefined || line === undefined) {
    return false;
  }
  const start = offsetOf(text, { line });
  const call = WAIT_CALL.exec(text.slice(start).split('\n')[0] ?? '')?.index ?? 0;
  const type = enclosingType(text, start + call);
  if (type === undefined || TEST_ANNOTATION.test(text.slice(type.open, type.close))) {
    return false;
  }
  const isProduction = declaredIn(mainRoots, projectRoot);
  return type.supertypes
    .map((name) => name.trim())
    .filter(Boolean)
    .some((name) => candidatesOf(name, text).some(isProduction));
}

export function dropSleepsInFakes<Finding extends FakeFinding>(
  findings: Finding[],
  {
    rule,
    projectRoot,
    mainRoots,
  }: { rule: string; projectRoot: string | undefined; mainRoots: readonly string[] },
): Finding[] {
  if (projectRoot === undefined || !findings.some((finding) => finding.rule === rule)) {
    return findings;
  }
  return findings.filter(
    (finding) =>
      finding.tool !== 'pmd' ||
      finding.rule !== rule ||
      !isInFake(finding, { projectRoot, mainRoots }),
  );
}
