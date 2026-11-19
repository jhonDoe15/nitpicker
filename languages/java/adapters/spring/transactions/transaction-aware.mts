import { readFileSync } from 'node:fs';
import { pathInside, sourceFilesUnder } from '../../review-rules/java-sources.mts';
import type { JavaFinding } from '../../typed/java-values.mts';
import type { TransactionOptions } from './transaction-types.mts';

const SPRING_CACHE_RULE = 'SpringCacheWriteInTransaction';
const TRANSACTION_AWARE = new RegExp(
  [
    String.raw`\bTransactionAware(?:CacheManagerProxy|CacheDecorator)\b`,
    String.raw`\.transactionAware\(\s*\)`,
    String.raw`\bsetTransactionAware\(\s*true\s*\)`,
    String.raw`\bisTransactionAware\s*=\s*true\b`,
  ].join('|'),
  'u',
);
const COMMENTS = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu;

function configuresTransactionAwareCaches(projectRoot: string, roots: readonly string[]): boolean {
  return [...new Set(roots)]
    .flatMap((root) => sourceFilesUnder(pathInside(projectRoot, root), ['.java', '.kt']))
    .some((file) => TRANSACTION_AWARE.test(readFileSync(file, 'utf8').replaceAll(COMMENTS, '')));
}

export function withoutTransactionAwareCacheWrites<T extends JavaFinding>(
  findings: T[],
  { projectRoot, roots }: TransactionOptions,
): T[] {
  return findings.some(({ rule }) => rule === SPRING_CACHE_RULE) &&
    configuresTransactionAwareCaches(projectRoot, roots)
    ? findings.filter(({ rule }) => rule !== SPRING_CACHE_RULE)
    : findings;
}
