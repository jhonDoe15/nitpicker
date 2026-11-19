import path from 'node:path';
import {
  offsetOf,
  pathInside,
  readJavaSource,
  sourceFilesUnder,
  withoutGenerics,
  withoutNested,
} from '../../review-rules/java-sources.mts';
import { appendAll } from '../typed/shared-views.mts';
import { pmdFindingsKept } from '../typed/pmd-filter.mts';
import type { JavaFinding } from '../../typed/java-values.mts';
import type { ClassHeader, TransactionOptions } from './transaction-types.mts';

const INHERITING_RULES = new Set([
  'SpringMultiWriteWithoutTransaction',
  'SpringDataWriteWithoutTransaction',
]);
const MAX_ANCESTORS = 16;
const HEADER = /(?<!\.)\b(?:class|interface)\s+(\w+)/gu;
export const TRANSACTIONAL = /@(?:[\w.]*\.)?Transactional\b/u;
const PERMITS = /\bpermits\b[\s\S]*/u;
const SEPARATORS = /[\s,]+/u;
const KEYWORDS = new Set(['', 'extends', 'implements']);
const BRACES: Readonly<Record<string, number>> = { '{': 1, '}': -1 };
const PARENTHESES: Readonly<Record<string, number>> = { ')': 1, '(': -1 };
const BOUNDARIES = new Set([';', '{', '}']);

function closingBrace(text: string, open: number): number {
  let depth = 0;
  for (const [step, character] of text.slice(open).split('').entries()) {
    depth += BRACES[character] ?? 0;
    if (depth === 0) {
      return open + step;
    }
  }
  return text.length;
}

export function prefixOf(text: string, index: number): string {
  let depth = 0;
  let start = index;
  for (const character of text.slice(0, index).split('').reverse()) {
    depth += PARENTHESES[character] ?? 0;
    if (depth < 0 || (depth === 0 && BOUNDARIES.has(character))) {
      break;
    }
    start -= 1;
  }
  return text.slice(start, index);
}

function withoutArguments(text: string): string {
  return withoutNested(text, '(', ')');
}

function supertypes(tail: string): string[] {
  const plain = withoutGenerics(tail);
  const clause = /\b(?:extends|implements)\b/u.test(plain)
    ? plain
    : withoutArguments(plain).split(':').slice(1).join(' ');
  return clause
    .replace(PERMITS, '')
    .split(SEPARATORS)
    .filter((word) => !KEYWORDS.has(word))
    .map((name) => name.split('.').at(-1) ?? '');
}

function headers(text: string): ClassHeader[] {
  return [...text.matchAll(HEADER)].flatMap((match) => {
    const after = match.index + match[0].length;
    const open = text.indexOf('{', after);
    const semicolon = text.indexOf(';', after);
    if (open < 0 || (semicolon >= 0 && semicolon < open)) {
      return [];
    }
    return [
      {
        name: match[1] ?? '',
        transactional: TRANSACTIONAL.test(prefixOf(text, match.index)),
        supers: supertypes(text.slice(after, open)),
        start: match.index,
        end: closingBrace(text, open),
      },
    ];
  });
}

function classIndex(projectRoot: string, roots: readonly string[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const root of new Set(roots)) {
    for (const file of sourceFilesUnder(pathInside(projectRoot, root), ['.java'])) {
      const name = path.basename(file, '.java');
      index.set(name, [...(index.get(name) ?? []), file]);
    }
  }
  return index;
}

function declarationsOf(
  index: ReadonlyMap<string, string[]>,
  local: readonly ClassHeader[],
  name: string,
): ClassHeader[] {
  return [
    ...local,
    ...(index.get(name) ?? []).flatMap((file) => headers(readJavaSource(file) ?? '')),
  ].filter((header) => header.name === name);
}

function inheritsTransaction(
  index: ReadonlyMap<string, string[]>,
  local: readonly ClassHeader[],
  supers: readonly string[],
): boolean {
  const pending = [...supers];
  const seen = new Set<string>();
  for (const name of pending) {
    if (seen.has(name) || seen.size >= MAX_ANCESTORS) {
      continue;
    }
    seen.add(name);
    const declarations = declarationsOf(index, local, name);
    if (declarations.some(({ transactional }) => transactional)) {
      return true;
    }
    appendAll(
      pending,
      declarations.flatMap(({ supers }) => supers),
    );
  }
  return false;
}

export function withoutInheritedTransactions<T extends JavaFinding>(
  findings: T[],
  { projectRoot, roots }: TransactionOptions,
): T[] {
  return pmdFindingsKept(findings, {
    rules: (rule) => INHERITING_RULES.has(rule),
    build: () => classIndex(projectRoot, roots),
    keep: (finding, index) => {
      const text = readJavaSource(path.join(projectRoot, finding.path)) ?? '';
      const local = headers(text);
      const offset = offsetOf(text, { line: finding.location?.line ?? 1 });
      const owner = local.filter(({ start, end }) => start <= offset && offset <= end).at(-1);
      if (owner === undefined || owner.supers.length === 0) {
        return true;
      }
      return !inheritsTransaction(index(), local, owner.supers);
    },
  });
}
